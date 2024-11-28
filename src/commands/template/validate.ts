/* eslint-disable sf-plugin/flag-case */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection, Org } from '@salesforce/core';
import chalk from 'chalk';
import { loading, LoaderActions } from 'cli-loading-animation';
import Spinner from 'cli-spinners';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'template.validate');

type TemplateValidateResult = {
  path: string;
};

type sObjectSchemaType = {
  fieldsToExclude?: string[];
  count?: number;
  language?: string;
};

type SObjectItem = { [key: string]: sObjectSchemaType };

type templateSchema = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: SObjectItem[];
};

type Field = {
  fullName: string | null | undefined;
};

type sObjectMetaType = {
  nameField?: { label: string; type: string };
  fields?: Field[];
};

dotenv.config();
export async function getConnectionWithSalesforce(): Promise<Connection> {
  let unableToConnect: boolean = false;
  const missingValues: string[] = [];
  for (const envVar of ['SALESFORCE_USERNAME', 'SALESFORCE_PASSWORD', 'SALESFORCE_SECURITY_TOKEN']) {
    if (process.env[envVar] === undefined || process.env[envVar] == null) {
      missingValues.push(envVar);
      unableToConnect = true;
    }
  }

  if (unableToConnect) {
    throw new Error(chalk.red('You must set environment variable: ') + chalk.white.bold(`${missingValues.join(', ')}`));
  }

  const username = process.env.SALESFORCE_USERNAME;
  const password = process.env.SALESFORCE_PASSWORD;
  const securityToken = process.env.SALESFORCE_SECURITY_TOKEN;

  try {
    const org = await Org.create({ aliasOrUsername: username });
    const conn = org.getConnection();
    await conn.login(username!, password! + securityToken!);
    return conn;
  } catch (error) {
    throw new Error(`${chalk.red('Failed to establish SF Connection.\n')}${String(error)}`);
  }
}

export async function validateConfigJson(connection: Connection, configPath: string): Promise<void> {
  try {
    const actions: LoaderActions = loading('\nPlease wait!! while we validate Objects and Fields from connected org.', {
      clearOnEnd: true,
      spinner: Spinner.bouncingBar,
    });

    const start: () => void = () => actions.start();
    const stop: () => void = () => actions.stop();

    start();
    const config: templateSchema = JSON.parse(fs.readFileSync(configPath, 'utf8')) as templateSchema;

    const invalidObjects: string[] = [];
    const invalidFieldsMap: { [key: string]: string[] } = {};

    const sObjectNames: string[] = config.sObjects.map(
      (sObjectEntry: sObjectSchemaType) => Object.keys(sObjectEntry)[0]
    );

    const metadata = await connection.metadata.read('CustomObject', sObjectNames);
    const metadataArray = Array.isArray(metadata) ? metadata : [metadata];

    for (const sObjectEntry of config.sObjects) {
      const [sObjectName, sObjectData] = Object.entries(sObjectEntry)[0] as [string, sObjectSchemaType];
      const sObjectMeta = metadataArray.find((meta) => meta.fullName === sObjectName) as sObjectMetaType;

      if (!sObjectMeta) {
        invalidObjects.push(sObjectName);
        continue;
      }

      const getAllFields: string[] = sObjectMeta.fields
        ? sObjectMeta.fields
            .filter((field: Field) => field.fullName != null)
            .map((field: Field) => field.fullName!.toLowerCase())
        : [];

      /*
      handling the name field for the custom object
      */
      if (sObjectMeta.nameField) {
        getAllFields.push('name');
      }

      const fieldsToExclude = sObjectData['fieldsToExclude'] ?? [];

      const invalidFields = fieldsToExclude.filter((field: string) => !getAllFields.includes(field));
      if (invalidFields.length > 0) {
        invalidFieldsMap[sObjectName] = invalidFields;
      }
    }
    stop();

    if (invalidObjects.length > 0) {
      console.warn(
        chalk.magenta(`Warning: SObjects do not exist or cannot be accessed:\n -> ${invalidObjects.join(', ')}`)
      );
    }

    if (Object.keys(invalidFieldsMap).length > 0) {
      console.warn(chalk.magenta('Warning: Fields do not exist or cannot be accessed:'));
      for (const [sObjectName, fields] of Object.entries(invalidFieldsMap)) {
        setTimeout(() => fields, 5000);
        console.warn(chalk.magenta(` -> ${sObjectName}: ${fields.join(', ')}`));
      }
    }

    if (Object.keys(invalidFieldsMap).length > 0 || invalidObjects.length > 0) {
      console.warn(
        chalk.bold.magenta(
          'Note: Still we keep these populated these values, You can change them anytime from the data template!'
        )
      );
    } else {
      console.log(
        chalk.green(`Successfully validated '${path.basename(configPath)}' and no invalid object/fields were found!`)
      );
    }
  } catch (err) {
    console.error('Error: While validating config JSON.', err);
  }
}

export class TemplateValidate extends SfCommand<TemplateValidateResult> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      char: 't',
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

    if (fs.existsSync(templateDirPath)) {
      const connection = await getConnectionWithSalesforce();
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
