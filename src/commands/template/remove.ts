/* eslint-disable sf-plugin/flag-case */
import fs from 'node:fs';
import path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { error } from '@oclif/core/errors';
import chalk from 'chalk';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'template.remove');

export type TemplateRemoveResult = {
  path: string;
};

export type templateSchema = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: Array<{ [key: string]: typeSObjectSettingsMap }>;
};

type typeSObjectSettingsMap = {
  fieldsToExclude?: string[];
  count?: number;
  language?: string;
};

function deleteSObjectField(jsonData: templateSchema, sObjectName: string, fieldName: string): templateSchema {
  const sObject = jsonData.sObjects.find((obj) => Object.prototype.hasOwnProperty.call(obj, sObjectName)) as {
    [key: string]: typeSObjectSettingsMap;
  };

  if (sObject?.[sObjectName]) {
    if (Object.prototype.hasOwnProperty.call(sObject[sObjectName], fieldName)) {
      console.log(`Removing '${fieldName}' from the sobject ${sObjectName} settings.`);
      delete sObject[sObjectName][fieldName as keyof typeSObjectSettingsMap];
    } else {
      throw new Error(`The specified flag '${fieldName}' does not exist in the '${sObjectName}' sObject.`);
    }
  } else {
    throw error(`'The '${sObjectName}' does not exist in the sobjects settings.`);
  }
  return jsonData;
}

function DeletesObject(jsonData: templateSchema, sObjectNames: string[]): templateSchema {
  sObjectNames.map((sObjectName) => {
    const sObjectIndex = jsonData.sObjects.findIndex((obj) =>
      Object.prototype.hasOwnProperty.call(obj, sObjectName.toLocaleLowerCase())
    );

    if (sObjectIndex === -1) {
      throw new Error(`The specified sObject '${sObjectName}' does not exist in the data template file.`);
    }

    jsonData.sObjects.splice(sObjectIndex, 1);
  });

  console.log(chalk.green(`Object '${sObjectNames.join(', ')}' has been removed from the data template file.`));

  return jsonData;
}

function parseInput(input: string[]): string[] {
  return input
    .join('')
    .split(/[\s,]+/)
    .filter((item) => item.length > 0);
}

function DeleteArrayValue(
  jsonData: templateSchema,
  fieldName: keyof templateSchema,
  fieldValues: string[]
): templateSchema {
  const updatedJsonData = { ...jsonData };

  if (fieldName === 'namespaceToExclude' || fieldName === 'outputFormat') {
    if (Object.prototype.hasOwnProperty.call(jsonData, fieldName)) {
      const myArray: string[] = jsonData[fieldName];

      const valuesNotInJSON: string[] = fieldValues.filter(
        (item) => !myArray.map((str) => str.toLowerCase()).includes(item.toLowerCase())
      );
      if (valuesNotInJSON.length > 0) {
        throw new Error(`Values '${valuesNotInJSON.join(', ')}' do not exist in the ${fieldName}. `);
      }
      if (Array.isArray(myArray)) {
        const updatedArray: string[] = myArray.filter(
          (item): item is string =>
            typeof item === 'string' && !fieldValues.map((value) => value.toLowerCase()).includes(item.toLowerCase())
        );

        updatedJsonData[fieldName] = updatedArray;

        if (fieldName === 'outputFormat' && updatedArray.length === 0) {
          throw new Error(
            "Error: All the values from 'output-format' cannot be deleted! You must leave at least one value."
          );
        }

        console.log(`Removing '${fieldValues.join(', ')}' from the ${fieldName}.`);
      }
    } else {
      throw error(`${fieldName} does not exist in the data template.`);
    }
  }
  return updatedJsonData;
}

function DeleteSObjectArrayValue(jsonData: templateSchema, sObjectName: string, fieldValues: string[]): templateSchema {
  const concernedObject = jsonData.sObjects.find((obj) => Object.prototype.hasOwnProperty.call(obj, sObjectName));
  if (!concernedObject) {
    throw new Error(`The specified sObject '${sObjectName}' does not exist in the data template file.`);
  }
  if (concernedObject) {
    const existingValues = concernedObject[sObjectName]?.['fieldsToExclude'];
    if (existingValues !== undefined) {
      const valuesNotInJSON: string[] = fieldValues.filter(
        (item) => !existingValues.map((val) => val.toLowerCase()).includes(item.toLowerCase())
      );
      if (valuesNotInJSON.length > 0) {
        throw new Error(
          `Values '${valuesNotInJSON.join(
            ', '
          )}' do not exist in the 'fieldsToExclude' of sobject '${sObjectName}' settings `
        );
      }
      const updatedArray = existingValues.filter(
        (item) => !fieldValues.map((val) => val.toLowerCase()).includes(item.toLowerCase())
      );
      console.log(
        `Removing '${fieldValues.join(', ')}' from the 'fieldsToExclude' of sobject '${sObjectName}' settings.`
      );
      concernedObject[sObjectName]['fieldsToExclude'] = updatedArray;
    } else {
      throw new Error(`The 'fields-to-exclude' does not exist for sobject '${sObjectName}' settings.`);
    }
  }
  return jsonData;
}

