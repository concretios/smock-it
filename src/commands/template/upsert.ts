/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable sf-plugin/no-missing-messages */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'node:fs';
import path from 'node:path';

import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { error } from '@oclif/core/errors';
import chalk from 'chalk';
import {
  templateSchema,
  tempAddFlags,
  typeSObjectSettingsMap,
  SObjectItem,
  fieldsToConsiderMap,
} from '../../utils/types.js';
import { askQuestion } from './init.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'template.upsert');

export function handleFieldsToConsider(sObjectConfig: typeSObjectSettingsMap, input: string): typeSObjectSettingsMap {
  if (!sObjectConfig.fieldsToConsider) {
    sObjectConfig.fieldsToConsider = {};
  }

  const fieldsToConsider: fieldsToConsiderMap = sObjectConfig.fieldsToConsider;

  const regex = /([\w-]+):\s*(\[[^\]]*\])|([\w-]+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    const key = (match[1] || match[3]).toLowerCase();
    const value = match[2];
    if (key && value) {
      const fieldValues = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));

      const fieldValuesSet = new Set([...(fieldsToConsider[key] || []), ...fieldValues]);
      fieldsToConsider[key] = Array.from(fieldValuesSet);
    } else {
      fieldsToConsider[key] = [];
    }

    if (key.startsWith('dp-')) {
      if (value) {
        const dpfieldValue = value.slice(1, -1).trim();
        fieldsToConsider[key] = [dpfieldValue];
      } else {
        fieldsToConsider[key] = [];
      }
    }
  }

  return sObjectConfig;
}
function checkDuplicateFields(configObject: any, flags: tempAddFlags): void {
  if (!Object.keys(flags).includes('fieldsToExclude') && !Object.keys(flags).includes('fieldsToConsider')) {
    return;
  }
  let fieldsToExcludeValues: string[] = configObject?.fieldsToExclude ? configObject?.fieldsToExclude : [];
  let fieldsToConsiderKeys: string[] = configObject?.fieldsToConsider
    ? Object.keys(configObject?.fieldsToConsider)
    : [];
  for (const [key, value] of Object.entries(flags)) {
    let valuesArray: string[] = [];
    if (key === 'fieldsToExclude' && typeof value === 'string') {
      valuesArray = value
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean);
    } else if (key === 'fieldsToConsider' && typeof value === 'string') {
      if (value.includes(':')) {
        const keyValueRegex = /(\w+):/g; // Matches keys followed by ':'
        const keys: string[] = [];
        let match;
        while ((match = keyValueRegex.exec(value)) !== null) {
          keys.push(match[1]); // Extract and collect keys
        }
        valuesArray = keys;
      } else {
        // Process the comma-separated list
        valuesArray = value.split(',').map((t) => t.trim());
      }
    }
    if (key === 'fieldsToExclude') {
      fieldsToExcludeValues = fieldsToExcludeValues.concat(valuesArray);
    } else if (key === 'fieldsToConsider') {
      fieldsToConsiderKeys = fieldsToConsiderKeys.concat(valuesArray);
    }
  }
  const commonValues = fieldsToConsiderKeys.filter((val) => fieldsToExcludeValues.includes(val));
  if (commonValues.length > 0) {
    throw new Error(
      `Please do not add Common value ${commonValues.join(
        ', '
      )} in fieldsToConsider and fieldsToExclude, Please ensure no overlap between them.`
    );
  }
}
/* Handling all array input in the data template*/
export function updateArrayValueInput(
  key: string,
  value: string,
  configObject: any,
  log: (message: string) => void
): void {
  const valuesArray = value
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

  if (key === 'outputFormat' && !valuesArray.every((format) => ['csv', 'json', 'di'].includes(format))) {
    throw new Error(chalk.red('Invalid output format passed. supports `csv`, `json` and `di` only'));
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
}

export function updateOrInitializeConfig(
  configObject: any,
  flags: tempAddFlags,
  allowedFlags: string[],
  log: (message: string) => void
): void {
  let updatedConfig;
  for (const [key, value] of Object.entries(flags)) {
    if (allowedFlags.includes(key) && value !== undefined) {
      switch (key) {
        case 'namespaceToExclude':
        case 'outputFormat':
        case 'fieldsToExclude':
          if (typeof value === 'string') {
            updateArrayValueInput(key, value, configObject, log);
          }
          break;

        case 'fieldsToConsider':
          if (typeof value === 'string') {
            updatedConfig = handleFieldsToConsider(configObject as typeSObjectSettingsMap, value);
            log(`Updated 'fieldsToConsider' to: ${JSON.stringify(updatedConfig.fieldsToConsider)}`);
          }
          break;

        case 'pickLeftFields':
          if (configObject !== undefined) {
            configObject.pickLeftFields = configObject.pickLeftFields ? false : true;
            log(`Setting '${key}' to: ${configObject[key]}`);
          }
          break;

        default:
          /* if (key === 'language' && value !== 'en' && value !== 'jp') {
            throw new Error('Invalid language input. supports `en` or `jp` only');
          }*/
          if (key === 'count' && (value as number) < 1) {
            throw new Error('Invalid input. Please enter a valid positive count.');
          }

          configObject[key] = value;
          log(`Setting '${key}' to: ${configObject[key]}`);
          break;
      }
    } else if (!['sObject', 'templateName', 'alias'].includes(key)) {
      log(chalk.yellow(`Skipped: '${key}' flag cannot be passed in the current command`));
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
  /* language: Flags.string({
    char: 'l',
    summary: messages.getMessage('flags.language.summary'),
    description: messages.getMessage('flags.language.description'),
    required: false,
  }),*/
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
  fieldsToConsider: Flags.string({
    summary: messages.getMessage('flags.fieldsToConsider.summary'),
    description: messages.getMessage('flags.fieldsToConsider.description'),
    char: 'i',
    required: false,
  }),
  pickLeftFields: Flags.boolean({
    summary: messages.getMessage('flags.pickLeftFields.summary'),
    description: messages.getMessage('flags.pickLeftFields.description'),
    char: 'p',
    required: false,
  }),
};
/* checking valid directory structure for json data template */
export function getTemplateJsonData(templateName: string): string {
  const filename = templateName.endsWith('.json') ? templateName : `${templateName}.json`;
  if (!filename) {
    throw error('Error: You must specify a filename using the --templateName flag.');
  }
  const templateDirPath = path.join(process.cwd(), 'data_gen/templates');
  if (!fs.existsSync(templateDirPath)) {
    throw error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
  }
  const configFilePath = path.join(templateDirPath, filename);
  if (!fs.existsSync(configFilePath)) {
    throw error(`Data Template file not found at ${configFilePath}`);
  }
  return configFilePath;
}

let config: templateSchema;
export default class TemplateAdd extends SfCommand<void> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = templateAddFlags;

  public async run(): Promise<void> {
    const { flags } = await this.parse(TemplateAdd);

    const configFilePath = getTemplateJsonData(flags.templateName);
    config = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as templateSchema;

    const objectName = flags.sObject ? flags.sObject.toLowerCase() : undefined;

    let allowedFlags = [];

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
      checkDuplicateFields(configFileForSobject, flags);
      allowedFlags = ['fieldsToExclude', 'language', 'count', 'pickLeftFields', 'fieldsToConsider'];
      updateOrInitializeConfig(configFileForSobject, flags, allowedFlags, this.log.bind(this));
    } else {
      const configFile: templateSchema = config;
      allowedFlags = ['outputFormat', 'namespaceToExclude', 'language', 'count'];
      updateOrInitializeConfig(configFile, flags, allowedFlags, this.log.bind(this));
    }

    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    this.log(chalk.green(`Success: Configuration updated in ${configFilePath}`));
  }
}
