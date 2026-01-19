/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable prefer-const */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-explicit-any */


import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import GenerateTestData from 'smockit-data-engine';


import { Connection, Messages } from '@salesforce/core';
import { Flags, Progress, SfCommand, Spinner } from '@salesforce/sf-plugins-core';
import { loadAndValidateConfig, readSObjectConfigFile } from '../../../services/config-manager.js';
import { saveCreatedRecordIds, saveOutputFileOfJsonAndCsv } from '../../../services/output-formatter.js';
// import { insertRecordsspecial, restrictedObjects, salesforceErrorMap, userLicenseObjects } from '../../../utils/conditional_object_handling.js';
import { restrictedObjects, salesforceErrorMap, userLicenseObjects } from '../../../utils/conditional_object_handling.js';

import { connectToSalesforceOrg } from '../../../utils/generic_function.js';
import { createResultEntryTable, createTable } from '../../../utils/output_table.js';
import {
  CreateResult,
  DataGenerateResult,
  Field,
  FieldRecord,
  Fields,
  GenericRecord,
  SObjectConfig,
  TargetData,
  fieldType,
  jsonConfig,
  sObjectSchemaType,
  templateSchema,
  RelatedSObjectNode,
} from '../../../utils/types.js';


const fieldsConfigFile = 'generated_output.json';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('smock-it', 'data.generate');

const excludeFieldsSet = new Set<string>();

const progressBar = new Progress(true);

export default class DataGenerate extends SfCommand<DataGenerateResult> {
  public static createdRecordsIds: Map<string, string[]> = new Map();

  public static parentSObjects: string[] = [];

  public static parentSObjectIds: Map<string, string[]> = new Map();

  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static objectWithFaliures: Array<{ sObject: string; failedCount: number; count: number; level: number }> = [];

  public static pushParentId(sObjectName: string, ids: string[] = []) {
    const name = sObjectName.toLowerCase();
    if (!Array.isArray(ids) || ids.length === 0) {
      return;
    }
    const existing = DataGenerate.parentSObjectIds.get(name) ?? [];
    DataGenerate.parentSObjectIds.set(name, [...existing, ...ids]);
  }

  public static popParentId(sObjectName: string) {
    const name = sObjectName.toLowerCase();
    const ids = DataGenerate.parentSObjectIds.get(name);

    if (!ids || ids.length === 0) {
      DataGenerate.parentSObjectIds.delete(name);
      return;
    }
    ids.pop();
    if (ids.length === 0) {
      DataGenerate.parentSObjectIds.delete(name);
    } else {
      DataGenerate.parentSObjectIds.set(name, ids);
    }
  }