export default class TemplateRemove extends SfCommand<TemplateRemoveResult> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      char: 't',
      required: true,
    }),
    sObject: Flags.string({
      summary: messages.getMessage('flags.sObject.summary'),
      description: messages.getMessage('flags.sObject.description'),
      char: 's',
    }),
    language: Flags.boolean({
      summary: messages.getMessage('flags.language.summary'),
      description: messages.getMessage('flags.language.description'),
      char: 'l',
    }),
    count: Flags.boolean({
      summary: messages.getMessage('flags.count.summary'),
      description: messages.getMessage('flags.count.description'),
      char: 'c',
    }),
    namespaceToExclude: Flags.string({
      summary: messages.getMessage('flags.namespaceToExclude.summary'),
      description: messages.getMessage('flags.namespaceToExclude.description'),
      char: 'x',
      multiple: true,
    }),
    outputFormat: Flags.string({
      summary: messages.getMessage('flags.outputFormat.summary'),
      description: messages.getMessage('flags.outputFormat.description'),
      char: 'f',
      multiple: true,
    }),
    fieldsToExclude: Flags.string({
      summary: messages.getMessage('flags.fieldsToExclude.summary'),
      description: messages.getMessage('flags.fieldsToExclude.description'),
      char: 'e',
      multiple: true,
    }),
  };

  public async run(): Promise<TemplateRemoveResult> {
    const { flags } = await this.parse(TemplateRemove);
    const flagKeys = Object.keys(flags);

    const templateName = flags.templateName;
    const filename = templateName.endsWith('.json') ? templateName : `${templateName}.json`;
    if (!filename) {
      this.error('Error: You must specify a filename using the --template-name flag.');
    }
    const templateDirPath = path.join(process.cwd(), 'data_gen/templates');
    if (!fs.existsSync(templateDirPath)) {
      this.error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
    }
    const configFilePath = path.join(templateDirPath, filename);
    if (!fs.existsSync(configFilePath)) {
      this.error(`Data Template file not found at ${configFilePath}`);
    }

    let jsonData = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as templateSchema;

    if (flagKeys.length === 1 && flagKeys.includes('templateName')) {
      this.error('Error: Data Template File cannot be deleted! You must specify at least one setting flag to remove');
    }

    if (!flags.sObject) {
      if (flags.fieldsToExclude !== undefined || flags.count || flags.language) {
        const errorMessage = flags.count
          ? 'Default count can not be deleted! You can update instead.'
          : 'Default language can not be deleted! You can update instead.';

        throw new Error(errorMessage);
      }
      if (flags.namespaceToExclude) {
        jsonData = DeleteArrayValue(jsonData, 'namespaceToExclude', parseInput(flags.namespaceToExclude));
      }
      if (flags.outputFormat) {
        jsonData = DeleteArrayValue(jsonData, 'outputFormat', parseInput(flags.outputFormat));
      }
    } else {
      if (flags.namespaceToExclude !== undefined || flags.outputFormat !== undefined) {
        const errorMessage = flags.namespaceToExclude
          ? 'You cannot use global flag "namespaceToExclude" with an SObject flag.'
          : 'You cannot use global flag "outputFormat" with an SObject flag.';

        throw new Error(errorMessage);
      }

      const sObject = flags.sObject;
      if (flags.count) {
        jsonData = deleteSObjectField(jsonData, sObject.toLowerCase(), 'count');
      }
      if (flags.language) {
        jsonData = deleteSObjectField(jsonData, sObject.toLowerCase(), 'language');
      }
      if (flags.fieldsToExclude) {
        jsonData = DeleteSObjectArrayValue(jsonData, sObject.toLowerCase(), parseInput(flags.fieldsToExclude));
      }
      if (!flags.count && !flags.language && !flags.fieldsToExclude) {
        const sObjectNames = parseInput([sObject]);
        jsonData = DeletesObject(jsonData, sObjectNames);
      }
    }
    fs.writeFileSync(configFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
    this.log(chalk.green(`Success: Configuration updated in data template file ${configFilePath}`));

    return {
      path: 'src/commands/template/remove.ts',
    };
  }
}
