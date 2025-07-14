/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-useless-catch */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable jsdoc/tag-lines */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sf-plugin/flag-case */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { SfCommand, Flags, Spinner } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import chalk from 'chalk';
import {
  TemplateValidateResult,
  sObjectSchemaType,
  templateSchema,
  sObjectMetaType,
  Types,
} from '../../../utils/types.js';

import { connectToSalesforceOrg } from '../../../utils/generic_function.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'template.validate');
dotenv.config();

/**
 * Normalizes the keys of the template object to a consistent camelCase format
 * and validates that no unknown keys are present. This allows for case-insensitive key parsing.
 * Collects all validation errors before throwing them, with invalid top-level keys in a single array.
 * @param rawConfig The raw object parsed from the JSON file.
 * @returns A configuration object that matches the templateSchema.
 * @throws An error with all validation issues if any are found.
 */
function normalizeAndValidateTemplate(rawConfig: any): templateSchema {
  // Define allowed keys at each level and their canonical camelCase form.
  const topLevelAllowedKeys: { [key: string]: string } = {
    namespacetoexclude: 'namespaceToExclude',
    outputformat: 'outputFormat',
    count: 'count',
    sobjects: 'sObjects',
  };

  const sObjectLevelAllowedKeys: { [key: string]: string } = {
    count: 'count',
    fieldstoconsider: 'fieldsToConsider',
    fieldstoexclude: 'fieldsToExclude',
    pickleftfields: 'pickLeftFields',
  };

  const normalizedConfig: { [key: string]: any } = {};
  const errors: string[] = [];
  const invalidTopLevelKeys: string[] = [];

  if (typeof rawConfig !== 'object' || rawConfig === null) {
    errors.push(chalk.red('Error: Template file content must be a valid JSON object.'));
  } else {
    for (const key in rawConfig) {
      const lowerKey = key.toLowerCase();
      if (topLevelAllowedKeys[lowerKey]) {
        normalizedConfig[topLevelAllowedKeys[lowerKey]] = rawConfig[key];
      } else {
        invalidTopLevelKeys.push(key);
      }
    }

    if (invalidTopLevelKeys.length > 0) {
      errors.push(
        chalk.red('The template contains invalid keys: ') +
        chalk.yellow(`[${invalidTopLevelKeys.map((key) => `'${key}'`).join(', ')}]`) +
        chalk.white('. ') +
        chalk.white('Allowed keys are: ') +
        chalk.green('namespaceToExclude, outputFormat, count, sObjects')
      );
    }

    const sObjects = normalizedConfig.sObjects;
    if (sObjects === undefined) {
      errors.push(chalk.red("Error: The template must contain an 'sObjects' key."));
    } else if (!Array.isArray(sObjects)) {
      errors.push(chalk.red("Error: The value for 'sObjects' must be an array."));
    } else {
      const invalidKeysPerSObject: Record<string, string[]> = {};

      normalizedConfig.sObjects = sObjects.map((sObjectEntry: any, index: number) => {
        if (typeof sObjectEntry !== 'object' || sObjectEntry === null || Object.keys(sObjectEntry).length !== 1) {
          errors.push(
            chalk.red(`Error: Invalid entry in 'sObjects' array at index ${index}. Each entry must have a single key.`)
          );
          return sObjectEntry;
        }

        const sObjectName = Object.keys(sObjectEntry)[0];
        const sObjectDataRaw = sObjectEntry[sObjectName];

        if (typeof sObjectDataRaw !== 'object' || sObjectDataRaw === null) {
          errors.push(chalk.red(`Error: The value for SObject '${sObjectName}' must be a JSON object.`));
          return sObjectEntry;
        }

        const normalizedSObjectData: { [key: string]: any } = {};

        for (const key in sObjectDataRaw) {
          const lowerKey = key.toLowerCase();
          if (sObjectLevelAllowedKeys[lowerKey]) {
            normalizedSObjectData[sObjectLevelAllowedKeys[lowerKey]] = sObjectDataRaw[key];
          } else {
            if (!invalidKeysPerSObject[sObjectName]) {
              invalidKeysPerSObject[sObjectName] = [];
            }
            invalidKeysPerSObject[sObjectName].push(key);
          }
        }

        if (normalizedSObjectData.pickLeftFields !== undefined) {
          const pickLeftValue = normalizedSObjectData.pickLeftFields;
          const lowerPickLeftValue = typeof pickLeftValue === 'string' ? pickLeftValue.toLowerCase() : pickLeftValue;
          if (lowerPickLeftValue === true) {
            normalizedSObjectData.pickLeftFields = true;
          } else if (lowerPickLeftValue === false) {
            normalizedSObjectData.pickLeftFields = false;
          } else {
            errors.push(
              chalk.red('Error: ') +
              chalk.white("'") +
              chalk.yellow('pickLeftFields') +
              chalk.white(' for SObject ') +
              chalk.cyan.bold(`${sObjectName}. `) +
              chalk.white('must be a boolean value (true or false), but received: ') +
              chalk.magentaBright(`'${pickLeftValue}'`)

            );
          }
        }

        return { [sObjectName]: normalizedSObjectData };
      });

      for (const [sObjectName, invalidKeys] of Object.entries(invalidKeysPerSObject)) {
        errors.push(
          chalk.red('Error: Invalid keys ') +
          chalk.yellow(`['${invalidKeys.join("', '")}']`) +
          chalk.red(' for SObject ') + chalk.yellow(`${sObjectName}. `) +
          chalk.white('Valid keys are: ') + chalk.green(Object.values(sObjectLevelAllowedKeys).join(', '))
        );
      }
    }
  }



  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return normalizedConfig as templateSchema;
}

