/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable sf-plugin/flag-case */
import fs from 'node:fs';
import path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import chalk from 'chalk';
import {
  typeSObjectSettingsMap,
  templateSchema,
  TemplateRemoveResult,
  flagObj,
  namespaceAndOutputSchema,
  SObjectItem,
} from '../../../utils/types.js';
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'template.remove');
function deleteSObjectField(jsonData: templateSchema, sObjectName: string, fieldName: string): templateSchema {
  const sObject = jsonData.sObjects.find((obj) => Object.prototype.hasOwnProperty.call(obj, sObjectName)) as {
    [key: string]: typeSObjectSettingsMap;
  };

  if (sObject?.[sObjectName]) {
    if (Object.prototype.hasOwnProperty.call(sObject[sObjectName], fieldName)) {
      console.log(`Removing '${fieldName}' from the sObject '${sObjectName}' settings.`);
      delete sObject[sObjectName][fieldName as keyof typeSObjectSettingsMap];
    } else {
      throw new Error(`The specified flag '${fieldName}' does not exist in the '${sObjectName}' sObject.`);
    }
  } else {
    throw new Error(`'The '${sObjectName}' does not exist in the sobjects settings.`);
  }
  return jsonData;
}

function DeletesObject(jsonData: templateSchema, sObjectNames: string[]): templateSchema {
  sObjectNames.map((sObjectName) => {
    const sObjectIndex = jsonData.sObjects.findIndex((obj) =>
      Object.keys(obj).some((key) => key.toLocaleLowerCase() === sObjectName.toLocaleLowerCase())
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
  if (input.length !== 1) {
    return input;
  }
  return input
    .join('')
    .split(/[\s,]+/)
    .filter((item) => item.length > 0);
}

function DeleteArrayValue(
  jsonData: templateSchema,
  fieldName: keyof namespaceAndOutputSchema,
  fieldValues: string[]
): templateSchema {
  const updatedJsonData = { ...jsonData };
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
      console.log(`Removing '${fieldValues.join(', ')}' from the '${fieldName}' settings.`);
    }
  } else {
    throw new Error(`${fieldName} does not exist in the data template.`);
  }
  return updatedJsonData;
}
function valuesDoesNotExistError(valuesNotInJSON: string[], flagName: string, sObjectName: string): void {
  throw new Error(
    `Values '${valuesNotInJSON.join(', ')}' do not exist in the '${flagName}' of sobject '${sObjectName}' settings `
  );
}
function logRemoveMessage(fieldValues: string, sObjectName: string, fieldName: string): void {
  console.log(`Removing '${fieldValues}' from the '${fieldName}' of sObject '${sObjectName}' settings.`);
}
function DeleteSObjectArrayValue(jsonData: templateSchema, sObjectName: string, fieldValues: string[]): templateSchema {
  const concernedObject = jsonData.sObjects.find((obj) =>
    Object.keys(obj).some((key) => key.toLowerCase() === sObjectName)
  );
  const existingValues = concernedObject ? concernedObject[sObjectName]?.['fieldsToExclude'] : undefined;
  if (concernedObject && existingValues !== undefined) {
    const valuesNotInJSON: string[] = fieldValues.filter(
      (item) => !existingValues.map((val) => val.toLowerCase()).includes(item.toLowerCase())
    );
    if (valuesNotInJSON.length > 0) {
      valuesDoesNotExistError(valuesNotInJSON, 'fieldsToExclude', sObjectName);
    }
    const updatedArray = existingValues.filter(
      (item) => !fieldValues.map((val) => val.toLowerCase()).includes(item.toLowerCase())
    );
    logRemoveMessage(fieldValues.join(', '), sObjectName, 'fieldsToExclude');
    concernedObject[sObjectName]['fieldsToExclude'] = updatedArray;
  } else if (existingValues === undefined) {
    throw new Error(`The 'fields-to-exclude' does not exist for sobject '${sObjectName}' settings.`);
  }
  return jsonData;
}
function DeleteFieldsToConsiderValues(jsonData: templateSchema, sObjectName: string, values: string[]): templateSchema {
  const concernedObject = jsonData.sObjects.find((obj) => Object.prototype.hasOwnProperty.call(obj, sObjectName));
  const existingObj = concernedObject ? concernedObject[sObjectName]?.['fieldsToConsider'] : undefined;
  if (concernedObject && existingObj !== undefined) {
    const valuesNotInJSON: string[] = values.filter(
      (item) =>
        !Object.keys(existingObj)
          .map((val) => val.toLowerCase())
          .includes(item.toLowerCase())
    );
    if (valuesNotInJSON.length > 0) {
      valuesDoesNotExistError(valuesNotInJSON, 'fieldsToConsider', sObjectName);
    }
    const updatedObj = Object.fromEntries(
      Object.entries(existingObj).filter(
        ([key]) => !values.map((item) => item.toLowerCase()).includes(key.toLowerCase())
      )
    );
    logRemoveMessage(values.join(', '), sObjectName, 'fieldsToConsider');
    concernedObject[sObjectName]['fieldsToConsider'] = updatedObj;
  } else if (existingObj === undefined) {
    throw new Error(`The 'fieldsToConsider' does not exist for sobject '${sObjectName}' settings.`);
  }
  return jsonData;
}
function validateFlags(flags: string[]): boolean {
  let errorMessage;
  if (!flags.includes('templateName')) {
    throw new Error('Error: You must specify a filename using the --template-name flag.');
  } else if (flags.includes('pickLeftFields')) {
    throw new Error('pickLeftFields can not be deleted, it can only be set to true or false using the update command');
  } else if (
    !flags.includes('sObject') &&
    (flags.includes('fieldsToExclude') || flags.includes('count') || flags.includes('language') || flags.includes('fieldsToConsider'))
  ) {
    errorMessage = flags.includes('count')
      ? 'Default count can not be deleted! You can update instead.'
      : flags.includes('language')
        ? 'Default language can not be deleted! You can update instead.'
        : 'fieldsToExclude can only be used if sObject is specified';
    throw new Error(errorMessage);
  } else if (flags.includes('sObject') && (flags.includes('namespaceToExclude') || flags.includes('outputFormat'))) {
    errorMessage = flags.includes('namespaceToExclude')
      ? 'You cannot use global flag "namespaceToExclude" with an SObject flag.'
      : 'You cannot use global flag "outputFormat" with an SObject flag.';
    throw new Error(errorMessage);
  }
  return true;
}
function checkValidObject(flags: flagObj, jsonData: templateSchema): void {
  if (
    Object.keys(flags).includes('sObject') &&
    (Object.keys(flags).includes('fieldsToExclude') ||
      Object.keys(flags).includes('language') ||
      Object.keys(flags).includes('fieldsToConsider') ||
      Object.keys(flags).includes('count'))
  ) {
    if (flags.sObject && parseInput([flags.sObject]).length > 1) {
      throw new Error('Object-level values can only be removed from a single object at a time.');
    }
    const sObjectName = (flags.sObject as string).toLowerCase();
    const sObjectNames = sObjectName.split('/').map(n => n.toLowerCase());
    let sObjectsArray = jsonData.sObjects;

    sObjectNames.forEach((name, index) => {
      const concernedObject = sObjectsArray?.find((obj) =>
        Object.keys(obj).some((key) => key.toLowerCase() === name)
      );

      if (!concernedObject) {
        throw new Error(`The specified sObject '${name}' does not exist in the data template file.`);
      }

      const actualKey = Object.keys(concernedObject).find(
        (k) => k.toLowerCase() === name
      )!;

      const objConfig = concernedObject[actualKey];

      if (index < sObjectNames.length - 1 && !objConfig.relatedSObjects) {
        throw new Error(
          `'${actualKey}' does not contain relatedSObjects, so '${sObjectNames[index + 1]}' cannot exist under it.`
        );
      }

      sObjectsArray = objConfig.relatedSObjects ?? [];
    });
  }
}
function validateInput(flags: flagObj, jsonData: templateSchema): templateSchema {
  checkValidObject(flags, jsonData);
  const sObjectName = (flags.sObject as string)?.toLowerCase();
  const sObjectNames = sObjectName?.split('/').map(n => n.toLowerCase());
  let updatedJsonData = getUpdatedData(jsonData, sObjectNames);

  for (const [key] of Object.entries(flags)) {
    switch (key) {
      case 'fieldsToExclude':
        if ('sObject' in flags && 'fieldsToExclude' in flags && Array.isArray(flags.fieldsToExclude)) {
          updatedJsonData = DeleteSObjectArrayValue(
            updatedJsonData,
            sObjectNames[sObjectNames.length - 1],
            parseInput(flags.fieldsToExclude)
          );
        }
        break;
      // case 'language':
      case 'count':
        updatedJsonData = deleteSObjectField(updatedJsonData, sObjectNames[sObjectNames.length - 1], key);
        break;

      case 'sObject':
        updatedJsonData =
          Object.keys(flags).length === 2 && flags.sObject
            ? DeletesObject(updatedJsonData, [sObjectNames[sObjectNames.length - 1]])
            : updatedJsonData;
        break;
      case 'fieldsToConsider':
        updatedJsonData = flags.fieldsToConsider
          ? DeleteFieldsToConsiderValues(
            updatedJsonData,
            sObjectNames[sObjectNames.length - 1],
            parseInput(flags.fieldsToConsider)
          )
          : updatedJsonData;
        break;
      case 'relatedSObjects':
        updatedJsonData = flags.relatedSObjects
          ? (removeRelatedSObjects(
            updatedJsonData,
            sObjectNames[sObjectNames.length - 1],
            parseInput(flags.relatedSObjects)
          ))
          : updatedJsonData;
        break;
      default:
        break;
    }
  }
  if (updatedJsonData === undefined) {
    throw new Error('JSON data is undefined after processing the flags.');
  }

  const outputData = updateSObjectPath(jsonData, sObjectNames, updatedJsonData.sObjects?.[0]);
  outputData.namespaceToExclude = updatedJsonData.namespaceToExclude;
  outputData.outputFormat = updatedJsonData.outputFormat;

  return outputData;
}
function validateGlobalInput(flags: flagObj, jsonData: templateSchema): templateSchema {
  let updatedJsonData = jsonData;
  for (const [key] of Object.entries(flags)) {
    switch (key) {
      case 'namespaceToExclude':
      case 'outputFormat': {
        const fieldValues = key === 'outputFormat' ? flags.outputFormat : flags.namespaceToExclude;
        if (Array.isArray(fieldValues)) {
          updatedJsonData = DeleteArrayValue(updatedJsonData, key, parseInput(fieldValues));
        }
        break;
      }
    }
  }

  return updatedJsonData;
}

function getJsonData(templateName: string): string {
  const filename = templateName.endsWith('.json') ? templateName : `${templateName}.json`;
  if (!filename) {
    throw new Error('Error: You must specify a filename using the --template-name flag.');
  }
  const templateDirPath = path.join(process.cwd(), 'data_gen/templates');
  if (!fs.existsSync(templateDirPath)) {
    throw new Error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
  }
  const configFilePath = path.join(templateDirPath, filename);
  if (!fs.existsSync(configFilePath)) {
    throw new Error(`Data Template file not found at ${configFilePath}`);
  }
  return configFilePath;
}
export function getUpdatedData(jsonData: templateSchema, objectPath: string[]): templateSchema {
  let currentLevel = jsonData.sObjects;

  for (let i = 0; i < objectPath.length; i++) {
    const name = objectPath[i].toLowerCase();

    const found = currentLevel.find((obj: SObjectItem) =>
      Object.keys(obj)[0].toLowerCase() === name
    );

    if (!found) {
      throw new Error(`'${objectPath[i]}' does not exist in the template.`);
    }

    const realKey = Object.keys(found)[0];
    const config = found[realKey];

    if (i === objectPath.length - 1) {
      return {
        namespaceToExclude: jsonData.namespaceToExclude,
        outputFormat: jsonData.outputFormat,
        sObjects: [
          {
            [realKey.toLowerCase()]: config
          }
        ],
        templateFileName: '',
        count: 0
      };
    }

    currentLevel = config.relatedSObjects ?? [];
  }

  throw new Error('Invalid sObjectPath.');
}

function updateSObjectPath(
  jsonData: templateSchema,
  objectPath: string[],
  updatedData: SObjectItem
): templateSchema {
  const newJson: templateSchema = JSON.parse(JSON.stringify(jsonData)) as templateSchema;
  const sObjects = newJson.sObjects;
  let normalizedData = updatedData;
  // If updatedData is array, extract object inside
  if (Array.isArray(updatedData)) {
    if (updatedData.length === 1 && typeof updatedData[0] === 'object') {
      normalizedData = updatedData[0] as SObjectItem;
    } else {
      throw new Error('updatedData should not be an array.');
    }
  }

  let currentLevelArray = sObjects;

  for (let i = 0; i < objectPath.length; i++) {
    const key = objectPath[i].toLowerCase();

    const objIndex = currentLevelArray.findIndex(
      (obj: SObjectItem) => Object.keys(obj)[0].toLowerCase() === key
    );
    if (objIndex === -1) return newJson;

    const currentObjKey = Object.keys(currentLevelArray[objIndex])[0];
    const currentObj = currentLevelArray[objIndex][currentObjKey];

    // LAST NODE → replace object
    if (i === objectPath.length - 1) {
      currentLevelArray[objIndex] = { ...normalizedData };
      return newJson;
    }

    // go deeper
    if (!currentObj.relatedSObjects || !Array.isArray(currentObj.relatedSObjects)) {
      return newJson;
    }

    currentLevelArray = currentObj.relatedSObjects;
  }

  return newJson;
}

function removeRelatedSObjects(
  jsonData: templateSchema,
  sObject: string,
  relatedSObjectsToRemove: string[]
): templateSchema {
  if (!relatedSObjectsToRemove || relatedSObjectsToRemove.length === 0) {
    return jsonData;
  }

  const targetObj = sObject.toLowerCase();
  const removeSet = new Set(
    relatedSObjectsToRemove?.map((r) => r.toLowerCase())
  );

  if (!Array.isArray(jsonData.sObjects)) return jsonData;

  console.log(`Removing '${relatedSObjectsToRemove.join(', ')}' from the sObject '${sObject}' settings.`);

  const updatedSObjects = jsonData.sObjects.map((obj) => {
    const key = Object.keys(obj)[0];
    const value = obj[key];

    if (key.toLowerCase() !== targetObj) {
      return obj;
    }

    if (!Array.isArray(value.relatedSObjects)) {
      return obj;
    }

    const keysFound: string[] = [];
    value.relatedSObjects.forEach((relObj) => {
      const relKey = Object.keys(relObj)[0];
      keysFound.push(relKey.toLowerCase());
    });

    relatedSObjectsToRemove.forEach((relObj) => {
      if (!keysFound.includes(relObj.toLowerCase())) {
        throw new Error(`Related sObject '${relObj}' does not exist under sObject '${sObject}'.`);
      }
    });

    const filteredRelated = value.relatedSObjects.filter((relObj) => {
      const relKey = Object.keys(relObj)[0];
      return !removeSet.has(relKey.toLowerCase());
    });

    return {
      [key]: {
        ...value,
        relatedSObjects: filteredRelated,
      },
    };
  });

  return {
    ...jsonData,
    sObjects: updatedSObjects,
  };
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
    /* language: Flags.boolean({
      summary: messages.getMessage('flags.language.summary'),
      description: messages.getMessage('flags.language.description'),
      char: 'l',
    }),*/
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
    fieldsToConsider: Flags.string({
      summary: messages.getMessage('flags.fieldsToConsider.summary'),
      description: messages.getMessage('flags.fieldsToConsider.description'),
      char: 'i',
      multiple: true,
    }),
    pickLeftFields: Flags.boolean({
      summary: messages.getMessage('flags.pickLeftFields.summary'),
      description: messages.getMessage('flags.pickLeftFields.description'),
      char: 'p',
    }),
    relatedSObjects: Flags.string({
      summary: messages.getMessage('flags.relatedSObjects.summary'),
      description: messages.getMessage('flags.relatedSObjects.description'),
      char: 'k',
      multiple: true,
    }),
  };

  public async run(): Promise<TemplateRemoveResult> {
    const { flags } = await this.parse(TemplateRemove);
    const flagKeys: string[] = Object.keys(flags);
    validateFlags(flagKeys);
    const configFilePath = getJsonData(flags.templateName);
    const jsonData = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as templateSchema;
    if (flagKeys.length === 1 && flagKeys.includes('templateName')) {
      this.error('Error: Data Template File cannot be deleted! You must specify at least one setting flag to remove');
    }

    let isGlobal = false;
    if (flags.namespaceToExclude ?? flags.outputFormat) {
      isGlobal = true;
    }

    let updatedJson;
    if (!isGlobal) {
      if(!flags.sObject) {
        this.error('When removing object-level settings, you must specify the --s-object flag.');
      }
      this.log(chalk.magenta.bold('Working on the object level settings for ', flags.sObject));
      updatedJson = validateInput(flags, jsonData);
    }
    else
      updatedJson = validateGlobalInput(flags, jsonData);

    fs.writeFileSync(configFilePath, JSON.stringify(updatedJson, null, 2), 'utf8');
    this.log(chalk.green(`Success: Configuration updated in data template file ${configFilePath}`));
    return {
      path: 'src/commands/template/remove.ts',
    };
  }
}