  public static readonly flags = {
    sObject: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObject.summary'),
      multiple: true,
      required: false
    }),

    excludeSObjects: Flags.string({
      char: 'z',
      summary: messages.getMessage('flags.excludeSObjects.summary'),
      description: messages.getMessage('flags.excludeSObjects.description'),
      multiple: true,
      required: false,
    }),

    templateName: Flags.string({
      char: 't',
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      required: true,
    }),
    alias: Flags.string({
      char: 'a',
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      required: true,
    }),
    recordType: Flags.string({
      char: 'r',
      summary: messages.getMessage('flags.recordType.summary'),
      description: messages.getMessage('flags.recordType.description'),
      required: false,
    }),
  };

  public dependentPicklistResults: Record<
    string,
    Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>
  > = {};
  public independentFieldResults: Map<string, string[]> = new Map();

  /**
   * Main method to execute the data generation process.
   *
   * @returns {Promise<DataGenerateResult>} - The result of the data generation, including the path to the template file.
   */

  public async run(): Promise<DataGenerateResult> {
    const { flags } = await this.parse(DataGenerate);
    const conn = await connectToSalesforceOrg(flags.alias);
    const baseConfig = await loadAndValidateConfig(conn, flags.templateName);

    const excludeSObjectsString = flags.excludeSObjects?.join(',') ?? undefined;
    const includeSObject = flags.sObject?.join(',') ?? undefined;

    if (!baseConfig) {
      throw new Error('Base configuration is undefined. Please ensure the template is loaded correctly.');
    }

    if (typeof baseConfig.count !== 'number' || (typeof baseConfig.count === 'number' && baseConfig.count <= 0)) {
      this.log(chalk.yellow('⚠️ Invalid count in baseConfig. Defaulting to 1.'));
      baseConfig.count = 1;
    }
    const objectsToProcess = this.processObjectConfiguration(baseConfig, includeSObject, excludeSObjectsString);

    const restrictedObjectsFound = objectsToProcess
      .map(obj => Object.keys(obj)[0])
      .filter(key => restrictedObjects.includes(key));
    const hasRestrictedValue = restrictedObjectsFound.length > 0;

    if (hasRestrictedValue) {
      this.log(chalk.red(`🚫 Restricted objects found: ${restrictedObjectsFound.join(', ')}`));
      throw new Error(`Smockit cannot generate data for: ${chalk.yellow(restrictedObjectsFound.join(', '))}`);
    }

    // Generate fields and write generated_output.json config
    await this.generateFieldsAndWriteConfig(conn, objectsToProcess, baseConfig, flags.recordType?.toLowerCase(), includeSObject, true);

    excludeFieldsSet.clear();

    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap = await this.getProcessedFields();
    const generateOutputconfigPath = path.join(process.cwd(), 'data_gen', 'output', fieldsConfigFile);
    const generatedOutputconfigData = fs.readFileSync(generateOutputconfigPath, 'utf8');
    const jsonDataForObjectNames: jsonConfig = JSON.parse(generatedOutputconfigData) as jsonConfig;
    const outputFormat = (jsonDataForObjectNames.outputFormat ?? []).map(f => f.toLowerCase());
    const outputPathDir = `${path.join(process.cwd())}/data_gen/output/`;
    const table = createTable();

    const startTime = Date.now();
    const sObjectCounter: { [key: string]: number } = {};

    const spinner = new Spinner(true);
    console.log(chalk.magenta('\nPlease wait!! while we Insert records...'));
    spinner.start('');

    for (const [index, currentSObject] of jsonDataForObjectNames.sObjects.entries()) {
      this.createdRecordCache = {};
      const object = currentSObject.sObject ?? '';
      //Reset and seed the stack for the current hierarchy
      DataGenerate.parentSObjects = [object.toLowerCase()];
      const localIndex = sObjectCounter[object] ?? 0;
      sObjectCounter[object] = localIndex + 1;
      const countofRecordsToGenerate = currentSObject.count;

      if ((object.toLowerCase() === 'location' || object.toLowerCase() === 'servicecontract') && (countofRecordsToGenerate ?? 1) >= 10000) {
        throw new Error(`Salesforce does not support 10,000+ records for ${object}`);
      }

      if (object.toLowerCase() === 'campaignmember' && (countofRecordsToGenerate ?? 0) > 1) {
        throw new Error(`Supports only 1 record for ${object}`);
      }

      if (object.toLowerCase() === 'consumptionrate' && (countofRecordsToGenerate ?? 0) > 500) {
        this.log(chalk.yellow(`⚠️ Record count >500 for ${object}. Proceeding with caution.`));
      }

      const mapKey = `${object}_${index}`;
      const fields = sObjectFieldsMap.get(mapKey);
      if (!fields) {
        this.log(chalk.red(`⚠️ No fields found for ${object}. Skipping.`));
        continue;
      }

      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, fields, object);

      if (countofRecordsToGenerate === undefined) {
        this.log(chalk.red(`Missing count for ${object}`));
        throw new Error(`Count for object "${object}" is undefined.`);
      }

      const basicJsonData = await GenerateTestData.generate(generateOutputconfigPath, object, localIndex);

      const trimmedJsonData = await this.trimFieldsData(jsonDataForObjectNames, basicJsonData, object);

      const jsonData = this.enhanceDataWithSpecialFields(trimmedJsonData, processedFields, countofRecordsToGenerate, object);

      let relatedJsonData = [];

      if (currentSObject.relatedSObjects && currentSObject.relatedSObjects.length > 0) {
        for (const record of jsonData) {

          const recordWithRelated = { ...record };

          recordWithRelated.relatedSObjects = await this.buildRelatedHierarchy(
            currentSObject,
            baseConfig,
            includeSObject,
            excludeSObjectsString,
            flags,
            conn
          );

          relatedJsonData.push(recordWithRelated);
        }
      }
      else {
        relatedJsonData = jsonData;
      }

      saveOutputFileOfJsonAndCsv(relatedJsonData as GenericRecord[], object, outputFormat, flags.templateName);

      await this.handleDirectInsert(conn, outputFormat, object, relatedJsonData as GenericRecord[]);

      // Build output hierarchy for result table
      let outputTableData = DataGenerate.buildOutputHierarchy(relatedJsonData[0], object);

      let tableIndex = 0;

      for (let i = 0; i < DataGenerate.objectWithFaliures.length; i++) {
        if (!outputTableData[tableIndex]) {
          tableIndex = 1;
        }
        let item = DataGenerate.objectWithFaliures[i];

        if (outputTableData[tableIndex] && item.sObject === outputTableData[tableIndex].sObject && item.level === outputTableData[tableIndex].level) {
          outputTableData[tableIndex].count += item.count;
          outputTableData[tableIndex].failedCount += item.failedCount;
        } else {
          i--;
        }

        tableIndex++;
      }

      outputTableData.forEach(obj => {
        table.addRow(createResultEntryTable(obj.sObject, outputFormat, obj.failedCount, obj.count, obj.level));
      });

      DataGenerate.objectWithFaliures = [];
    }

    saveCreatedRecordIds(outputFormat, flags.templateName);

    spinner.stop('');

    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    this.log(chalk.green.bold(`✅ Data generation completed in ${totalTime}s`));
    this.log(chalk.blue.bold(`📁 Results available at: ${outputPathDir}`));

    table.printTable();

    return { path: flags.templateName };
  }

  /**
 * Builds an output hierarchy for generated Salesforce data.
 *
 * This method creates a flat list representing the parent-to-child
 * sObject hierarchy based on the `relatedSObjects` structure.
 * Each entry contains the sObject name, record count placeholders,
 * failure count, and hierarchy level for output table rendering.
 *
 * @param data           Input object containing related sObject nodes.
 * @param rootObjectName Name of the root Salesforce sObject.
 * @returns              An ordered hierarchy list with level information.
 */
  public static buildOutputHierarchy(
    data: { relatedSObjects: RelatedSObjectNode[] },
    rootObjectName: string
  ): { sObject: string; failedCount: number; count: number; level: number; }[] {
    const result = [];

    // Add root object
    result.push({
      sObject: rootObjectName,
      failedCount: 0,
      count: 0,
      level: 0
    });

    function traverse(nodes: RelatedSObjectNode[], level: number) {
      if (!Array.isArray(nodes)) {
        return;
      }

      for (const node of nodes) {
        // add current sObject
        result.push({
          sObject: node.sObject,
          failedCount: 0,
          count: 0,
          level
        });

        if (node.records[0].relatedSObjects?.length) {
          traverse(node.records[0].relatedSObjects, level + 1);
        }
      }
    }
    traverse(data.relatedSObjects, 1);
    return result;
  }

  /**
 * Trims field values in generated JSON data based on Salesforce field metadata.
 * For each record, the method checks field length constraints defined in the
 * output configuration and shortens values that exceed the maximum allowed length.
 *
 * @param {any} generatedOutputconfigData - Configuration containing sObject metadata,
 * including field definitions and length constraints.
 * @param {any[]} basicJsonData - Array of records whose field values need to be validated
 * and trimmed according to metadata.
 * @param {string} sObjectName - The Salesforce sObject name used to locate the relevant
 * metadata in the configuration.
 * @returns {Promise<any[]>} - A new array of records with field values trimmed to their
 * maximum allowed lengths where applicable.
 */

  private async trimFieldsData(
    generatedOutputconfigData: any,
    basicJsonData: any[],
    sObjectName: string
  ): Promise<any[]> {
    const childMetadata = generatedOutputconfigData.sObjects.find(
      (obj: any) => obj.sObject.toLowerCase() === sObjectName.toLowerCase()
    );

    if (!childMetadata) {
      this.log(chalk.red(`No metadata found for ${sObjectName}`));
      throw new Error(`No metadata found for ${sObjectName}`);
    }

    const fields = childMetadata.fields;

    const modifiedJsonData = basicJsonData.map((record: any) => {
      const newRecord = { ...record };

      for (const key in record) {
        const fieldMeta = fields[key];
        const value = record[key];

        if (!fieldMeta || !fieldMeta.length || value === null || value === undefined) {
          continue;
        }

        let valueAsString = String(value);

        if (valueAsString.length > fieldMeta.length) {
          valueAsString = valueAsString.substring(0, fieldMeta.length);

          switch (fieldMeta.type) {
            case "double":
            case "currency":
            case "percent":
            case "number":
              newRecord[key] = Number(valueAsString);
              break;

            default:
              newRecord[key] = valueAsString;
          }
        }
      }

      return newRecord;
    });

    return modifiedJsonData;
  }

  /**
   * Builds a hierarchical JSON structure for related Salesforce sObjects by recursively
   * traversing parent–child relationships and generating test data for each related object.
   *
   * This method performs the following high-level steps:
   * - Tracks parent sObjects to correctly resolve reference relationships.
   * - Normalizes related object configuration by ensuring pickLeftFields is set.
   * - Generates or updates field configuration metadata for each related sObject.
   * - Identifies the parent reference field in the related sObject metadata.
   * - Generates base JSON data and enriches it with:
   *   - Parent reference values
   *   - Picklist and reference field handling
   *   - Trimmed field values based on metadata length constraints
   *   - Special field enhancements
   * - Recursively processes nested related sObjects to build a complete hierarchy.
   *
   * The final result is a structured JSON output where each related sObject contains
   * its generated records along with any nested related objects.
   *
   * @param {any} currentSObject - The current sObject configuration being processed,
   * including its related sObjects.
   * @param {any} baseConfig - The base configuration used for field generation and
   * output configuration updates.
   * @param {any} includeSObject - Configuration specifying which sObjects to include
   * during data generation.
   * @param {any} excludeSObjectsString - Comma-separated list or configuration of
   * sObjects to exclude from processing.
   * @param {any} flags - Additional runtime flags (e.g., record type) that influence
   * field generation and data processing.
   * @param {any} conn - Salesforce connection instance used for metadata queries
   * and field processing.
   */
  private async buildRelatedHierarchy(
    currentSObject: any,
    baseConfig: any,
    includeSObject: any,
    excludeSObjectsString: any,
    flags: any,
    conn: any
  ): Promise<any[]> {

    const parentObjectName = currentSObject.sObject;
    const relatedSObjects = currentSObject.relatedSObjects ?? [];

    // PUSH: Add the current object to the hierarchy stack
    const addedToStack = !DataGenerate.parentSObjects.includes(parentObjectName.toLowerCase());
    if (addedToStack) {
      DataGenerate.parentSObjects.push(parentObjectName.toLowerCase());
    }

    for (const obj of relatedSObjects) {
      const key = Object.keys(obj)[0];
      const value = obj[key];

      const hasPickLeftFields = Object.keys(value).some(
        key => key.toLowerCase() === 'pickleftfields'
      );

      if (!hasPickLeftFields) {
        value.pickLeftFields = true;
      }
    }

    const results: any[] = [];

    for (const relatedObj of relatedSObjects) {
      const relatedKey = Object.keys(relatedObj)[0];
      const relatedConfig = relatedObj[relatedKey];

      const nextObject: SObjectConfig = {
        sObject: relatedKey,
        relatedSObjects: relatedConfig.relatedSObjects ?? [],
        fields: {}
      };

      const subBaseConfig = { ...baseConfig, sObjects: [relatedObj] };
      const flagHasObject = (flags.sObject && flags.sObject.length > 0) ? flags.sObject?.filter((objName: string) => objName.toLowerCase() === relatedKey.toLowerCase()) : [];

      let generatedOutput = await this.generateFieldsAndWriteConfig(
        conn,
        subBaseConfig.sObjects, // objectsToProcess,
        subBaseConfig,
        flagHasObject.length > 0 ? flags.recordType?.toLowerCase() : undefined,
        includeSObject,
        false
      );
      const generateOutputconfigPath = path.join(process.cwd(), 'data_gen', 'output', fieldsConfigFile);
      const rawConfigData = await fs.promises.readFile(generateOutputconfigPath, 'utf8');
      const generatedOutputconfigData = JSON.parse(rawConfigData);

      const existsIndex = generatedOutputconfigData.sObjects.findIndex(
        (obj: any) => obj.sObject?.toLowerCase() === relatedKey.toLowerCase()
      );

      if (existsIndex === -1) {
        // Object NOT exists → append the new one
        generatedOutputconfigData.sObjects = [
          ...generatedOutputconfigData.sObjects,
          ...generatedOutput
        ];
      } else {
        // Object already exists → update counts and merge nested objects
        const existingObj = generatedOutputconfigData.sObjects[existsIndex];
        const newObj = generatedOutput[0];

        // Update count
        existingObj.count = newObj.count;

        // Merge fields (new fields overwrite old ones)
        existingObj.fields = {
          // ...existingObj.fields,
          ...newObj.fields
        };

        // Merge relatedSObjects (append if not duplicate)
        existingObj.relatedSObjects = [
          // ...(existingObj.relatedSObjects || []),
          ...(newObj.relatedSObjects || [])
        ];

        generatedOutputconfigData.sObjects[existsIndex] = existingObj;
      }

      // Write final output
      await fs.promises.writeFile(
        generateOutputconfigPath,
        JSON.stringify(generatedOutputconfigData, null, 2),
        'utf8'
      );


      const childMetadata = generatedOutputconfigData.sObjects.find(
        (obj: any) => obj.sObject.toLowerCase() === relatedKey?.toLowerCase()
      );

      if (!childMetadata) {
        throw new Error(`Field configuration not found for related object: ${relatedKey}`);
      }

      const fields = childMetadata.fields;

      const parentFieldName = Object.fromEntries(
        Object.entries(childMetadata.fields)
          .filter(([_, fieldDef]: [string, any]) => {
            if (!fieldDef.referenceTo) return false;

            const referenceTargets = Array.isArray(fieldDef.referenceTo)
              ? fieldDef.referenceTo.map((t: any) => t.toLowerCase())
              : [fieldDef.referenceTo.toLowerCase()];

            return referenceTargets.some((target: any) =>
              DataGenerate.parentSObjects.includes(target.toLowerCase())
            );
          })
          .map(([fieldName, fieldDef]: [string, any]) => {
            const referenceTargets = Array.isArray(fieldDef.referenceTo)
              ? fieldDef.referenceTo
              : [fieldDef.referenceTo];

            // Pick the first matched parent reference
            // const matchedRef = referenceTargets.find((target : any) =>
            //     DataGenerate.parentSObjects.includes(target.toLowerCase())
            // );
            // Prioritize the immediate parent (parentObjectName)
            const matchedRef = referenceTargets.find((target: any) =>
              target.toLowerCase() === parentObjectName
            ) || referenceTargets.find((target: any) =>
              DataGenerate.parentSObjects.includes(target.toLowerCase())
            );

            return [fieldName, matchedRef]; // { fieldName: reference }
          })
      );

      if (parentFieldName.size === 0) {
        throw new Error(`Unable to find parent field in ${relatedKey} that references ${parentObjectName}`);
      }

      const basicJsonData = await GenerateTestData.generate(generateOutputconfigPath, relatedKey, 0);

      const countOfRecordsToGenerate = basicJsonData.length ?? 1;

      let modifiedFields = Object.entries(fields).map(([name, def]: [string, any]) => {
        if (def.values && def.values.length > 0 && def.type === 'picklist') {
          return {
            name,
            values: def.values
          };
        }

        if (def.type === 'reference') {
          return {
            name,
            type: def.type,
            values: def.values || [],
            referenceTo: def.referenceTo,
            relationshipType: def.relationshipType
          };
        }

        return {
          name,
          type: def.type || 'Unknown',
          values: def.values || []
        };
      });

      modifiedFields = modifiedFields.map(field => {
        if (Object.keys(parentFieldName).includes(field.name)) {
          return {
            ...field,
            type: 'Custom List',
            values: ['ParentId']
          };
        }
        return field;
      });

      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, modifiedFields, relatedKey);

      const trimmedJsonData = await this.trimFieldsData(generatedOutputconfigData, basicJsonData, relatedKey);

      const jsonData = this.enhanceDataWithSpecialFields(
        trimmedJsonData,
        processedFields,
        countOfRecordsToGenerate,
        relatedKey
      );

      // let nestedRelatedSObjects: any[] = [];

      // if (nextObject.relatedSObjects!.length > 0) {
      //   nestedRelatedSObjects = await this.buildRelatedHierarchy(
      //     nextObject,
      //     subBaseConfig,
      //     includeSObject,
      //     excludeSObjectsString,
      //     flags,
      //     conn
      //   );
      // }

      // const enrichedJsonData = jsonData.map((record: any) => ({
      //   ...record,
      //   relatedSObjects: nestedRelatedSObjects,
      // }));

      // Generate unique hierarchy for EACH record individually
      const enrichedJsonData = await Promise.all(jsonData.map(async (record: any) => {
        let nestedRelatedSObjects: any[] = [];

        if (nextObject.relatedSObjects!.length > 0) {
          nestedRelatedSObjects = await this.buildRelatedHierarchy(
            nextObject,
            subBaseConfig,
            includeSObject,
            excludeSObjectsString,
            flags,
            conn
          );
        }

        return {
          ...record,
          relatedSObjects: nestedRelatedSObjects,
        };
      }));

      results.push({
        sObject: relatedKey,
        records: enrichedJsonData,
        parentFieldName: parentFieldName || null,
      });
    }
    // CLEANUP: After the loop completes, remove the object from the stack
    if (addedToStack) {
      DataGenerate.parentSObjects.pop();
    }
    return results;
  }


  /**
   * Processes the `fieldsToConsider` configuration for a given Salesforce object, normalizing key names.
   * If a key starts with `'dp-'`, the prefix is removed before adding it to the result map.
   *
   * @param {sObjectSchemaType} configForObject - The configuration object for a Salesforce sObject, which includes `fieldsToConsider`.
   * @returns {Record<string, string[]>} - A map of normalized field keys to their corresponding field lists.
   */
  private processFieldsToConsider(configForObject: sObjectSchemaType): Record<string, string[]> {
    const considerMap: Record<string, any> = {};
    const fieldsToConsiderKeys = Object.keys(configForObject?.['fieldsToConsider'] ?? {});
    for (const key of fieldsToConsiderKeys) {
      if (configForObject['fieldsToConsider']) {
        if (key.startsWith('dp-')) {
          considerMap[key.substring(3).toLowerCase()] = configForObject['fieldsToConsider'][key];
        } else {
          considerMap[key.toLowerCase()] = configForObject['fieldsToConsider'][key];
        }
      }
    }
    return considerMap;
  }

  /**
   * Determines the normalized field type based on the input item and whether it belongs to a parent object.
   * Maps certain Salesforce field types like 'string' and 'textarea' to a generalized 'text' type.
   *
   * @param {Record<string, any>} item - The field metadata object, potentially from a parent or child object.
   * @param {boolean} [isParentObject=false] - A flag indicating if the field belongs to a parent object (uses `DataType` instead of `type`).
   * @returns {string} - The normalized field type ('reference', 'text', or the original type).
   */
  private getFieldType(item: Record<string, any>, isParentObject: boolean = false): string {
    const itemType = isParentObject ? item.DataType : item.type;

    if (itemType === 'reference') {
      return 'reference';
    }

    if (itemType === 'string' || itemType === 'textarea') {
      return 'text';
    }
    return itemType;
  }

  /**
   * Processes and returns the relevant Salesforce object configuration(s) from the base template.
   * If a specific `objectName` is provided, only the matching configuration is returned; otherwise, all are returned.
   * Throws an error if the specified object name is not found in the base configuration.
   *
   * @param {templateSchema} baseConfig - The base configuration object containing multiple sObject definitions.
   * @param {string | undefined} objectName - The optional name of a specific object to filter for.
   * @returns {sObjectSchemaType[]} - An array of processed sObject configurations to be used.
   */
  private processObjectConfiguration(baseConfig: templateSchema, objectNames?: string, excludeSObjects?: string | undefined): sObjectSchemaType[] {
    const allSObjectss = baseConfig.sObjects;
    const excludeSet = new Set(
      (excludeSObjects ?? '')
        .split(',')
        .map(name => name.trim().toLowerCase())
        .filter(Boolean)
    );

    const availableObjectNames = new Set(
      allSObjectss.map(obj => Object.keys(obj)[0].toLowerCase())
    );

    const invalidExcludes = Array.from(excludeSet).filter(name => !availableObjectNames.has(name));

    if (invalidExcludes.length > 0) {
      throw new Error(
        `Invalid excludeSObjects:[ ${invalidExcludes.join(', ')} ] not found in template.`
      );
    }
    const allObjects = allSObjectss.filter(obj => {
      const objectName = Object.keys(obj)[0].toLowerCase();
      return !excludeSet.has(objectName);
    });

    const keyMapping: { [key: string]: string } = {
      count: 'count',
      pickleftfields: 'pickLeftFields',
      fieldstoconsider: 'fieldsToConsider',
      fieldstoexclude: 'fieldsToExclude'
    };

    // Helper function to normalize an object
    const normalizeObject = (obj: any): sObjectSchemaType => {
      const key = Object.keys(obj)[0];
      const value = obj[key];
      const lowerKey = key.toLowerCase();
      const normalizedValue: any = { pickLeftFields: true }; // Default pickLeftFields to true

      for (const [k, v] of Object.entries(value)) {
        const normalizedKey = k.toLowerCase();
        const mappedKey = keyMapping[normalizedKey] || normalizedKey;
        normalizedValue[mappedKey] = mappedKey === 'fieldsToExclude' && Array.isArray(v)
          ? v.map((field: string) => field.toLowerCase())
          : v;
      }

      return { [lowerKey]: normalizedValue };
    };

    // Helper function to check for unsupported objects
    const checkUnsupportedObjects = (objects: sObjectSchemaType[]): void => {
      const foundUnsupported = objects
        .map(obj => Object.keys(obj)[0])
        .filter(key => userLicenseObjects.has(key));

      if (foundUnsupported.length > 0) {
        console.log(`Action blocked for SObjects ${chalk.yellow(foundUnsupported.join(', '))}! Requires Salesforce user license.`);
      }
    };

    if (!objectNames) {
      const result = allObjects.map(normalizeObject);
      checkUnsupportedObjects(result);
      return result;
    }

    const nameSet = new Set(
      objectNames
        .split(',')
        .map(name => name.trim().toLowerCase())
        .filter(Boolean)
    );
    const overlap = Array.from(nameSet).filter(name => excludeSet.has(name));
    if (overlap.length > 0) {
      throw new Error(
        `The following SObjects are present in both include and exclude lists: ${chalk.yellow(overlap.join(', '))}. Please remove the conflict.`
      );
    }
    const availableNames = new Set(allObjects.map((obj: any) => Object.keys(obj)[0].toLowerCase()));

    const missingNames = Array.from(nameSet).filter(name => !availableNames.has(name));
    if (missingNames.length > 0) {
      throw new Error(
        `The following specified objects were not found in template: ${chalk.yellow(missingNames.join(', '))}`
      );
    }

    const matchedObjects = allObjects
      .map(obj => nameSet.has(Object.keys(obj)[0].toLowerCase()) ? normalizeObject(obj) : null)
      .filter((obj): obj is sObjectSchemaType => obj !== null);

    checkUnsupportedObjects(matchedObjects);
    return matchedObjects;
  }
  /**
   * Determines the default set of fields to include for processing when no specific field configuration is provided.
   * Filters out fields that are listed in `fieldsToIgnore`, and only returns fields if no `fieldsToConsider`,
   * `fieldsToExclude`, or `pickLeftFields` settings are present in the object configuration.
   *
   * @param {sObjectSchemaType} configForObject - The object-specific configuration containing optional field filters.
   * @param {any} allFields - The full list of available fields, expected to contain a `records` array of `FieldRecord` items.
   * @param {string[]} fieldsToIgnore - A list of field API names (in lowercase) that should be excluded from the result.
   * @returns {FieldRecord[]} - The filtered list of `FieldRecord` objects to pass forward.
   */

  private getDefaultFieldsToPass(
    configForObject: sObjectSchemaType,
    allFields: any,
    fieldsToIgnore: string[]
  ): FieldRecord[] {
    let fieldsToPass: FieldRecord[] = [];

    // Check if the relevant fields in configForObject are undefined
    if (
      configForObject['fieldsToConsider'] === undefined &&
      configForObject['fieldsToExclude'] === undefined &&
      configForObject['pickLeftFields'] === undefined
    ) {
      fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
        (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
      );
    }
    return fieldsToPass;
  }

  /**
   * Filters fields based on the `pickLeftFields` configuration and various field filters such as `fieldsToConsider`,
   * `fieldsToExclude`, and `fieldsToIgnore`. Handles multiple configuration scenarios to determine which fields
   * should be passed forward for processing.
   * - Required fields are always preserved when merging with considered fields.
   *
   * @param {boolean | undefined} getPickLeftFields - Indicates if the "pick-left" logic should be applied.
   * @param {sObjectSchemaType} configForObject - Configuration object for the current sObject.
   * @param {string[]} fieldsToConsider - A list of field API names that should be considered for inclusion.
   * @param {string[]} fieldsToExclude - A list of field API names that should be excluded.
   * @param {string[]} fieldsToIgnore - A list of field API names to ignore entirely.
   * @param {any} allFields - The complete field metadata for the sObject, expected to contain a `records` array.
   * @returns {FieldRecord[]} - A filtered and potentially merged list of `FieldRecord` objects to pass forward.
   */

  private filterFieldsByPickLeftConfig(
    getPickLeftFields: boolean | undefined,
    configForObject: sObjectSchemaType,
    fieldsToConsider: string[],
    fieldsToExclude: string[],
    fieldsToIgnore: string[],
    allFields: any
  ): FieldRecord[] {
    let fieldsToPass: FieldRecord[] = [];
    // default object fields to pass when undefined
    fieldsToPass = this.getDefaultFieldsToPass(configForObject, allFields, fieldsToIgnore);

    if (getPickLeftFields === true && fieldsToIgnore.length > 0) {
      if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
        fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
          (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
        );
      } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
        fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
          (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
        );
      } else if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
        fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
          (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
        );
      }
    } else if (getPickLeftFields === false && fieldsToIgnore.length > 0) {
      if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
        throw new Error('Please provide a field or set pick-left field to true');
      } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
        throw new Error('Please provide fieldsToConsider or set pickLeftFields to true');
      } else if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
        fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
          (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
        );

        const requiredFields = this.getRequiredFields(fieldsToPass);
        const consideredFields = fieldsToPass.filter((record) =>
          fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
        );

        fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
      } else if (fieldsToConsider.length > 0 && fieldsToIgnore.length > 0 && fieldsToExclude.length === 0) {
        fieldsToPass = (allFields as { records: FieldRecord[] }).records.filter(
          (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
        );

        const requiredFields = this.getRequiredFields(fieldsToPass);
        const consideredFields = fieldsToPass.filter((record) =>
          fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
        );

        fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
      }
    }

    return fieldsToPass;
  }

  /**
   * Processes Salesforce objects to generate field configurations and writes them to a JSON file.
   * It queries Salesforce metadata, applies field filters, and outputs the configuration data.
   * The final configuration is written to a file named `generated_output.json`.
   *
   * @param {Connection} conn - Salesforce connection instance for querying metadata.
   * @param {any[]} objectsToProcess - List of objects and their field configurations to process.
   * @param {templateSchema} baseConfig - Base configuration containing general settings.
   * @returns {Promise<void>} - Resolves when the configuration is successfully written to a file.
   */

  private async generateFieldsAndWriteConfig(
    conn: Connection,
    objectsToProcess: any[],
    baseConfig: templateSchema,
    recordTypeName: string | undefined,
    sObjectName: string | undefined,
    isInsert: boolean
  ): Promise<any> {
    const outputData: any[] = [];
    if (recordTypeName && !sObjectName) {
      throw new Error('sObjectName is required to generate data for recordType!');
    }

    for (const objectConfig of objectsToProcess) {
      const objectName = Object.keys(objectConfig as Record<string, any>)[0];
      const configForObject: sObjectSchemaType = (objectConfig as Record<string, any>)[objectName] as sObjectSchemaType;
      const namespacePrefixToExclude = baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';

      const allFields = await conn.query(
        `SELECT QualifiedApiName, IsDependentPicklist, Label, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable, Length, Precision, Scale
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        AND IsCreatable = true
        AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
      );
      let fieldsDataRt: string[] = [];

      if (recordTypeName && sObjectName) {

        const objectDescribe = await conn.describe(objectName);

        const getRecordTypeName = objectDescribe.recordTypeInfos.find(
          (rt: any) => rt.name.toLowerCase() === recordTypeName || rt.developerName.toLowerCase() === recordTypeName);


        if (!getRecordTypeName) {
          throw new Error(`Record Type "${recordTypeName}" not found for sObject "${objectName}".`);
        }

        if (getRecordTypeName && getRecordTypeName.available) {
          const recordTypeId = getRecordTypeName.recordTypeId;
          if (recordTypeId) {
            const endpoint = `/services/data/v59.0/sobjects/${objectName}/describe/layouts/${recordTypeId}`;
            const fieldData: any = await conn.requestGet(endpoint);

            fieldData.editLayoutSections?.forEach((section: any) => {
              section.layoutRows?.forEach((row: any) => {
                row.layoutItems?.forEach((item: any) => {
                  item.layoutComponents?.forEach((component: any) => {
                    const name = component?.details?.name;
                    if (name) {
                      fieldsDataRt.push(name);
                    }
                    if (component?.components && component.components.length > 0) {
                      component.components.forEach((subComponent: any) => {
                        const subFieldName = subComponent?.details?.name;
                        if (subFieldName) {
                          fieldsDataRt.push(subFieldName);
                        }
                      });
                    }
                  });
                });
              });
            });
          }
        }
      }

      const requiredFields = this.getRequiredFields(allFields.records as FieldRecord[]);
      const requiredFieldNames = requiredFields.map((field) => field.QualifiedApiName.toLowerCase());

      let fieldsToExclude = configForObject['fieldsToExclude']?.map((field: string) => field.toLowerCase()) ?? [];
      const fieldsToIgnore = [
        'jigsaw',
        'endtime',
        'activitydate',
        'recurrence2patterntext',
        'fromaddress',
        'visitoraddressid',
        'starttime',
        'cleanstatus',
        'latitude',
        'longitude',
        'recurrenceinterval',
        'recurrencedayofweekmask',
        'recurrencedayofmonth',
        'recurrencestartdateonly',
        'trackingnumber__c',
        'recurrenceenddateonly',
        'recurrencetype',
        'isrecurrence',
        'recurrenceinstance',
        'recurrencemonthofyear',
        'recurrencetimezonesidkey',
        'recurrenceregeneratedtype',
        'isreminderset',
        'isreductionorder'

      ];
      fieldsToExclude = fieldsToExclude.filter(
        (field: string) => !fieldsToIgnore.includes(field) && !requiredFieldNames.includes(field.toLowerCase())
      );
      fieldsToExclude = [...fieldsToIgnore, ...fieldsToExclude];

      const getPickLeftFields = configForObject.pickLeftFields;
      const considerMap = this.processFieldsToConsider(configForObject);
      const fieldsToConsider = Object.keys(considerMap);

      let fieldsToPass = this.filterFieldsByPickLeftConfig(
        getPickLeftFields,
        configForObject,
        fieldsToConsider,
        fieldsToExclude,
        fieldsToIgnore,
        allFields
      );
      if (fieldsDataRt.length > 0) {
        fieldsToPass = fieldsToPass.filter((field: any) =>
          fieldsDataRt.includes(field.QualifiedApiName)
        );
      }

      const fieldsObject = await this.processFieldsWithFieldsValues(conn, fieldsToPass, objectName, considerMap);

      const configToWrite: any = {
        sObject: objectName,
        count: typeof configForObject.count === 'number'
          ? configForObject.count > 0
            ? configForObject.count
            : 1
          : baseConfig.count ?? 1,
        relatedSObjects: configForObject.relatedsobjects ?? [],
      };

      const prioritizedField = 'AccountId';
      const prioritizedFieldsObject: Record<string, any> = {};

      if (fieldsObject[prioritizedField]) {
        prioritizedFieldsObject[prioritizedField] = fieldsObject[prioritizedField];
      }

      for (const [key, value] of Object.entries(fieldsObject)) {
        if (key !== prioritizedField) {
          prioritizedFieldsObject[key] = value;
        }
      }

      if (Object.keys(prioritizedFieldsObject).length > 0) {
        configToWrite.fields = prioritizedFieldsObject;
      }

      outputData.push(configToWrite);
    }

    const outputDir = path.resolve('./data_gen/output/');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'generated_output.json');

    if (isInsert) {
      fs.writeFileSync(
        outputFile,
        JSON.stringify({ outputFormat: baseConfig.outputFormat, sObjects: outputData }, null, 2),
        'utf8'
      );
    } else {
      return outputData;
    }
    return [];

  }



  /**
   * Processes the fields to generate configuration objects based on field types and values.
   * It handles various data types (e.g., picklist, reference, text) and applies appropriate transformations.
   * The result is a mapping of field API names to their configurations.
   *
   * @param {Connection} conn - Salesforce connection instance for querying additional field data.
   * @param {FieldRecord[]} fieldsToPass - The fields to process, each containing metadata and values.
   * @param {string} objectName - The name of the Salesforce object to which the fields belong.
   * @param {Record<string, string[]>} considerMap - A map of fields and their corresponding values for consideration.
   * @returns {Promise<Record<string, Fields>>} - A promise that resolves to a record of field configurations.
   */

  private async processFieldsWithFieldsValues(
    conn: Connection,
    fieldsToPass: FieldRecord[],
    objectName: string,
    considerMap: Record<string, string[]>
  ): Promise<Record<string, Fields>> {
    const fieldsObject: Record<string, Fields> = {};

    this.dependentPicklistResults = {};

    for (const inputObject of fieldsToPass) {

      let fieldConfig: Fields = { type: inputObject.DataType, label: inputObject.Label };

      switch (inputObject.DataType) {
        case 'textarea':
        case 'string':
          if (
            inputObject.QualifiedApiName.match(
              /^(Billing|Shipping|Other|Mailing)(Street|City|State|PostalCode|Country)$/i
            )
          ) {
            fieldConfig = {
              type: 'address',
              label: inputObject.Label,
              length: inputObject.Length
            };
          }


          else {
            let label = inputObject.Label;
            // if (
            //   objectName.toLowerCase() === 'opportunity' || objectName.toLowerCase() === 'campaign'
            // ) {
            if (inputObject.QualifiedApiName === 'Name' && objectName.toLowerCase() !== 'account') {
              label = objectName + ' ' + label;
            }
            // }

            fieldConfig = {
              type: 'text',
              values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
                : [],
              label,
              length: inputObject.Length
            };
          }
          break;

        case 'reference':
          fieldConfig = {
            type: 'reference',
            referenceTo: inputObject.ReferenceTo?.referenceTo
              ? (inputObject.ReferenceTo.referenceTo[0] as string)
              : undefined,

            values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
              ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
              : [],
            relationshipType: inputObject.RelationshipName ? 'master-detail' : 'lookup',
            label: inputObject.Label,
          };
          break;

        case 'picklist':
          if (inputObject.IsDependentPicklist) {
            await this.depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
          } else {
            let picklistValues = await this.getPicklistValues(conn, objectName, inputObject.QualifiedApiName, considerMap);
            if ((objectName === 'contract' || objectName === 'listemail') && inputObject.QualifiedApiName === 'Status') {
              picklistValues = ['Draft'];
            }

            if ((objectName === 'alternativepaymentmethod' || objectName === 'paymentauthorization' || objectName === 'refund') && inputObject.QualifiedApiName === 'ProcessingMode') {
              picklistValues = ['External'];
            }
            if ((objectName === 'paymentauthadjustment' || objectName === 'paymentauthorization' || objectName === 'refund') && inputObject.QualifiedApiName === 'Status') {
              picklistValues = ['Processed'];
            }
            if (objectName === 'unitofmeasure' && inputObject.QualifiedApiName === 'Type') {
              picklistValues = ['distance'];
            }
            fieldConfig = {
              type: 'picklist',
              values: (considerMap?.[inputObject.QualifiedApiName.toLowerCase()])
                ? (considerMap[inputObject.QualifiedApiName.toLowerCase()])
                : picklistValues,
              label: inputObject.Label
            };
          }
          break;

        case 'multipicklist':
          if (inputObject.IsDependentPicklist) {
            await this.depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
          } else {
            let picklistValues = await this.getPicklistValues(conn, objectName, inputObject.QualifiedApiName, considerMap);
            fieldConfig = {
              type: 'multipicklist',
              values: picklistValues,
              label: inputObject.Label
            };
          }
          break;

        default:
          if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
            fieldConfig = {
              type: inputObject.DataType,
              values: considerMap[inputObject.QualifiedApiName.toLowerCase()],
              label: inputObject.Label,
            };
          }
          else if (inputObject.DataType === 'double' || inputObject.DataType === 'currency' || inputObject.DataType === 'percent') {
            fieldConfig = {
              type: inputObject.DataType,
              label: inputObject.Label,
              length: inputObject.Precision - inputObject.Scale,
            };
          }
          else if (inputObject.DataType === 'text' || inputObject.DataType === 'url' || inputObject.DataType === 'address') {
            fieldConfig = {
              type: inputObject.DataType,
              label: inputObject.Label,
              length: inputObject.Length,
            };
          }
          else {
            fieldConfig = {
              type: inputObject.DataType,
              label: inputObject.Label,
            };
          }

          break;
      }
      if (!inputObject.IsDependentPicklist) {
        fieldsObject[inputObject.QualifiedApiName] = fieldConfig;
      }
    }

    if (Object.keys(this.dependentPicklistResults).length > 0) {
      const topControllingField = Object.keys(this.dependentPicklistResults)[0];
      const dependentFieldsData = this.convertJSON(this.dependentPicklistResults, topControllingField) as Record<
        string,
        Fields
      >;

      Object.assign(fieldsObject, dependentFieldsData);
      this.dependentPicklistResults = {};
    }

    return fieldsObject;
  }

  /**
   * Handles direct insert operations for Salesforce records, processes the results, and logs any errors.
   * It inserts records using the `insertRecords` method and returns the count of failed inserts and the inserted IDs.
   * Logs any errors encountered during the insert process.
   *
   * @param {Connection} conn - Salesforce connection instance for performing the insert operation.
   * @param {string[]} outputFormat - The output format array, determines if direct insert should proceed.
   * @param {string} object - The Salesforce object type to insert records into.
   * @param {GenericRecord[]} jsonData - The array of records to insert.
   * @returns {Promise<{ failedCount: number; insertedIds: string[] }>} - A promise that resolves to the count of failed inserts and the inserted record IDs.
   */
  public async handleDirectInsert(
    conn: Connection,
    outputFormat: string[],
    object: string,
    jsonData: GenericRecord[]
  )//: Promise<{ failedCount: number; insertedIds: string[] }> 
  {
    if (!outputFormat.includes('DI') && !outputFormat.includes('di')) {
      return;
      // { failedCount: 0, insertedIds: [] };
    }

    // const errorMessages: Map<string, number> = new Map();
    // const insertedIds: string[] = [];
    let failedCount = 0;

    try {
      // let insertResult;
      // if (
      //   object.toLowerCase() === 'order' ||
      //   object.toLowerCase() === 'task' ||
      //   object.toLowerCase() === 'productitemtransaction' ||
      //   object.toLowerCase() === 'event'
      // ) {
      //   // insertResult = 
      //   await insertRecordsspecial(conn, object, jsonData);
      // } else {
      // insertResult = 
      await DataGenerate.insertRecords(conn, object, jsonData, true);
      // }
      // insertResult.forEach((result: { id?: string; success: boolean; errors?: any[] }, index: number) => {

      //   if (result.success && result.id) {
      //     insertedIds.push(result.id);
      //   } else if (result.errors) {
      //     failedCount++; // Increment once per failed record

      //     result.errors.forEach((error) => {
      //       let errorCode: string;
      //       if (typeof error != 'object') {
      //         errorCode = error.split(':')[0].trim().toUpperCase();
      //       } else if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      //         errorCode = error.statusCode;
      //       } else {
      //         errorCode = 'UNKNOWN_ERROR';
      //       }
      //       const fields = (error as { fields?: string[] })?.fields || [];
      //       const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
      //       const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to some issues:  ${errorCode}`;
      //       const humanReadableMessage = errorTemplate
      //         .replace('{field}', fieldList)
      //         .replace('{object}', object);
      //       const currentCount = errorMessages.get(humanReadableMessage) ?? 0;
      //       errorMessages.set(humanReadableMessage, currentCount + 1);
      //     });
      //   } else {

      //     failedCount++;
      //   }
      // });

      // this.updateCreatedRecordIds(object, insertResult);
      // return { failedCount, insertedIds };

    } catch (error) {
      const errorCode = (error as any).statusCode || 'UNKNOWN_ERROR';
      const fields = (error as any).fields || [];
      const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
      const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to some issues:  ${errorCode}`;
      const humanReadableMessage = errorTemplate
        .replace('{field}', fieldList)
        .replace('{object}', object);
      console.error(chalk.redBright(`Error (${failedCount + 1}): ${humanReadableMessage}`));

      // if (insertedIds.length === 0) {
      //   failedCount++;
      // }
      // return { failedCount, insertedIds };
    }
  }

  /**
   * Retrieves picklist values for a specified field on a Salesforce object and validates the values against the provided consideration map.
   * Throws an error if any value in the consideration map is missing from the picklist.
   *
   * @param {Connection} conn - Salesforce connection instance used to query the object metadata.
   * @param {string} object - The Salesforce object name to retrieve the field details from.
   * @param {string} field - The field name for which picklist values are being fetched.
   * @param {Record<string, any>} considerMap - A map of field names to values that should be considered for validation.
   * @returns {Promise<string[]>} - A promise that resolves to an array of picklist values for the specified field.
   */

  private async getPicklistValues(
    conn: Connection,
    object: string,
    field: string,
    considerMap: Record<string, any>
  ): Promise<string[]> {
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    const pickListValues: string[] =
      fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value as string) ?? [];

    Object.keys(considerMap).forEach((key) => {
      if (
        Object.keys(considerMap).includes(key.toLowerCase()) &&
        considerMap[key.toLowerCase()].length > 0 &&
        key.toLowerCase() === field.toLowerCase()
      ) {
        const rawValue = considerMap[field.toLowerCase()];
        const fieldConsiderationValues: string[] = (Array.isArray(rawValue) ? rawValue : [rawValue]).filter(v => typeof v === 'string');
        const pickListSet = new Set(pickListValues);
        const missingValues = fieldConsiderationValues?.filter((value: string) => !pickListSet.has(value));

        if (missingValues && missingValues.length > 0) {
          throw new Error(
            `Value(s) '${missingValues.join(', ')}' not found in the picklist value set for '${field}' field.`
          );
        }
      }
    });

    return pickListValues;
  }

  /**
   * Handles the processing of dependent picklist values for a specified dependent field in a Salesforce object.
   * It retrieves the controlling field, processes valid dependent picklist values based on the controller field values,
   * and updates the dependent picklist results.
   * If any value in the consideration map does not match the valid parent value in the dependent picklist,
   * an error is thrown.
   *
   * @param {Connection} conn - Salesforce connection instance used to query the object schema.
   * @param {string} objectName - The Salesforce object name containing the dependent picklist field.
   * @param {string} dependentFieldApiName - The API name of the dependent picklist field to process.
   * @param {Record<string, string[]>} considerMap - A map of field names to values that should be considered for validation.
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  private async depPicklist(
    conn: Connection,
    objectName: string,
    dependentFieldApiName: string,
    considerMap: Record<string, string[]>
  ): Promise<void> {
    const schema = await conn.sobject(objectName).describe();
    const dependentFieldResult = schema.fields.find((field) => field.name === dependentFieldApiName);
    if (!dependentFieldResult) {
      this.error(`Dependent field ${dependentFieldApiName} not found.`);
      return;
    }

    const controllingFieldName = this.getControllingFieldName(dependentFieldResult);
    if (!controllingFieldName) {
      this.independentFieldResults.set(
        dependentFieldApiName,
        dependentFieldResult.picklistValues?.map((value: { value: string }) => value.value) ?? []
      );
      return;
    }

    const controllerFieldResult = schema.fields.find((field) => field.name === controllingFieldName);
    const controllerValues = controllerFieldResult?.picklistValues ?? [];

    const dependentPicklistValues = new Map<string, string[]>();

    dependentFieldResult.picklistValues?.forEach((entry) => {
      if (entry && typeof entry === 'object' && 'validFor' in entry) {
        const base64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const validForControllerValues = [];

        const base64chars: string[] = (entry.validFor as string).split('');
        for (let i = 0; i < controllerValues.length; i++) {
          const bitIndex = Math.floor(i / 6);
          const bitShift = 5 - (i % 6);
          if ((base64map.indexOf(base64chars[bitIndex]) & (1 << bitShift)) !== 0) {
            validForControllerValues.push(controllerValues[i].label);
          }
        }
        validForControllerValues.forEach((controllerValue) => {
          if (typeof controllerValue === 'string' && !dependentPicklistValues.has(controllerValue)) {
            dependentPicklistValues.set(controllerValue, []);
          }
          dependentPicklistValues.get(controllerValue as string)?.push(entry.value as string);
        });
      }
    });

    // Append to dependentPicklistResults
    dependentPicklistValues.forEach((childValues, parentValue) => {
      if (!this.dependentPicklistResults[controllingFieldName]) {
        this.dependentPicklistResults[controllingFieldName] = [];
      }
      this.dependentPicklistResults[controllingFieldName].push({
        parentFieldValue: parentValue,
        childFieldName: dependentFieldApiName,
        childValues,
      });
    });
    // getting values for the dependent picklist
    Object.keys(this.dependentPicklistResults).forEach((key) => {
      if (Object.keys(considerMap).includes(key.toLowerCase()) && considerMap[key.toLowerCase()].length > 0) {
        const pickListFieldValues = this.dependentPicklistResults[key];
        if (!pickListFieldValues.some((item) => item.parentFieldValue === considerMap[key.toLowerCase()][0])) {
          throw new Error(
            `Parent value '${considerMap[key.toLowerCase()][0]}' not found in the picklist values for '${key}'`
          );
        }
        const filteredArray = pickListFieldValues.filter(
          (item) => item.parentFieldValue === considerMap[key.toLowerCase()][0]
        );

        if (filteredArray.length > 0) {
          const childValues = considerMap[filteredArray[0].childFieldName.toLowerCase()];
          if (Array.isArray(childValues)) {
            filteredArray[0].childValues = childValues;
          }
          this.dependentPicklistResults[key] = filteredArray;
        }
      }
    });
  }

  /**
   * Retrieves the controlling field name for a given dependent picklist field.
   * If the field has a controlling field, it returns its name; otherwise, it returns null.
   *
   * @param {any} dependentField - The dependent field object containing the controller name.
   * @returns {string | null} - The controlling field name if available, otherwise null.
   */

  private getControllingFieldName(dependentField: any): string | null {
    const controllerName: string | undefined = dependentField.controllerName as string | undefined;
    return controllerName ?? null;
  }

  /**
   * Converts the input JSON data into a nested structure based on the controlling field name and its dependent picklist values.
   * The function builds a mapping of parent field values to their corresponding child values and any additional nested structures.
   *
   * @param {Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>} input - The input JSON data mapping controlling field names to their dependent picklist values.
   * @param {string} controllingFieldName - The name of the controlling field to process in the input data.
   * @returns {any} - A nested structure containing parent values, child field names, and corresponding child values.
   */

  private convertJSON(
    input: Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>,
    controllingFieldName: string
  ): any {
    const output: any = {};

    if (input[controllingFieldName]) {
      const entries = input[controllingFieldName];
      const childFieldName = entries[0]?.childFieldName;

      output[controllingFieldName] = {
        type: 'dependent-picklist',
        values: [],
        'child-dependent-field': childFieldName,
        [childFieldName]: {},
      };

      entries.forEach((entry) => {
        (output[controllingFieldName]['values'] as string[]).push(entry.parentFieldValue);
        output[controllingFieldName][childFieldName][entry.parentFieldValue] = {
          values: entry.childValues,
        };

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<
          string,
          Fields
        >;
        if (nestedOutput) {
          Object.assign(output[controllingFieldName][childFieldName][entry.parentFieldValue], nestedOutput);
        }
      });
    }

    return output;
  }

  /**
   * Recursively builds a nested JSON structure for dependent picklist values based on the parent field and its values.
   * It processes the entries to construct a hierarchical mapping of parent field values to child field values and further nested structures.
   *
   * @param {Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>} input - The input JSON data mapping parent field values to their corresponding child field values.
   * @param {string} parentFieldName - The name of the parent field whose dependent child field values are to be processed.
   * @param {string[]} parentValues - The values of the parent field that will guide the creation of the nested structure.
   * @returns {any} - A nested JSON structure mapping parent values to their corresponding child field values, possibly containing further nested fields.
   */

  private buildNestedJSON(
    input: Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>,
    parentFieldName: string,
    parentValues: string[]
  ): any {
    if (!input[parentFieldName]) {
      return null;
    }

    const entries = input[parentFieldName];
    const childFieldName = entries[0]?.childFieldName;

    const output: any = {
      'child-dependent-field': childFieldName,
      [childFieldName]: {},
    };

    parentValues.forEach((parentValue) => {
      const matchingEntries = entries.filter((entry) => entry.parentFieldValue === parentValue);
      matchingEntries.forEach((entry) => {
        output[childFieldName][parentValue] = {
          values: entry.childValues,
        };

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<
          string,
          Fields
        > | null;

        if (nestedOutput) {
          Object.assign(output[childFieldName][parentValue], nestedOutput);
        }
      });
    });

    return output;
  }

  /**
   * Filters and returns the list of required fields from a given array of field metadata.
   * A field is considered required if its `IsNillable` property is `false`.
   *
   * @param {FieldRecord[]} fields - An array of `FieldRecord` objects representing the metadata of fields.
   * @returns {FieldRecord[]} - An array containing only the required (non-nillable) fields.
   */
  private getRequiredFields(fields: FieldRecord[]): FieldRecord[] {
    return fields.filter((record) => (
      record.IsNillable === false && record.DataType.toLowerCase() !== 'boolean'
    ));
  }

  /**
   * Merges an array of field records by removing duplicates based on the `QualifiedApiName` property.
   * If multiple records share the same `QualifiedApiName`, only the first occurrence is retained.
   *
   * @param {FieldRecord[]} fields - An array of `FieldRecord` objects to be merged.
   * @returns {FieldRecord[]} - A de-duplicated array of `FieldRecord` objects.
   */
  private mergeFieldsToPass(fields: FieldRecord[]): FieldRecord[] {
    const mergedFields = [...new Map(fields.map((field) => [field.QualifiedApiName, field])).values()];
    return mergedFields;
  }


  /**
   * Reads and processes fields from the initial JSON file for the specified Salesforce object
   * based on the provided configuration. This method builds a field query, retrieves the
   * relevant fields, and processes them accordingly.
   *
   * @param {Connection} conn - The Salesforce connection instance to interact with the org.
   * @param {any[]} config - The configuration array containing field information for processing.
   * @param {string} object - The name of the Salesforce object for which fields are being processed.
   * @returns {Promise<Partial<TargetData>[]>} - A promise resolving to an array of processed fields
   * in the format of `Partial<TargetData>`.
   */

  private async processObjectFieldsForIntitalJsonFile(
    conn: Connection,
    config: any[],
    object: string
  ): Promise<Array<Partial<TargetData>>> {
    const processedFields = await this.handleFieldProcessingForIntitalJsonFile(conn, object, config, 1);
    return processedFields;
  }

  /**
   * Processes fields for parent objects based on the provided Salesforce object and configuration.
   * It builds a query to fetch the fields, processes them, and returns the relevant field data.
   *
   * @param {Connection} conn - The Salesforce connection instance to interact with the org.
   * @param {string} object - The name of the Salesforce object for which parent fields are being processed.
   * @param {boolean} onlyRequiredFields - Flag to indicate if only required fields should be processed.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise resolving to an array of processed fields
   * in the format of `Partial<TargetData>`.
   */

  private async processObjectFieldsForParentObjects(
    conn: Connection,
    object: string,
    onlyRequiredFields: boolean,
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {

    const query = this.buildFieldQuery(object, onlyRequiredFields);

    const processedFields = await this.handleFieldProcessingForParentObjects(conn, query, object, currentDepth);
    return processedFields;
  }

  /**
   * Constructs a SOQL query to fetch the fields of a specified Salesforce object.
   * The query retrieves the fields that are creatable and optionally filters only required (non-nillable) fields.
   *
   * @param {string} object - The API name of the Salesforce object for which the fields are being queried.
   * @param {boolean} onlyRequiredFields - If true, the query will include only required (non-nillable) fields.
   * @returns {string} - The constructed SOQL query string.
   */

  private buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo, Length, Precision, Scale, RelationshipName FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
    if (onlyRequiredFields) {
      query += ' AND IsNillable = false';
    }
    return query;
  }

  /**
   * Inserts records into a specified Salesforce object using both REST and Bulk API based on data size.
   * It handles small batches directly and large datasets using bulk insert, processing batches in parallel with controlled concurrency.
   * Failed inserts are logged, and a progress bar is updated during bulk operations.
   *
   * @param {Connection} conn - The Salesforce connection instance used for performing the insert operations.
   * @param {string} object - The API name of the Salesforce object where records are being inserted.
   * @param {GenericRecord[]} jsonData - An array of JSON objects representing the records to be inserted.
   * @returns {Promise<CreateResult[]>} - A promise that resolves to an array of `CreateResult` objects representing the outcome of each insert operation.
   */

  public static async insertRecords(
    conn: Connection,
    object: string,
    jsonData: GenericRecord[],
    addToOutputTable: Boolean = false,
    level: number = 0
  ): Promise<CreateResult[]> {
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    if (!dataArray.length) return [];

    const sObjectName = Array.isArray(object) ? object[0] : object;
    const copyDataArray = JSON.parse(JSON.stringify(dataArray));
    const results: CreateResult[] = [];
    const errorCountMap: Map<string, number> = new Map();
    let failedCount = 0;
    const BATCH_SIZE = 100;
    const concurrencyLimit = 2;

    const handleErrors = (err: any, count = 1) => {
      const errorCode =
        (typeof err === 'object' && err?.statusCode) ||
        (typeof err === 'string' ? err.split(':')[0].trim().toUpperCase() : 'UNKNOWN_ERROR');
      const fields = err.fields || [];
      const fieldList = fields.length ? fields.join(', ') : 'UNKNOWN_FIELD';
      const errorTemplate =
        salesforceErrorMap[errorCode] ||
        `Failed to insert "${object}" records due to some issues: ${errorCode}`;
      const message = errorTemplate
        .replace('{field}', fieldList)
        .replace('{object}', sObjectName);
      const current = errorCountMap.get(message) ?? 0;
      errorCountMap.set(message, current + count);
    };

    const mapResults = (insertResults: any[]): CreateResult[] =>
      insertResults.map((result) => {
        if (!result.success) {
          failedCount++;
          (result.errors ?? []).forEach((err: any) => handleErrors(err));
          console.log(chalk.redBright('Error Message', result.errors[0].message));
        }
        return {
          id: result.id ?? '',
          success: result.success,
          errors: result.errors ?? [],
        };
      });

    const displayErrors = () => {
      if (failedCount > 0) {
        console.error(chalk.yellowBright(`Failed to insert ${failedCount} record(s) for ${sObjectName}`));
        console.error(chalk.whiteBright('Error breakdown:'));
        errorCountMap.forEach((_, message) => {
          console.error(`• ${chalk.redBright(message)}`);
        });
      }
    };

    //correct one with wrong table

    // const insertRelatedRecords = async (
    //   insertedResults: CreateResult[],
    //   sourceArray: GenericRecord[]
    // ) => {
    //   const allInsertedChildIds: CreateResult[] = [];
    //   for (let i = 0; i < insertedResults.length; i++) {
    //     const inserted = insertedResults[i];
    //     if (!inserted.success) continue;
    //     DataGenerate.pushParentId(sObjectName, [inserted.id]); 
    //     const relatedSObjects = sourceArray[i]?.relatedSObjects;
    //     if (!Array.isArray(relatedSObjects) || !relatedSObjects.length){
    //       continue;
    //     }

    //     const childPromises = relatedSObjects.map(async (rel: any) => {

    //       const parentFieldNames = Object.keys(rel.parentFieldName); 
    //       const childRecords = rel.records.map((rec: GenericRecord) => {
    //       const updatedRecord = { ...rec };

    //       parentFieldNames.forEach((fieldName) => {
    //         const parentSObject = rel.parentFieldName[fieldName].toLowerCase();
    //         const parentIds = DataGenerate.parentSObjectIds.get(parentSObject);
    //         if (parentIds && parentIds.length > 0) {
    //           updatedRecord[fieldName] = parentIds[parentIds.length - 1]; 
    //         } else {
    //           updatedRecord[fieldName] = null;
    //         }
    //       });
    //       return updatedRecord;
    //     });

    //     const childInsertResults: CreateResult[] =
    //       await DataGenerate.insertRecords(conn, rel.sObject, childRecords, true, level+1);

    //     childInsertResults.forEach((res) => {
    //       if (res.success) {
    //         allInsertedChildIds.push(res);
    //       }
    //     });

    //     return childInsertResults;
    //   });
    //   await Promise.all(childPromises);
    //     DataGenerate.popParentId(sObjectName);
    //   }
    //   return allInsertedChildIds;
    // };

    // order probelm with correct table

    const insertRelatedRecords = async (
      insertedResults: CreateResult[],
      sourceArray: GenericRecord[]
    ) => {
      const allInsertedChildIds: CreateResult[] = [];

      // Iterate through each successfully inserted parent record one by one
      for (let i = 0; i < insertedResults.length; i++) {
        const inserted = insertedResults[i];

        // 1. Skip if the record failed or has no related data
        if (!inserted.success || !inserted.id) continue;
        const relatedSObjects = sourceArray[i]?.relatedSObjects;
        if (!Array.isArray(relatedSObjects) || relatedSObjects.length === 0) continue;

        // 2. LOGICAL FIX: Push THIS specific record's ID to the stack
        // This allows children to find the correct parent ID
        DataGenerate.pushParentId(sObjectName, [inserted.id]);

        // 3. TABLE FIX: Use a sequential loop for child types
        // This ensures Branch A (e.g., QuoteLines) prints fully before Branch B (e.g., Orders)
        for (const rel of relatedSObjects) {
          const parentFieldNames = Object.keys(rel.parentFieldName);

          const childRecords = rel.records.map((rec: GenericRecord) => {
            const updatedRecord = { ...rec };

            parentFieldNames.forEach((fieldName) => {
              const targetParentSObject = rel.parentFieldName[fieldName].toLowerCase();
              const parentIds = DataGenerate.parentSObjectIds.get(targetParentSObject);

              if (parentIds && parentIds.length > 0) {
                // Assign the most recent ID pushed to the stack for this SObject type
                updatedRecord[fieldName] = parentIds[parentIds.length - 1];
              } else {
                updatedRecord[fieldName] = null;
              }
            });
            return updatedRecord;
          });

          // 4. Recursive Call: Wait for this branch to finish inserting (and printing its table rows)
          const childInsertResults: CreateResult[] = await DataGenerate.insertRecords(
            conn,
            rel.sObject,
            childRecords,
            true,
            level + 1 // Increment indentation level
          );

          childInsertResults.forEach((res) => {
            if (res.success) allInsertedChildIds.push(res);
          });
        }

        // 5. CLEANUP: Pop the ID after all related branches for THIS specific parent are done
        DataGenerate.popParentId(sObjectName);
      }

      return allInsertedChildIds;
    };


    // Main Logic

    try {
      // SMALL BATCH MODE
      if (dataArray.length <= BATCH_SIZE) {
        const dataWithoutRelated = dataArray.map(({ relatedSObjects, ...rest }) => rest);
        const insertResults = await conn.sobject(sObjectName).create(dataWithoutRelated);
        results.push(...mapResults(Array.isArray(insertResults) ? insertResults : [insertResults]));

        if (addToOutputTable) {
          DataGenerate.storeDataForOutputTable(sObjectName, failedCount, insertResults, level);
        }

        const childIds = await insertRelatedRecords(results, dataArray);
        results.push(...mapResults(Array.isArray(childIds) ? childIds : [childIds]));
        displayErrors();
        return results;
      }

      // INITIAL SMALL BATCH (SYNC)
      const initialBatch = dataArray.splice(0, BATCH_SIZE);
      const initialWithoutRelated = initialBatch.map(({ relatedSObjects, ...rest }) => rest);
      const initialResults = await conn.sobject(sObjectName).create(initialWithoutRelated);
      DataGenerate.storeDataForOutputTable(sObjectName, failedCount, initialResults, level);
      results.push(...mapResults(initialResults));

      // BULK INSERT FOR REMAINDER
      const remaining = dataArray.map(({ relatedSObjects, ...rest }) => rest);
      if (remaining.length) {
        const job = conn.bulk.createJob(sObjectName, 'insert');
        const batches: Array<Promise<void>> = [];
        progressBar.start(100, { title: 'Processing Records' });

        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batchData = remaining.slice(i, i + BATCH_SIZE);
          const batch = job.createBatch();

          const batchPromise = new Promise<void>((resolve, reject) => {
            batch.on('queue', () => batch.poll(1000, 900_000));
            batch.on('response', (rets: any[]) => {
              results.push(...mapResults(rets));
              const countFailed = rets.filter(r => r.success === false).length;
              DataGenerate.storeDataForOutputTable(sObjectName, countFailed, rets, level);
              const progress = Math.ceil(((i + batchData.length) / copyDataArray.length) * 100);
              progressBar.update(progress);
              resolve();
            });
            batch.on('error', (err: Error) => {
              handleErrors(err, batchData.length);
              failedCount += batchData.length;
              reject(err);
            });
            batch.execute(batchData);
          });

          batches.push(batchPromise);
          if (batches.length >= concurrencyLimit) await Promise.race(batches);
        }

        await Promise.all(batches);
        await job.close();
        progressBar.update(100);
        progressBar.finish();
      }

      // Handle related inserts
      await insertRelatedRecords(results, copyDataArray);

      // Final error summary
      displayErrors();
    } catch (error) {
      progressBar.stop();
      handleErrors(error);
      throw new Error([...errorCountMap.keys()].join('\n'));
    }

    return results;
  }



  /**
   * Updates the set of created record IDs for a specified Salesforce object based on the results of an insert operation.
   * This method filters the successful results and extracts their IDs, then updates the `createdRecordsIds` map with these IDs.
   *
   * @param {string} object - The API name of the Salesforce object for which the record IDs are being updated.
   * @param {CreateResult[]} results - An array of `CreateResult` objects representing the results of the insert operation.
   * @returns {void} - This method does not return any value.
   */
  // private updateCreatedRecordIds(object: string, results: CreateResult[]): void {
  //   const ids = results.filter(r => r.success).map(r => r.id);
  //   const existing = DataGenerate.createdRecordsIds.get(object) || [];
  //   DataGenerate.createdRecordsIds.set(object, existing.concat(ids));
  // }

  /**
   * Handles the processing of fields for generating the initial JSON file based on the provided configuration.
   * This method calls `processFieldsForInitialJsonFile` with the given file and Salesforce connection.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object to process.
   * @param {any[]} file - An array of field records representing the configuration for generating the initial JSON file.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */
  private async handleFieldProcessingForIntitalJsonFile(
    conn: Connection,
    object: string,
    file: any[],
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {
    return this.processFieldsForInitialJsonFile(file, conn, object, currentDepth);
  }

  /**
   * Handles the processing of fields for parent objects based on the provided query.
   * This method queries Salesforce for field data and then processes the fields using `processFieldsForParentObjects`.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} query - The SOQL query string to fetch field data.
   * @param {string} object - The API name of the Salesforce object to process.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */
  private async handleFieldProcessingForParentObjects(
    conn: Connection,
    query: string,
    object: string,
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {
    const result = await conn.query(query);
    const nameFieldResult = await conn.query(
      `SELECT QualifiedApiName, DataType, IsNillable, Length, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true AND IsNillable = true  AND IsNameField = true`
    );
    const combinedResults = [...result.records, ...nameFieldResult.records];
    const processFields = await this.processFieldsForParentObjects(combinedResults, conn, object, currentDepth);

    const allowedTypes = ['double', 'text', 'currency', 'percent', 'string'];

    const combinedResultsMap: { [key: string]: any } = {};
    combinedResults.forEach(field => {
      combinedResultsMap[field.QualifiedApiName] = field;
    });

    const updatedProcessFields: Partial<TargetData>[] = processFields.map(f => {
      if (!f.name || !f.type) {
        return f;
      }

      const updated: Partial<TargetData> = { ...f };

      const matching = combinedResultsMap[f.name];

      if (allowedTypes.includes(f.type)) {
        if (matching?.Length !== undefined && matching?.Length > 0) {
          updated.length = matching.Length;
        }
        else if (matching?.Precision !== undefined && matching?.Precision > 0) {
          updated.length = matching.Precision - (matching.Scale || 0);
        }
      }

      return updated;
    });
    return updatedProcessFields;
  }

  /**
   * Processes the fields from Salesforce records and prepares them for further use.
   * This method iterates through the records, identifies field types, and fetches related values as needed.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {boolean} isParentObject - Indicates whether the fields are from a parent object.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */


  private async processFields(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string,
    isParentObject: boolean,
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {
    const processedFields: Array<Partial<TargetData>> = [];



    if (object.toString().toLowerCase() === 'sbqq__quoteline__c' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'SBQQ__Product__c')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'orderitem' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'UnitPrice')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'order' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'AccountId' || element.QualifiedApiName === 'Pricebook2Id')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'medicationstatement' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'Status')
          element.IsNillable = false;
        else if (element.QualifiedApiName === 'MedicationId')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'medicationrequest' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'MedicationId')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'codesetbundle' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'CodeSet1Id')
          element.IsNillable = false;
      });
    }

    if (object.toString().toLowerCase() === 'careprogramenrollee' && isParentObject === true) {
      records.forEach(element => {
        if (element.QualifiedApiName === 'AccountId')
          element.IsNillable = false;
      });
    }

    for (const item of records) {
      const fieldName = isParentObject ? item.QualifiedApiName : item.name;
      const dataType = isParentObject ? item.DataType : item.type;
      const isReference = dataType === 'reference';
      const isPicklist = dataType === 'picklist' || dataType === 'multipicklist';

      if (item.QualifiedApiName === 'ShouldSyncWithOci' || (fieldName === 'MedicationCodeId' && object.toString().toLowerCase() === 'medicationrequest')) {
        continue;
      }

      if (excludeFieldsSet.has(fieldName)) continue;

      const details: Partial<TargetData> = { name: fieldName };

      const excludedReferenceFields = [
        'OwnerId',
        'resourceId',
        'RecordTypeId',
        'resourceId',
        'ServiceAppointmentId',
        'ServiceContractId',
        'SourceObjectId',
        'serviceResourceId',
        'CreatedById',
        'ParentId',
        'FulfillingBusinessHoursId',
        'DestinationLocationId',
        'SourceLocationId',
        'WorkOrderId',
        'OriginalOrderItemId',
        'WorkOrderLineItemId',
        'visitorAddressId',
        'MessagingChannelUsageId',
        'FilterCriteriaId',
        'BundlePolicyId',
        'DocumentVersionId',
        'MessagingChannelId',
        'ContentBodyId',
        'AssetWarrantyId',
        'ContentModifiedById',
        'ContentDocumentId',
        'PicklistId',
        'EntitlementId',
        'MaintenancePlanId',
        'ReturnOrderLineItemId',
        'ProductRequestLineItemId',
        'ProductServiceCampaignItemId',
        'ServiceTerritoryId',
        'ServiceReportTemplateId',
        'ParentWorkOrderLineItemId',
        'WorkOrderLineItemId',
        'RootAssetId',
        'DandbCompanyId',
        'CompanySignedId',
        'OriginalOrderId',
        'CompanyAuthorizedById',
        'AssetServicedById',
        'AssetProvidedById',
        'CampaignMemberRecordTypeId',
        'LogoId',
        'ReferenceRecordId',
        'ResourceId',
        'TravelModeId',
        'PaymentGatewayId',
        'PaymentMethodId',
        'ShiftTemplateId',
        'PaymentGatewayProviderId',
        'ReturnedById',
        'ProfileId',
        'UserLicenseId',
        'Groupid',
        'ServiceContractId',
        'ProcessInstanceId',
        'EmailTemplateId',
        'Alias',
      ];


      if (isReference && !(excludedReferenceFields.includes(fieldName) && !((object === 'address' || item.ReferenceTo === 'address' || object === 'productrequestlineitem') && fieldName === 'ParentId'))) {
        details.type = 'Custom List';
        const isMasterDetail = !isParentObject ? item.relationshipType !== 'lookup' : !item.IsNillable;
        // Creating new account record for the reference asset 
        if (item.QualifiedApiName === 'ContactId' && item.ReferenceTo.referenceTo[0] === 'Contact' && item.RelationshipName === 'Account') {
          details.values = await this.fetchRelatedMasterRecordIds(conn, 'Account', object, currentDepth + 1);
        }
        if (item.QualifiedApiName === 'ContactId' && item.ReferenceTo.referenceTo[0] === 'Contact') {
          details.values = await this.fetchRelatedMasterRecordIds(conn, item.ReferenceTo?.referenceTo, object, currentDepth + 1);
        }
        //  Always process AccountId and ContactId for Asset to satisfy validation
        if (object === 'Asset' && ['AccountId', 'ContactId'].includes(fieldName)) {
          const referenceTo = item.referenceTo ?? item.ReferenceTo?.referenceTo ?? item.ReferenceTo?.[0];
          const query = `SELECT Id FROM ${referenceTo} ORDER BY CreatedDate DESC LIMIT 1`;
          const result = await conn.query(query);
          const ids = result.records.map((record: any) => record.Id);
          details.values = ids;
          processedFields.push(details);
        }
        else if (item.values?.length) {
          details.values = item.values;
          processedFields.push(details);
        }

        else if (isMasterDetail) {
          if (item.name === 'OrderId' && item.referenceTo === 'Order') {
            details.values = await this.fetchRelatedMasterRecordIds(conn, 'Order', object, currentDepth + 1);
            processedFields.push(details);
            continue;
          }
          if (object === 'Contract' && item.QualifiedApiName === 'AccountId' && item.RelationshipName === 'Account') {
            continue;
          }
          if (item.referenceTo === 'BusinessHours') {
            const result = await conn.query<{ Id: string }>(
              'SELECT Id FROM BusinessHours WHERE IsDefault = true LIMIT 1'
            );

            details.values = result.records.map(r => r.Id);
            processedFields.push(details);
            continue;
          }
          details.values = await this.fetchRelatedMasterRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo, object, currentDepth + 1);
          processedFields.push(details);
        }
      }
      else if (isPicklist || item.values?.length > 0) {
        details.type = 'Custom List';

        details.values = await this.getPicklistValuesWithDependentValues(conn, object, fieldName, item);
        processedFields.push(details);
      } else {
        details.type = this.getFieldType(item, isParentObject);
        if (details.type) processedFields.push(details);
      }
    }
    if (object.toString().toLowerCase() === 'contact' && this.isObjectTemplateRelated(processedFields[0], 'HealthCloudGA')) {
      const result = await conn.query<{ Id: string; DeveloperName: string; }>(`
        SELECT Id, DeveloperName
        FROM RecordType
        WHERE SObjectType = 'Contact'
        AND DeveloperName = 'IndustriesBusiness'
        LIMIT 1
      `);
      const businessContactRTId = result.records[0]?.Id;
      if (businessContactRTId) {
        processedFields.push({ "name": "RecordTypeId", "type": "Custom List", "values": [businessContactRTId] })
      }
    }
    return processedFields;
  }


  /**
   * Processes the fields from Salesforce records to generate the initial JSON file data.
   * This method delegates the processing to `processFields`.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data for the initial JSON file.
   */
  private async processFieldsForInitialJsonFile(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string,
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {
    return this.processFields(records, conn, object, false, currentDepth);
  }

  /**
   * Processes fields for parent objects and retrieves related records, setting the `isParentObject` flag to `true`.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {number} currentDepth - The current recursion depth.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */

  private async processFieldsForParentObjects(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string,
    currentDepth: number
  ): Promise<Array<Partial<TargetData>>> {
    const objectDescribe = await conn.describe(object);
    const referenceFields = objectDescribe.fields
      .filter((field) =>
        field.type === 'reference' &&
        (!field.nillable || field.relationshipName) &&
        !['OwnerId', 'CreatedById', 'LastModifiedById', 'MasterRecordId'].includes(field.name)
      );

    for (const field of referenceFields) {
      if (!records.some(record => record.QualifiedApiName === field.name)) {
        records.push({
          QualifiedApiName: field.name,
          DataType: 'reference',
          IsNillable: field.nillable,
          ReferenceTo: { referenceTo: field.referenceTo },
          RelationshipName: field.relationshipName
        });
      }
    }
    return this.processFields(records, conn, object, true, currentDepth);
  }

  /**
   * Fetches related master record IDs from a given reference object, and creates new records if none exist.
   *
   * If related records are found, it returns their IDs. If no records are found, it attempts to generate data
   * for the given reference object, inserts the records, and then returns the IDs of the newly created records.
   *
   * @param {Connection} conn - The Salesforce connection object to execute queries and insert records.
   * @param {string} referenceTo - The name of the reference object whose related records are being fetched.
   * @param {string} object - The name of the SObject being processed that has the reference.
   * @param {number} currentDepth - The current recursion depth for creating related records.
   * @returns {Promise<string[]>} - A promise that resolves to an array of record IDs.
   * @throws {Error} - Throws an error if records cannot be fetched or inserted, or if maximum depth is reached.
   */

  private createdRecordCache: Record<string, string[]> = {};

  private async fetchRelatedMasterRecordIds(
    conn: Connection,
    referenceTo: string,
    object: string,
    currentDepth: number
  ): Promise<string[]> {
    if (currentDepth > 4) {
      throw new Error(`Too many levels of related records were followed for ${referenceTo}. Please simplify the relationship path or reduce nesting.`);
    }
    referenceTo = referenceTo.toString().split(',')[0].trim();

    if (this.createdRecordCache[referenceTo]?.length > 0) {
      return this.createdRecordCache[referenceTo];
    }

    if (referenceTo.toString().toLowerCase() === 'pricebook2') {
      const result = await conn.query(
        "SELECT Id FROM Pricebook2 WHERE Name = 'Standard Price Book' LIMIT 1"
      );
      if (!result.records.length) {
        throw new Error('Standard Price Book not found');
      }
      const pbId = result.records.length ? result.records[0].Id : null;

      return pbId ? [pbId] : [];
    }

    const processFields = await this.processObjectFieldsForParentObjects(conn, referenceTo, true, currentDepth);

    const fieldMap = processFields.reduce<Record<string, any>>((acc, field) => {
      if (field.name && field.type?.toLowerCase() !== 'boolean') {
        acc[field.name] = {
          type: field.type,
          values: field.values ?? [],
          label: field.label ?? field.name,
          length: field.length ?? undefined,
        };
      }
      return acc;
    }, {});

    if ('Name' in fieldMap) {
      fieldMap['Name'] = { "type": "text", "values": [], "label": `${referenceTo}Name`, "length": fieldMap['Name'].length ?? 255 }
    }

    if (((referenceTo === 'Contact' && (object === 'asset' || object === 'Asset')) ||
      (referenceTo === 'Contact' && (object === 'case' || object === 'Case'))) ||
      (referenceTo === 'Asset' || referenceTo === 'asset')) {
      const accountResult = await conn.query('SELECT Id FROM Account ORDER BY CreatedDate DESC LIMIT 1');
      const accountIds = accountResult.records.map((record: any) => record.Id);

      fieldMap['AccountId'] = {
        type: 'reference',
        values: accountIds,
        label: 'Account ID',
      };
    }
    if (referenceTo.toString().toLowerCase() === 'contract') {
      const accountResult = await conn.query('SELECT Id FROM Account ORDER BY CreatedDate DESC LIMIT 1');
      const accountIds = accountResult.records.map((record: any) => record.Id);

      if (accountIds.length === 0) {
        const newAccountId = await this.fetchRelatedMasterRecordIds(conn, 'Account', 'Contract', currentDepth + 1);
        fieldMap['AccountId'] = { type: 'reference', values: newAccountId, label: 'Account ID' };
      } else {
        fieldMap['AccountId'] = { type: 'reference', values: accountIds, label: 'Account ID' };
      }
      fieldMap['Status'] = { type: 'Custom List', values: ['Draft'], label: 'Status' };
      fieldMap['StartDate'] = { type: 'Custom List', values: [new Date().toISOString().split('T')[0]], label: 'Start Date' };
      fieldMap['ContractTerm'] = { type: 'Custom List', values: [12], label: 'Contract Term' };
      if (this.isObjectTemplateRelated(fieldMap, 'SBQQ')) {
        fieldMap['SBQQ__Evergreen__c'] = { type: 'Custom List', values: [false], label: 'Evergreen' };
      }
    }

    if (referenceTo.toString().toLowerCase() === 'order') {
      fieldMap['Status'] = { type: 'Custom List', values: ['Draft'], label: 'Status' };
    }

    if (referenceTo.toString().toLowerCase() === 'product2') {
      fieldMap['IsActive'] = { type: 'Custom List', values: ["true"], label: 'Is Active' };
      // fieldMap['Name'] = { "type": "text", "values": [], "label": "Product Name", "length": 255 }
    }

    if (referenceTo.toString().toLowerCase() === 'pricebookentry') {
      fieldMap['IsActive'] = { type: 'Custom List', values: ["false"], label: 'Is Active' };
      fieldMap['UseStandardPrice'] = { type: 'Custom List', values: ["false"], label: 'Use Standard Price' };
    }

    if (referenceTo.toString().toLowerCase() === 'orderitem') {
      const productResult = await conn.query('SELECT Id FROM Product2 ORDER BY CreatedDate DESC LIMIT 1');
      // Check if any records were returned
      if (productResult.records && productResult.records.length > 0) {
        const productId = productResult.records[0].Id;
        fieldMap['Product2Id'] = { type: 'Custom List', values: [productId], label: 'Product' };
      }
      const randomVal = Math.floor(Math.random() * 100000);
      fieldMap['UnitPrice'] = { type: 'Custom List', values: [randomVal], label: 'Unit Price' };
    }

    if (referenceTo.toString().toLowerCase() === 'account') {
      delete fieldMap['FirstName'];
      delete fieldMap['LastName'];
    }

    if (referenceTo.toString().toLowerCase() === 'contact') {
      const result = await conn.query(
        "SELECT Id FROM RecordType WHERE SObjectType = 'Contact' AND DeveloperName != 'Individual' LIMIT 1"
      );
      if (result.records.length > 0)
        fieldMap['RecordTypeId'] = { type: 'Custom List', values: [result.records[0].Id], label: 'Record Type Id' };
    }

    if (referenceTo.toString().toLowerCase() === 'problemdefinition') {
      fieldMap['UsageType'] = { type: 'Custom List', values: ["HealthCondition", "CareGap"], label: 'Usage Type' };
    }

    const initialJsonData = await GenerateTestData.getFieldsData(fieldMap, 1);

    if (!initialJsonData || initialJsonData.length === 0) {
      throw new Error(`Failed to generate valid data for ${referenceTo}`);
    }
    const enhancedJsonData = this.getJsonDataParentFields(initialJsonData, fieldMap);

    if (referenceTo.toString().toLowerCase() === 'clinicalencounter') {

      enhancedJsonData.forEach(record => {
        const date = new Date();
        record.status = 'Planned';
        record.StartDate = date.setDate(date.getDate() + 1);
      });
    }

    if (referenceTo.toString().toLowerCase() === 'codeset') {
      enhancedJsonData.forEach(record => {
        record.Code = record.Code + Math.floor(Math.random() * 10000);
      });
    }


    if (referenceTo.toString().toLowerCase() === 'caremetrictarget') {
      enhancedJsonData.forEach(record => {
        record['Type'] = 'Boolean';
      });
    }

    if (referenceTo.toString().toLowerCase() === 'clinicalencounteridentifier') {
      enhancedJsonData.forEach(record => {
        if ('IdValue' in record) {
          record['IdValue'] = record['IdValue'] + Math.floor(Math.random() * 10000);
        }
      });
    }

    if (referenceTo.toString().toLowerCase() === 'sbqq__quote__c') {
      enhancedJsonData.forEach(record => {
        record['SBQQ__Primary__c'] = true;
      });
    }


    const insertResult = await DataGenerate.insertRecords(conn, referenceTo, enhancedJsonData);

    const validIds = insertResult.filter((res) => res.success).map((res) => res.id);

    if (validIds.length === 0) {
      throw new Error(`Failed to insert records for ${referenceTo}`);
    }

    this.createdRecordCache[referenceTo] = validIds;

    return validIds;
  }


  /**
   * Retrieves picklist values for a given field from Salesforce.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {string} field - The name of the picklist field.
   * @param {Record<string, any>} item - The field record containing picklist information.
   * @returns {Promise<string[]>} - A promise that resolves to an array of picklist values.
   */
  private async getPicklistValuesWithDependentValues(
    conn: Connection,
    object: string,
    field: string,
    item: Record<string, any>
  ): Promise<string[]> {
    if (item.values != null && item.values.length > 0) {
      return item.values as string[];
    } else if (item.value != null && item.value.length > 0) {
      return [item.value] as string[];
    }
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    const picklistValues: string[] = fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
    return picklistValues;
  }

  /**
   * Processes the SObject configuration and returns a map of SObject names to their field objects.
   *
   * @returns {Promise<Map<string, any[]>>} - A promise that resolves to a map of SObject names to field objects.
   */

  private async getProcessedFields(): Promise<Map<string, any[]>> {
    const config = await readSObjectConfigFile();
    const sObjectFieldsMap: Map<string, any[]> = new Map();

    config.sObjects.forEach((sObject, index) => {
      if (sObject.fields) {
        const fieldsArray: any[] = []; // Temporary array to accumulate fields for each SObject
        for (const [fieldName, fieldDetails] of Object.entries(sObject.fields)) {
          if (fieldDetails.type === 'dependent-picklist') {
            this.processDependentPicklists(fieldName, fieldDetails, fieldsArray);
            continue;
          }
          let fieldObject: any = {
            name: fieldName,
            type: this.mapFieldType(fieldDetails.type),
          };

          if (fieldDetails.values?.length && fieldDetails.values?.length > 0) {
            fieldObject = {
              name: fieldName,
              values: fieldDetails.values,
            };
          }

          if (fieldDetails.type === 'picklist' || fieldDetails.type === 'reference') {
            fieldObject.values = fieldDetails.values ?? [];
            fieldObject.referenceTo = fieldDetails.referenceTo;
            fieldObject.relationshipType = fieldDetails.relationshipType;
          }

          fieldsArray.push(fieldObject);
        }

        if (fieldsArray.length > 0) {
          const key = `${sObject.sObject}_${index}`;
          sObjectFieldsMap.set(key, fieldsArray);
        }
      }
    });

    return sObjectFieldsMap;
  }


  /**
   * Maps field types from custom logic to predefined types.
   *
   * @param {fieldType} fieldTypes - The field type to map.
   * @returns {string} - The mapped field type as a string.
   */

  private mapFieldType(fieldTypes: fieldType): string {
    const typeMapping: { [key in fieldType]: string } = {
      picklist: 'picklist',
      reference: 'reference',
      'dependent-picklist': 'picklist'
    };

    return typeMapping[fieldTypes] || 'Unknown';
  }

  /**
   * Retrieves a random element from an array.
   *
   * @param {T[]} array - The array from which to select a random element.
   * @returns {T | undefined} - The randomly selected element or `undefined` if the array is empty.
   */

  private getRandomElement<T>(array: T[]): T | undefined {
    return array[Math.floor(Math.random() * array.length)];
  }


  /**
   * Processes dependent picklists by mapping parent values to child values and handling further dependencies.
   *
   * @param {string} fieldName - The name of the parent field.
   * @param {any} fieldDetails - The details of the field, including child-dependent fields.
   * @param {any[]} fieldsArray - The array to which field objects will be added.
   */
  private processDependentPicklists(fieldName: string, fieldDetails: any, fieldsArray: any[]): void {
    const parentField = fieldName;
    const childField = fieldDetails['child-dependent-field'] as string;

    const fieldObjectDepParent: any = {
      name: parentField,
      type: this.mapFieldType(fieldDetails.type as fieldType),
    };

    const fieldObjectChildParent: any = {
      name: childField,
      type: 'picklist',
    };

    const parentToChildFieldMap: Map<string, { values: string[]; childDependentField?: string }> = new Map();

    for (const [parentValue, childValuesObj] of Object.entries(
      fieldDetails[childField] as Record<string, { values: string[]; 'child-dependent-field'?: string }>
    )) {
      if (childValuesObj?.values) {
        parentToChildFieldMap.set(parentValue, {
          values: childValuesObj.values,
          childDependentField: childValuesObj['child-dependent-field'],
        });
      }
    }

    // Check if there are parent values
    if (parentToChildFieldMap.size > 0) {
      const parentValues = Array.from(parentToChildFieldMap.keys());
      const randomParentValue = this.getRandomElement(parentValues);

      if (randomParentValue) {
        const childDetails = parentToChildFieldMap.get(randomParentValue);

        if (childDetails) {
          const childValues = childDetails.values;
          const childDependentField = childDetails.childDependentField;
          const randomChildValue = this.getRandomElement(childValues);

          if (randomChildValue) {
            fieldObjectDepParent.value = randomParentValue;
            fieldObjectChildParent.value = [randomChildValue];

            // Add field objects to fieldsArray
            fieldsArray.push(fieldObjectDepParent);
            fieldsArray.push(fieldObjectChildParent);

            // Check for further dependencies on the selected child value
            if (childDependentField) {
              const childFieldDetails = fieldDetails[childField][randomParentValue] as Record<string, Field>;
              if (childFieldDetails?.[childDependentField]) {
                const grandChildFieldDetails = (childFieldDetails[childDependentField] as Record<string, any>)[
                  randomChildValue
                ] as Record<string, Field>;

                // Updated: handle nested values inside the `values` key
                if (grandChildFieldDetails?.['values']) {
                  const grandChildValues = grandChildFieldDetails['values'];
                  if (grandChildValues) {
                    const grandChildFieldObject: any = {
                      name: childDependentField,
                      type: 'picklist',
                      value: Array.isArray(grandChildValues)
                        ? (this.getRandomElement(grandChildValues) as string)
                        : undefined,
                    };
                    fieldsArray.push(grandChildFieldObject);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Checks if a single record object contains any field that starts 
   * with the specified prefix (e.g., 'SBQQ__').
   * * @param record The single record object (map) to check (e.g., enhancedData[index]).
   * @param prefix The field API name prefix to search for (case-insensitive).
   * @returns true if any field in the record starts with the prefix, false otherwise.
   */
  private isObjectTemplateRelated(record: Record<string, any>, prefix: string): boolean {
    if (typeof record !== 'object' || record === null) {
      return false;
    }

    const prefixLower = prefix.toLowerCase();

    // Iterate over the keys (field API names) of the record object
    for (const fieldName in record) {
      // Use hasOwnProperty to ensure we only check fields directly on the record
      if (Object.prototype.hasOwnProperty.call(record, fieldName)) {
        if (fieldName.toLowerCase().startsWith(prefixLower)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Enhances basic data by adding values from processed fields, particularly for "Custom List" fields.
   * It randomly assigns values from the `processedFields` array to the corresponding records in `basicData`.
   *
   * @param {any[]} basicData - The array of basic data to be enhanced.
   * @param {Array<Partial<TargetData>>} processedFields - The fields containing special configurations like "Custom List".
   * @param {number} count - The number of records to process.
   * @returns {any[]} - The enhanced data with special field values added.
   */

  private enhanceDataWithSpecialFields(
    basicData: any[],
    processedFields: Array<Partial<TargetData>>,
    count: number,
    object: string
  ): any[] {
    const enhancedData = basicData.map((item) => ({ ...item }));
    this.getRandomElement = <T>(array: T[]): T | undefined => {
      const element = array[Math.floor(Math.random() * array.length)];
      return Array.isArray(element) ? element[0] : element;
    };
    let counter = 0;
    function generateUniqueSourceSystemId(baseId: string): string {
      counter += 1;
      return `${baseId}${Date.now().toString(36)}${counter.toString(36)}`;
    }

    if (object === 'product2') {
      enhancedData.forEach((record, i) => {
        record['StockKeepingUnit'] = 'SKU-' + Math.floor(Math.random() * 1000000) + i;
      });
    }

    if (object === 'event') {
      const date = new Date();
      const formattedDate = date.toISOString().slice(0, 19);
      enhancedData.forEach((record) => {
        record['IsAllDayEvent'] = 'false';
        record['IsPrivate'] = 'false';
        record['ActivityDateTime'] = formattedDate;
      });
    }

    if (object === 'apptbundleaggrdurdnscale') {
      enhancedData.forEach((record) => {
        record['FromBundleMemberNumber'] = String(Math.floor(Math.random() * 90) + 10);
        record['PercentageOfReduction'] = String(Math.floor(Math.random() * 90) + 10);
      });
    }

    if (object === 'consumptionrate') {
      enhancedData.forEach((record) => {
        const lower = Math.floor(Math.random() * 90) + 10;
        record['LowerBound'] = lower;
        record['UpperBound'] = Math.floor(Math.random() * (900 - (lower - 10))) + lower + 1;
      });
    }

    if (object === 'ConsumptionSchedule') {
      enhancedData.forEach((record) => {
        record['isActive'] = false;
        record['BillingTermUnit'] = 'Year';
        record['BillingTerm'] = Math.floor(Math.random() * 5) + 1;
      });

    }

    if (object === 'individual') {
      enhancedData.forEach((record) => {
        record['BirthDate'] = '2001-05-10';
        record['DeathDate'] = '2023-05-10';
      });
    }
    if (object === 'shifttemplate') {
      enhancedData.forEach((record) => {
        record['BackgroundColor'] = '#000000';
        record['StartTime'] = '08:00:00.000Z';
      });
    }
    if (object.toLowerCase() === 'opportunity' && this.isObjectTemplateRelated(enhancedData[0], 'SBQQ')) {
      enhancedData.forEach((record) => {
        if ('Pricebook2Id' in record) {
          record['SBQQ__QuotePricebookId__c'] = record['Pricebook2Id'];
        } else {
          record['SBQQ__QuotePricebookId__c'] = '';
        }
      })
    }
    if (object.toLowerCase() === 'sbqq__quote__c') {
      enhancedData.forEach((record) => {
        if ('SBQQ__Key__c' in record) {
          record['SBQQ__Key__c'] = record['SBQQ__Key__c'] + '-' + Math.floor(Math.random() * 10000);
        }
        if ('SBQQ__PriceBook__c' in record) {
          record['SBQQ__PricebookId__c'] = record['SBQQ__PriceBook__c'];
        } else {
          record['SBQQ__PricebookId__c'] = '';
        }
        record['SBQQ__Primary__c'] = 'true';
      })
    }
    if (object.toLowerCase() === 'contract' && this.isObjectTemplateRelated(enhancedData[0], 'SBQQ')) {
      enhancedData.forEach((record) => {
        record['Status'] = 'Draft';
        record['SBQQ__Evergreen__c'] = 'false';
      })
    }
    if (object.toString().toLowerCase() === 'taskray__project__c') {
      enhancedData.forEach(record => {
        if ('TASKRAY__trNickname__c' in record) {
          record.TASKRAY__trNickname__c = record.TASKRAY__trNickname__c + '-' + Math.floor(Math.random() * 1000)
        }
      });
    }

    if (
      object.toString().toLowerCase() === 'account' &&
      this.isObjectTemplateRelated(enhancedData[0], 'HealthCloudGA')
    ) {
      enhancedData.forEach((record: any) => {
        if (record.HealthCloudGA__SourceSystemId__c) {
          record.HealthCloudGA__SourceSystemId__c =
            generateUniqueSourceSystemId(record.HealthCloudGA__SourceSystemId__c);
        }
        if (record.HealthCloudGA__SourceSystemId__pc) {
          record.HealthCloudGA__SourceSystemId__pc =
            generateUniqueSourceSystemId(record.HealthCloudGA__SourceSystemId__pc);
        }
        if (record.SourceSystemIdentifier) {
          record.SourceSystemIdentifier =
            generateUniqueSourceSystemId(record.SourceSystemIdentifier);
        }
      });
    }

    if (object.toString().toLowerCase() === 'medication') {
      enhancedData.forEach((record, i) => {
        if ('BatchNumber' in record && record['BatchNumber'].toString().length > 9) {
          record['BatchNumber'] = Math.floor(Math.random() * 100000);
        }
      });
    }

    if (object.toString().toLowerCase() === 'caremetrictarget') {
      enhancedData.forEach((record, i) => {
        if ('LowerLimit' in record && 'UpperLimit' in record && record['LowerLimit'] >= record['UpperLimit']) {
          record['LowerLimit'] = record['UpperLimit'] - 1;
        }
      });
    }

    if (object.toString().toLowerCase() === 'case' && this.isObjectTemplateRelated(enhancedData[0], 'HealthCloudGA')) {
      enhancedData.forEach((record, i) => {
        if ('HealthCloudGA__SourceSystemID__c' in record) {
          record['HealthCloudGA__SourceSystemID__c'] = generateUniqueSourceSystemId(record['HealthCloudGA__SourceSystemID__c']);
        }
      });
    }

    for (const field of processedFields) {
      if (field.type === 'Custom List' && field.values && field.name !== 'TaskSubtype') {
        const values = Array.from({ length: count }, () => this.getRandomElement(field.values ?? []));
        values.forEach((value, index) => {
          if (field.name) {
            enhancedData[index][field.name] = value;
          }
          if (field.name === 'TaskSubtype') {
            enhancedData.forEach(record => {
              record['TaskSubtype'] = 'Task';
            });
          }

        });
      }
    }

    if (object.toLowerCase() === 'sbqq__quoteline__c') {
      enhancedData.forEach((record) => {
        if ('SBQQ__ProductSubscriptionType__c' in record) {
          record['SBQQ__SubscriptionType__c'] = record['SBQQ__ProductSubscriptionType__c'].includes('/') ? 'Renewable' : record['SBQQ__ProductSubscriptionType__c'];
          if (record['SBQQ__ProductSubscriptionType__c'].toLowerCase() === 'evergreen') {
            record['SBQQ__SubscriptionTerm__c'] = 1;
            if (record['SBQQ__BillingFrequency__c'] === "Invoice Plan") record['SBQQ__BillingFrequency__c'] = "";
            delete record['SBQQ__EndDate__c'];
          }
          if (record['SBQQ__ChargeType__c'] === 'One-Time') {
            record['SBQQ__ChargeType__c'] = 'Recurring';
          }
        }
        if ('SBQQ__ChargeType__c' in record) {
          if (record['SBQQ__ChargeType__c'] === 'One-Time' || record['SBQQ__ChargeType__c'] === 'Usage') {
            record['SBQQ__BillingType__c'] = "";
          }
          if (record['SBQQ__ChargeType__c'] === 'One-Time') {
            record['SBQQ__BillingFrequency__c'] = "";
          }
        }
        const earliest = record['SBQQ__EarliestValidAmendmentStartDate__c'];
        const start = record['SBQQ__StartDate__c'];

        if (earliest && start && earliest > start) {
          record['SBQQ__EarliestValidAmendmentStartDate__c'] = start;
          record['SBQQ__StartDate__c'] = earliest;
        }

        if ('SBQQ__AdditionalDiscountAmount__c' in record) {
          delete record['SBQQ__Discount__c'];
        }
        if ('SBQQ__MarkupAmount__c' in record) {
          delete record['SBQQ__MarkupRate__c'];
        }
      })
    }

    if (object.toLowerCase() === 'orderitem') {
      enhancedData.forEach((record) => {
        if ('SBQQ__ProductSubscriptionType__c' in record) {
          record['SBQQ__SubscriptionType__c'] = record['SBQQ__ProductSubscriptionType__c'].includes('/') ? 'Renewable' : record['SBQQ__ProductSubscriptionType__c'];
          if (record['SBQQ__ProductSubscriptionType__c'].toLowerCase() === 'evergreen') {
            record['SBQQ__SubscriptionTerm__c'] = 1;
            if (record['SBQQ__BillingFrequency__c'] === "Invoice Plan") record['SBQQ__BillingFrequency__c'] = "";
            delete record['EndDate'];

            if (record['SBQQ__ChargeType__c'] === 'One-Time') {
              record['SBQQ__ChargeType__c'] = 'Recurring';
            }
          }
        }
        if ('SBQQ__ChargeType__c' in record) {
          if (record['SBQQ__ChargeType__c'] === 'One-Time' || record['SBQQ__ChargeType__c'] === 'Usage') {
            record['SBQQ__BillingType__c'] = "";
          }
          if (record['SBQQ__ChargeType__c'] === 'One-Time') {
            record['SBQQ__BillingFrequency__c'] = "";
          }
        }
      })
    }

    if (object.toString().toLowerCase() === 'careobservation') {
      enhancedData.forEach((record) => {
        if ('ObservedValueType' in record) {
          delete record['ObservedValueText'];
          delete record['ObservationStartTime'];
          delete record['ObservationEndTime'];
          delete record['ObservedValueCodeId'];

          if (record['ObservedValueType'] === 'Quantity') {
            delete record['ObservedValueDenominator']
          }
        }

        if (record['UpperBaselineValue'] <= record['LowerBaselineValue']) {
          record['UpperBaselineValue'] += record['LowerBaselineValue'];
        }
      });
    }

    if (object.toString().toLowerCase() === 'clinicalencounter') {
      const today = new Date();
      enhancedData.forEach((record) => {
        if (record['Status'] === 'Planned') {
          record['StartDate'] = today.setDate(today.getDate() + 1);
        } else {
          record['StartDate'] = today.setDate(today.getDate() - 1);
        }
      });
    }

    return enhancedData;
  }

  /**
   * Enhances JSON data by adding random values from a specified field map for "Custom List" or "reference" fields.
   * It only adds values for fields that are not already populated.
   *
   * @param {any[]} jsonData - The JSON data to enhance with additional field values.
   * @param {Record<string, { type: string; values: any[]; label: string }>} fieldMap - A map of field names to field details (type, possible values, and label).
   * @returns {any[]} - The enhanced JSON data with new field values added.
   */

  private getJsonDataParentFields(
    jsonData: any[],
    fieldMap: Record<string, { type: string; values: any[]; label: string; length?: number }>
  ): any[] {

    if (!jsonData || jsonData.length === 0) {
      throw new Error('No JSON data found.');
    }

    // Enhance each record in the JSON data
    let enhancedData = jsonData.map((record) => ({ ...record }));

    for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
      const { type, values } = fieldDetails;

      // Skip if the field is already populated or if no values are available
      if (values.length === 0 || enhancedData.every((record) => fieldName in record)) {
        continue;
      }

      // Handle fields that need values (e.g., Custom List or reference)
      if (type === 'Custom List' || type === 'reference') {
        enhancedData = enhancedData.map((record) => {
          if (!(fieldName in record)) {
            return { ...record, [fieldName]: this.getRandomElement(values) };
          }
          return record;
        });
      }
    }

    enhancedData = enhancedData.map((record) => {
      const updatedRecord = { ...record };

      for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
        const { length } = fieldDetails;

        if (length !== undefined && length > 0 && fieldName in updatedRecord) {
          let valueAsString = String(updatedRecord[fieldName]);
          if (valueAsString.length > length) {
            valueAsString = valueAsString.substring(0, length);

            switch (fieldDetails.type) {
              case "double":
              case "currency":
              case "percent":
              case "number":
                updatedRecord[fieldName] = Number(valueAsString);
                break;
              default:
                updatedRecord[fieldName] = valueAsString;
            }
          }
        }
      }

      return updatedRecord;
    });

    return enhancedData;
  }

  private static storeDataForOutputTable(
    sObjectName: string,
    failedCount: number,
    dataArray: GenericRecord[],
    level: number
  ) {
    DataGenerate.objectWithFaliures.push({
      sObject: sObjectName,
      failedCount: failedCount,
      count: dataArray.length,
      level: level
    });

    //  Update the global ID cache for reference resolution
    const ids = (Array.isArray(dataArray) ? dataArray : [dataArray])
      .filter(r => r.success)
      .map(r => r.id);
    const existing = DataGenerate.createdRecordsIds.get(sObjectName) || [];
    DataGenerate.createdRecordsIds.set(sObjectName, existing.concat(ids as string[]));
  }
}