export async function validateConfigJson(connection: Connection, configPath: string): Promise<boolean> {
  let isDataValid: boolean = true;
  const spinner = new Spinner(true);
  let isObjFieldsMissing: boolean = false;
  const objectFieldsMissing: string[] = [];
  spinner.start('Please wait!! while we validate Objects and Fields');

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const config = normalizeAndValidateTemplate(rawConfig);

    const invalidObjects: string[] = [];
    const invalidFieldsMap: { [key: string]: string[] } = {};

    const sObjectNames: string[] = config.sObjects.map((sObjectEntry: sObjectSchemaType) => Object.keys(sObjectEntry)[0]);

    if (sObjectNames.length === 0) {
      console.log(chalk.yellow('Warning: No SObjects found in the template configuration file.'));
      return true; // No objects to validate
    }

    const metadata = await connection.metadata.read('CustomObject', sObjectNames);
    const metadataArray = Array.isArray(metadata) ? metadata : [metadata];

    for (const sObjectEntry of config.sObjects) {
      const [sObjectName, sObjectData] = Object.entries(sObjectEntry)[0] as [string, sObjectSchemaType];
      const sObjectMeta = metadataArray.find((meta) => meta.fullName === sObjectName) as sObjectMetaType;

      if (!sObjectMeta) {
        invalidObjects.push(sObjectName);
        continue;
      }

      // Access normalized keys. Provide fallbacks for optional properties.
      const fieldsToExclude = (sObjectData.fieldsToExclude ?? []).map((f) => String(f).toLowerCase());
      const fieldsToConsider = sObjectData.fieldsToConsider ?? {};

      const fieldsToConsiderArray = Object.keys(fieldsToConsider).map((field) =>
        field.startsWith('dp-') ? field.substring(3) : field
      );
      const commonFields = fieldsToConsiderArray.filter((field) => fieldsToExclude.includes(field.toLowerCase()));

      if (commonFields.length > 0) {
        throw new Error(
          chalk.red(
            `Error: The following fields are present in both 'fieldsToConsider' and 'fieldsToExclude' for ${sObjectName}: ${commonFields.join(
              ', '
            )}`
          )
        );
      }

      if (
        (sObjectData.pickLeftFields === false || sObjectData.pickLeftFields === undefined) &&
        sObjectData.fieldsToConsider !== undefined &&
        Object.keys(fieldsToConsider).length === 0
      ) {
        isObjFieldsMissing = true;
        objectFieldsMissing.push(sObjectName);
      }

      const getAllFields: string[] = sObjectMeta.fields
        ? sObjectMeta.fields
          .filter((field: Types.Field) => field.fullName != null)
          .map((field: Types.Field) => field.fullName!.toLowerCase())
        : [];

      if (sObjectMeta.nameField) {
        getAllFields.push('name');
      }

      if (sObjectName.toLowerCase() === 'contact') {
        getAllFields.push('lastname', 'firstname', 'salutation');
      }
      const invalidFieldsInConisder = Object.keys(fieldsToConsider).filter((field) => {
        // checking for dependent picklist fields(dp-) in the schema

        const fieldCheck = field.startsWith('dp-') ? field.substring(3) : field;
        return !getAllFields.includes(fieldCheck.toLowerCase());
      });

      const invalidFieldsInExclude = fieldsToExclude.filter((field: string) => !getAllFields.includes(field));

      const allInvalidFields = [...invalidFieldsInExclude, ...invalidFieldsInConisder];

      if (allInvalidFields.length > 0) {
        invalidFieldsMap[sObjectName] = allInvalidFields;
      }
    }
    spinner.stop('');

    if (isObjFieldsMissing && objectFieldsMissing.length > 0) {
      throw new Error(
        chalk.yellow(
          `Warning: [${objectFieldsMissing.join(
            ','
          )}] No fields are found to generate data. Make sure to set 'pickLeftFields' to 'true' or add fields to 'fieldsToConsider'`
        )
      );
    }

    if (invalidObjects.length > 0) {
      console.warn(
        chalk.magenta(`Error: SObjects do not exist or cannot be accessed:\n -> ${invalidObjects.join(', ')}`)
      );
      isDataValid = false;
    }

    if (Object.keys(invalidFieldsMap).length > 0) {
      console.warn(chalk.magenta('Warning: Fields do not exist or cannot be accessed:'));
      for (const [sObjectName, fields] of Object.entries(invalidFieldsMap)) {
        console.warn(chalk.magenta(` -> ${sObjectName}: ${fields.join(', ')}`));
      }
      isDataValid = false;
    }

    if (Object.keys(invalidFieldsMap).length > 0 || invalidObjects.length > 0) {
      throw new Error(
        chalk.bold.magenta(
          'Note: We will still attempt to populate data based on the valid parts of your template. You can correct the invalid entries in the data template file.'
        )
      );
    } else {
      console.log(
        chalk.green(`Successfully validated '${path.basename(configPath)}' and no invalid object/fields were found!`)
      );
    }

    return isDataValid;
  } catch (error: any) {
      throw error.name === 'Error' ? error : new Error(chalk.red(`${error.message}`));
  }

}

export default class TemplateValidate extends SfCommand<TemplateValidateResult> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      char: 't',
      required: true,
    }),
    sObjects: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObjects.summary'),
      required: false,
    }),
    alias: Flags.string({
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      char: 'a',
      required: true,
    }),
  };

  public async run(): Promise<TemplateValidateResult> {
    const { flags } = await this.parse(TemplateValidate);

    const currWorkingDir = process.cwd();
    const sanitizeFilename = flags['templateName'].endsWith('.json')
      ? flags['templateName']
      : flags['templateName'] + '.json';
    const templateDirPath = path.join(currWorkingDir, `data_gen/templates/${sanitizeFilename}`);
    const userNameOrAlias = flags.alias;
    if (fs.existsSync(templateDirPath)) {
      const connection = await connectToSalesforceOrg(userNameOrAlias);
      console.log(chalk.cyan('Success: SF Connection established.'));
      await validateConfigJson(connection, templateDirPath);
    } else {
      throw new Error(`File: ${flags['templateName']} is not present at this path: ${templateDirPath}`);
    }

    return {
      path: 'src/commands/template/validate.ts',
    };
  }
}
