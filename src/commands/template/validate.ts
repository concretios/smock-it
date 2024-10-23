/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-underscore-dangle */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable sf-plugin/command-summary */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable eqeqeq */
/* eslint-disable import/no-extraneous-dependencies */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection, Org } from '@salesforce/core';
import chalk from 'chalk';
import { loading } from 'cli-loading-animation';
import Spinner from 'cli-spinners';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker', 'template.validate');

export type TemplateValidateResult = {
  path: string;
};

dotenv.config();
export async function getConnectionWithSalesforce(): Promise<Connection> {
  let unableToConnect: boolean = false;
  const missingValues: string[] = [];
  for (const envVar of ['SALESFORCE_USERNAME', 'SALESFORCE_PASSWORD', 'SALESFORCE_SECURITY_TOKEN']) {
    if (process.env[envVar] == undefined || process.env[envVar] == null) {
      missingValues.push(envVar);
      unableToConnect = true;
    }
  }

  if (unableToConnect) {
    throw new Error(chalk.red('You must set environment variable: ') + chalk.white.bold(`${missingValues}`));
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
    throw new Error(chalk.red('Failed to establish SF Connection.\n') + error);
  }
}

export const validateConfigJson = async (connection: Connection, configPath: string) => {
  try {
    const { start, stop } = loading('\nPlease wait!! while we validate Objects and Fields from connected org.', {
      clearOnEnd: true,
      spinner: Spinner.bouncingBar,
    });
    start();
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    const invalidObjects: string[] = [];
    const invalidFieldsMap: { [key: string]: string[] } = {};

    const sObjectNames = config.sObjects.map((sObjectEntry: any) => Object.keys(sObjectEntry)[0]);

    const metadata = await connection.metadata.read('CustomObject', sObjectNames);
    const metadataArray = Array.isArray(metadata) ? metadata : [metadata];

    for (const sObjectEntry of config.sObjects) {
      const [sObjectName, sObjectData] = Object.entries(sObjectEntry)[0] as [string, any];
      const sObjectMeta = metadataArray.find((meta) => meta.fullName === sObjectName);

      if (!sObjectMeta) {
        invalidObjects.push(sObjectName);
        continue;
      }

      const getAllFields = sObjectMeta.fields
        ? sObjectMeta.fields.map((field: any) => field.fullName.toLowerCase())
        : [];
      const fieldsToExclude = sObjectData['fieldsToExclude'] || [];
      const invalidFields = fieldsToExclude.filter((field: string) => !getAllFields.includes(field));
      if (invalidFields.length > 0) {
        invalidFieldsMap[sObjectName] = await invalidFields;
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
};

export class TemplateValidate extends SfCommand<TemplateValidateResult> {
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
    const __cwd = process.cwd();
    const templateDirPath = path.join(__cwd, `data_gen/templates/${flags.templateName}`);

    if (fs.existsSync(templateDirPath)) {
      const connection = await getConnectionWithSalesforce();
      console.log(chalk.cyan('Success: SF Connection established.'));
      await validateConfigJson(connection, templateDirPath);
    } else {
      throw new Error(`File: ${flags.templateName} is not present at this path: ${templateDirPath}`);
    }

    return {
      path: 'src/commands/template/validate.ts',
    };
  }
}
