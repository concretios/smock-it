/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'node:fs';
import path from 'node:path';

import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import chalk from 'chalk';
import { askQuestion } from './init.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'template.upsert');

export type TemplateAddResult = {
  path: string;
};

type typeSObjectSettingsMap = {
  fieldsToExclude?: string[];
  count?: number;
  language?: string;
};

type SObjectItem = { [key: string]: typeSObjectSettingsMap };

type templateSchema = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: SObjectItem[];
};
type tempAddFlags = {
  sObjects?: string;
  templateName: string;
  language?: string;
  count?: number;
  namespaceToExclude?: string;
  outputFormat?: string;
  fieldsToExclude?: string;
};
export function updateOrInitializeConfig(
  configObject: any,
  flags: tempAddFlags,
  allowedFlags: string[],
  log: (message: string) => void
): void {
  const arrayFlags = ['namespaceToExclude', 'outputFormat', 'fieldsToExclude'];

  for (const [key, value] of Object.entries(flags)) {
    if (allowedFlags.includes(key) && value !== undefined) {
      // Checking if values need to be converted to an string[]
      if (arrayFlags.includes(key) && typeof value === 'string') {
        const valuesArray = value
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean);
        // Push to array if it exists else assign to new
        if (key === 'outputFormat') {
          if (!valuesArray.every((format) => ['csv', 'json', 'di'].includes(format))) {
            throw new Error(chalk.red('Invalid output format passed. supports `csv`, `json` and `di` only'));
          } else if (
            valuesArray.includes('di') &&
            (configObject['count'] > 200 ||
              configObject['sObjects'].some(
                (obj: { [x: string]: { count: number } }) => obj[Object.keys(obj)[0]]?.count > 200
              ))
          ) {
            throw new Error(
              chalk.red('All count values should be within 1-200 to add DI-Direct Insertion in template')
            );
          }
        }

        if (Array.isArray(configObject[key])) {
          valuesArray.forEach((item: string) => {
            if (item && !configObject[key].includes(item)) {
              configObject[key].push(item);
            }
          });
        } else {
          configObject[key] = valuesArray;
        }

        log(`Updated '${key}' to: ${configObject[key].join(', ')}`);
      } else {
        if (key === 'language' && value !== 'en' && value !== 'jp') {
          throw new Error('Invalid language input. supports `en` or `jp` only');
        }

        if (
          key === 'count' &&
          ((value as number) < 1 || ((value as number) > 200 && config.outputFormat.includes('di')))
        ) {
          throw new Error(
            'Invalid input. Please enter a Value between 1-200 for DI and for CSV and JSON value greater than 0'
          );
        }

        configObject[key] = value;
        log(`Setting '${key}' to: ${configObject[key]}`);
      }
    } else if (!['sObject', 'templateName'].includes(key)) {
      log(chalk.yellow(`Skipped: '${key}' flag can not be passed in the current command`));
    }
  }
}
export const templateAddFlags = {
  sObject: Flags.string({
    char: 's',
    summary: messages.getMessage('flags.sObject.summary'),
    description: messages.getMessage('flags.sObject.description'),
    required: false,
  }),
  templateName: Flags.string({
    char: 't',
    summary: messages.getMessage('flags.templateName.summary'),
    description: messages.getMessage('flags.templateName.description'),
    required: true,
  }),
  language: Flags.string({
    char: 'l',
    summary: messages.getMessage('flags.language.summary'),
    description: messages.getMessage('flags.language.description'),
    required: false,
  }),
  count: Flags.integer({
    char: 'c',
    summary: messages.getMessage('flags.count.summary'),
    description: messages.getMessage('flags.count.description'),
    required: false,
  }),
  namespaceToExclude: Flags.string({
    char: 'x',
    summary: messages.getMessage('flags.namespaceToExclude.summary'),
    description: messages.getMessage('flags.namespaceToExclude.description'),
    required: false,
  }),
  outputFormat: Flags.string({
    char: 'f',
    summary: messages.getMessage('flags.outputFormat.summary'),
    description: messages.getMessage('flags.outputFormat.description'),
    required: false,
  }),
  fieldsToExclude: Flags.string({
    char: 'e',
    summary: messages.getMessage('flags.fieldsToExclude.summary'),
    description: messages.getMessage('flags.fieldsToExclude.description'),
    required: false,
  }),
};

let config: templateSchema;
export default class TemplateAdd extends SfCommand<void> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = templateAddFlags;

  public async run(): Promise<void> {
    const { flags } = await this.parse(TemplateAdd);

    let filename = flags.templateName;
    if (!filename) {
      this.error('Error: You must specify a filename using the --templateName flag.');
    } else if (!filename.endsWith('.json')) {
      filename += '.json';
    }

    const objectName = flags.sObject ? flags.sObject.toLowerCase() : undefined;

    try {
      // Variable Declarations and validatons
      const cwd = process.cwd();
      const dataGenDirPath = path.join(cwd, 'data_gen');

      const templateDirPath = path.join(dataGenDirPath, 'templates');
      if (!fs.existsSync(templateDirPath)) {
        this.error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
      }

      const configFilePath = path.join(templateDirPath, filename);
      if (!fs.existsSync(configFilePath)) {
        this.error(`Config file not found at ${configFilePath}`);
      }

      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as templateSchema;
      let allowedFlags = [];

      // Checking if Object Flag is passed or not

      if (objectName) {
        this.log(chalk.magenta.bold(`Working on the object level settings for ${objectName}`));
        if (!Array.isArray(config.sObjects)) {
          config.sObjects = [];
        }
        let objectConfig = config.sObjects.find(
          (obj: SObjectItem): boolean => Object.keys(obj)[0] === objectName
        ) as SObjectItem;
        if (!objectConfig) {
          const addToTemplate = await askQuestion(
            chalk.yellow(`'${objectName}' does not exists in data template! Do you want to add?`) + chalk.dim('(Y/n)')
          );
          if (addToTemplate.toLowerCase() === 'yes' || addToTemplate.toLowerCase() === 'y') {
            objectConfig = { [objectName]: {} };
            config.sObjects.push(objectConfig);
          } else {
            return;
          }
        }
        const configFileForSobject: typeSObjectSettingsMap = objectConfig[objectName];
        allowedFlags = ['fieldsToExclude', 'language', 'count'];
        updateOrInitializeConfig(configFileForSobject, flags, allowedFlags, this.log.bind(this));
      } else {
        const configFile: templateSchema = config;
        allowedFlags = ['outputFormat', 'namespaceToExclude', 'language', 'count'];
        updateOrInitializeConfig(configFile, flags, allowedFlags, this.log.bind(this));
      }

      // updateOrInitializeConfig(configFile, flags, allowedFlags, this.log.bind(this));
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
      this.log(chalk.green(`Success: Configuration updated in ${configFilePath}`));
    } catch (error) {
      this.error(`Process halted: ${(error as Error).message}`);
    }
  }
}
