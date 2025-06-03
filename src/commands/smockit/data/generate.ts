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

import { Flags, Progress, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { loadAndValidateConfig, readSObjectConfigFile } from '../../../services/config-manager.js';
import {
  templateSchema,
  sObjectSchemaType,
  DataGenerateResult,
  FieldRecord,
  Fields,
  TargetData,
  fieldType,
  Field,
  jsonConfig,
  GenericRecord,
  CreateResult,
} from '../../../utils/types.js';
import { createTable, createResultEntryTable } from '../../../utils/output_table.js';
import { saveOutputFileOfJsonAndCsv, saveCreatedRecordIds } from '../../../services/output-formatter.js';
import { connectToSalesforceOrg } from '../../../utils/generic_function.js';
import { restrictedObjects, insertRecordsspecial, userLicenseObjects, salesforceErrorMap } from '../../../utils/conditional_object_handling.js';


const fieldsConfigFile = 'generated_output.json';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('smock-it', 'data.generate');

let depthForRecord = 0;

const excludeFieldsSet = new Set<string>();

const progressBar = new Progress(true);

export default class DataGenerate extends SfCommand<DataGenerateResult> {
  public static createdRecordsIds: Map<string, string[]> = new Map();

  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    sObject: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObject.summary'),
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
    // load and validate template baseConfig file
    const baseConfig = await loadAndValidateConfig(conn, flags.templateName);

    // Process specific object configuration
    const objectsToProcess = this.processObjectConfiguration(baseConfig, flags.sObject);

    const restrictedObjectsFound = objectsToProcess
      .map(obj => Object.keys(obj)[0])
      .filter(key => restrictedObjects.includes(key));
    const hasRestrictedValue = restrictedObjectsFound.length > 0;

    if (hasRestrictedValue) {
      throw new Error(`Smockit will not able to generate the data for the sObject ${chalk.yellow(restrictedObjectsFound.join(', '))}. Please try with different sObject(s).`);
    }

    // Generate fields and write generated_output.json config
    await this.generateFieldsAndWriteConfig(conn, objectsToProcess, baseConfig);

    excludeFieldsSet.clear();

    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap = await this.getProcessedFields();
    const generateOutputconfigPath = path.join(process.cwd(), 'data_gen', 'output', fieldsConfigFile);
    const generatedOutputconfigData = fs.readFileSync(generateOutputconfigPath, 'utf8');
    const jsonDataForObjectNames: jsonConfig = JSON.parse(generatedOutputconfigData) as jsonConfig;

    const outputFormat = jsonDataForObjectNames.outputFormat ?? [];
    const sObjectNames = jsonDataForObjectNames.sObjects.map((sObject: { sObject: string }) => sObject.sObject);

    const outputPathDir = `${path.join(process.cwd())}/data_gen/output/`;

    const table = createTable();

    let failedCount = 0;
    const startTime = Date.now();
    for (const object of sObjectNames) {
      depthForRecord = 0;
      const currentSObject = jsonDataForObjectNames.sObjects.find(
        (sObject: { sObject: string }) => sObject.sObject === object
      );
      if (!currentSObject) {
        throw new Error(`No configuration found for object: ${object}`);
      }
      const countofRecordsToGenerate = currentSObject.count;
      if ((object.toLowerCase() === 'location' || object.toLowerCase() === 'servicecontract') && (countofRecordsToGenerate ?? 1) >= 10000) {
        throw new Error(chalk.yellow.bold(`Salesforce does not support generating 10,000 or more records for SObject ${chalk.blue(object)} — Kindly review and adjust to stay within this limit!`));
      }

      if (object.toLowerCase() === 'campaignmember' && (countofRecordsToGenerate ?? 0) > 1) {
        throw new Error(chalk.yellow.bold(`Currently Supports only 1 record for sObject ${chalk.blue(object)} — Kindly review and adjust to stay within this limit!`));
      }

      if (object.toLowerCase() === 'consumptionrate' && (countofRecordsToGenerate ?? 0) > 500) {
        console.warn(chalk.blue(`You can create up to 500 records for the '${object}' object.`))
      }

      const fields = sObjectFieldsMap.get(object);

      if (!fields) {
        this.log(`No fields found for object: ${object}`);
        continue;
      }
      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, fields, object);
      if (countofRecordsToGenerate === undefined) {
        throw new Error(`Count for object "${object}" is undefined.`);
      }
      // fetching the basic fields data from the Data Library
      const basicJsonData = await GenerateTestData.generate(generateOutputconfigPath, object);

      // adding all fields to the json data
      const jsonData = this.enhanceDataWithSpecialFields(basicJsonData, processedFields, countofRecordsToGenerate, object);

      // save the output file in json and csv format
      saveOutputFileOfJsonAndCsv(jsonData as GenericRecord[], object, outputFormat, flags.templateName);

      // handling failedCount and insertedRecordIds
      const { failedCount: failedInsertions } = await this.handleDirectInsert(
        conn,
        outputFormat,
        object,
        jsonData as GenericRecord[]
      );
      failedCount = failedInsertions; // Update the failed count

      const resultEntry = createResultEntryTable(object, outputFormat, failedCount, countofRecordsToGenerate);      // adding values to the result output table
      table.addRow(resultEntry);
    }
    // Save created record IDs file
    saveCreatedRecordIds(outputFormat, flags.templateName);
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    this.log(chalk.blue.bold(`\nResults: \x1b]8;;${outputPathDir}\x1b\\${totalTime}(s)\x1b]8;;\x1b\\`));
    table.printTable();
    return { path: flags.templateName };
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
          considerMap[key.substring(3)] = configForObject['fieldsToConsider'][key];
        } else {
          considerMap[key] = configForObject['fieldsToConsider'][key];
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

  private processObjectConfiguration(baseConfig: templateSchema, objectNames?: string): sObjectSchemaType[] {
    const allObjects = baseConfig.sObjects;
    if (!objectNames) {
      const result = allObjects.map(obj => {
        const key = Object.keys(obj)[0];
        return { [key.toLowerCase()]: obj[key] };
      });

      // Check for unsupported objects
      const foundUnsupported = result
        .map(obj => Object.keys(obj)[0])
        .filter(key => userLicenseObjects.has(key));

      if (foundUnsupported.length > 0) {
        throw new Error(`Action blocked for SObjects ${chalk.yellow(foundUnsupported.join(', '))}! Requires Salesforce user license.`);

      }
      return result;
    }

    const nameSet = new Set(objectNames.split(',').map(name => name.trim().toLowerCase()));
    const availableNames = new Set(
      allObjects.map((obj: any) => Object.keys(obj)[0]?.toLowerCase())
    );

    const missingNames = Array.from(nameSet).filter(name => !availableNames.has(name));
    if (missingNames.length > 0) {
      throw new Error(
        `The following specified objects were not found in template: ${chalk.yellow(missingNames.join(', '))}`
      );
    }

    const matchedObjects = allObjects
      .map((object: any) => {
        const key = Object.keys(object)[0];
        const value = object[key];
        const lowerKey = key.toLowerCase();
        if (nameSet.has(lowerKey)) {
          return { [lowerKey]: value };
        }
        return null;
      })
      .filter((obj): obj is sObjectSchemaType => obj !== null);

    // Check for unsupported objects in matched objects
    const foundUnsupported = matchedObjects
      .map(obj => Object.keys(obj)[0])
      .filter(key => userLicenseObjects.has(key));

    if (foundUnsupported.length > 0) {
      throw new Error(`Action blocked for ${foundUnsupported.join(', ')}: Requires Salesforce user license.`);
    }

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
    baseConfig: templateSchema
  ): Promise<void> {
    const outputData: any[] = [];

    for (const objectConfig of objectsToProcess) {
      const objectName = Object.keys(objectConfig as Record<string, any>)[0];
      const configForObject: sObjectSchemaType = (objectConfig as Record<string, any>)[objectName] as sObjectSchemaType;

      const namespacePrefixToExclude =
        baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';

      const allFields = await conn.query(
        `SELECT QualifiedApiName, IsDependentPicklist, Label, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable
       FROM EntityParticle
       WHERE EntityDefinition.QualifiedApiName = '${objectName}'
       AND IsCreatable = true
       AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
      );

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

      const fieldsToPass = this.filterFieldsByPickLeftConfig(
        getPickLeftFields,
        configForObject,
        fieldsToConsider,
        fieldsToExclude,
        fieldsToIgnore,
        allFields
      );

      const fieldsObject = await this.processFieldsWithFieldsValues(conn, fieldsToPass, objectName, considerMap);

      const configToWrite: any = {
        sObject: objectName,
        count: configForObject.count ?? baseConfig.count,
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
    fs.writeFileSync(
      outputFile,
      JSON.stringify({ outputFormat: baseConfig.outputFormat, sObjects: outputData }, null, 2),
      'utf8'
    );
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
            };
          }


          else {
            let label = inputObject.Label;
            if (
              objectName.toLowerCase() === 'opportunity' || objectName.toLowerCase() === 'campaign'
            ) {
              if (inputObject.QualifiedApiName === 'Name') {
                label = objectName + ' ' + label;
              }
            }

            fieldConfig = {
              type: 'text',
              values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
                : [],
              label,
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
            if ((objectName === 'contract' || objectName === 'order' || objectName === 'listemail') && inputObject.QualifiedApiName === 'Status') {
              picklistValues = ['Draft'];
            }

            if ((objectName === 'alternativepaymentmethod' || objectName === 'paymentauthorization' || objectName === 'refund') && inputObject.QualifiedApiName === 'ProcessingMode') {
              picklistValues = ['External'];
            }
            if ((objectName === 'paymentauthadjustment' || objectName === 'paymentauthorization' || objectName === 'refund') && inputObject.QualifiedApiName === 'Status') {
              picklistValues = ['Processed'];
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

        default:

          if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
            fieldConfig = {
              type: inputObject.DataType,
              values: considerMap[inputObject.QualifiedApiName.toLowerCase()],
              label: inputObject.Label,
            };
          } else {
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
  ): Promise<{ failedCount: number; insertedIds: string[] }> {
    if (!outputFormat.includes('DI') && !outputFormat.includes('di')) {
      return { failedCount: 0, insertedIds: [] };
    }

    const errorMessages: Map<string, number> = new Map();
    const insertedIds: string[] = [];
    let failedCount = 0;

    try {
      let insertResult;
      if (
        object.toLowerCase() === 'order' ||
        object.toLowerCase() === 'task' ||
        object.toLowerCase() === 'productitemtransaction' ||
        object.toLowerCase() === 'event'
      ) {
        insertResult = await insertRecordsspecial(conn, object, jsonData);
      } else {
        insertResult = await DataGenerate.insertRecords(conn, object, jsonData);
      }

      insertResult.forEach((result: { id?: string; success: boolean; errors?: any[] }, index: number) => {
        if (result.success && result.id) {
          insertedIds.push(result.id);
        }
        else if (result.errors) {
          result.errors.forEach((error) => {
            let errorCode: string;
            if (typeof error != 'object') {
              errorCode = error.split(':')[0].trim().toUpperCase();
            } else if (typeof error === 'object' && error !== null && 'statusCode' in error) {
              errorCode = error.statusCode;
            } else {
              errorCode = 'UNKNOWN_ERROR';
            }
            const fields = (error as { fields?: string[] })?.fields || [];
            const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
            const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues. ${errorCode}`;
            const humanReadableMessage = errorTemplate
              .replace('{field}', fieldList)
              .replace('{object}', object);
            const currentCount = errorMessages.get(humanReadableMessage) ?? 0;
            errorMessages.set(humanReadableMessage, currentCount + 1);
            failedCount++;
          });
        }
      });

      this.updateCreatedRecordIds(object, insertResult);
      return { failedCount, insertedIds };
    } catch (error) {
      const errorCode = (error as any).statusCode || 'UNKNOWN_ERROR';
      const fields = (error as any).fields || [];
      const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
      const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues. ${errorCode}`;
      const humanReadableMessage = errorTemplate
        .replace('{field}', fieldList)
        .replace('{object}', object);
      console.error(chalk.redBright(`Error (${failedCount + 1}): ${humanReadableMessage}`));
      return { failedCount: failedCount + 1, insertedIds };
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
        const fieldConsiderationValues: string[] = considerMap[field.toLowerCase()] as string[];
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
    return fields.filter((record) => record.IsNillable === false);
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
    const processedFields = await this.handleFieldProcessingForIntitalJsonFile(conn, object, config);
    return processedFields;
  }

  /**
   * Processes fields for parent objects based on the provided Salesforce object and configuration.
   * It builds a query to fetch the fields, processes them, and returns the relevant field data.
   *
   * @param {Connection} conn - The Salesforce connection instance to interact with the org.
   * @param {string} object - The name of the Salesforce object for which parent fields are being processed.
   * @param {boolean} onlyRequiredFields - Flag to indicate if only required fields should be processed.
   * @returns {Promise<Partial<TargetData>[]>} - A promise resolving to an array of processed fields
   * in the format of `Partial<TargetData>`.
   */

  private async processObjectFieldsForParentObjects(
    conn: Connection,
    object: string,
    onlyRequiredFields: boolean
  ): Promise<Array<Partial<TargetData>>> {

    const query = this.buildFieldQuery(object, onlyRequiredFields);

    const processedFields = await this.handleFieldProcessingForParentObjects(conn, query, object);
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
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo, RelationshipName FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
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
    jsonData: GenericRecord[]
  ): Promise<CreateResult[]> {
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const sObjectName = Array.isArray(object) ? object[0] : object;
    const results: CreateResult[] = [];
    let failedCount = 0;
    const errorCountMap: Map<string, number> = new Map();
    if (!dataArray.length) return results;

    const BATCH_SIZE = 100;

    // Helper function to map results
    const mapResults = (insertResults: any, startIndex: number): CreateResult[] =>
      (Array.isArray(insertResults) ? insertResults : [insertResults]).map((result, index) => {
        if (!result.success) {
          failedCount++;

          if (result.errors && Array.isArray(result.errors)) {
            result.errors.forEach((err: any) => {
              let errorCode: string;
              if (typeof err != 'object') {
                errorCode = err.split(':')[0].trim().toUpperCase();
              } else if (typeof err === 'object' && err !== null && 'statusCode' in err) {
                errorCode = err.statusCode;
              } else {
                errorCode = 'UNKNOWN_ERROR';
              }
              const fields = err.fields || [];
              const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
              const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues. ${errorCode}`;
              const humanReadableMessage = errorTemplate
                .replace('{field}', fieldList)
                .replace('{object}', sObjectName);
              const currentCount = errorCountMap.get(humanReadableMessage) ?? 0;
              errorCountMap.set(humanReadableMessage, currentCount + 1);
            });
          }
        }
        return {
          id: result.id ?? '',
          success: result.success,
          errors: result.errors ?? [],
        };
      });

    try {
      // Small batch processing
      if (dataArray.length <= BATCH_SIZE) {
        const insertResults = await conn.sobject(sObjectName).create(dataArray);
        results.push(...mapResults(insertResults, 0));

        if (failedCount > 0) {
          console.error(chalk.yellowBright(`❌ Failed to insert ${failedCount} record(s) for sObject ${sObjectName}`));
          console.error(chalk.whiteBright('Error breakdown:'));
          errorCountMap.forEach((count, message) => {
            console.error(`• Insertion failed: ${chalk.redBright(message)}`);
          });
        }

        return results;
      }

      // Initial batch
      const initialBatch = dataArray.splice(0, BATCH_SIZE);
      const initialResults = await conn.sobject(sObjectName).create(initialBatch);
      results.push(...mapResults(initialResults, 0));

      // Bulk processing for remaining records
      const remainingData = dataArray;
      if (!remainingData.length) return results;

      const job = conn.bulk.createJob(sObjectName, 'insert');
      const batches: Array<Promise<void>> = [];
      progressBar.start(100, { title: 'Processing Records' });

      const concurrencyLimit = 2;
      for (let i = 0; i < remainingData.length; i += BATCH_SIZE) {
        const batchData = remainingData.slice(i, i + BATCH_SIZE);
        const batch = job.createBatch();

        const batchPromise = new Promise<void>((resolve, reject) => {
          batch.on('queue', () => batch.poll(1000, 900_000));

          batch.on('response', (rets: any[]) => {
            results.push(...mapResults(rets, i));
            const percentage = Math.ceil(((i + batchData.length + BATCH_SIZE) / dataArray.length) * 100);
            progressBar.update(percentage);
            resolve();
          });

          batch.on('error', (err: Error) => {
            const errorCode = (err as any).statusCode || 'UNKNOWN_ERROR';
            const fields = (err as any).fields || [];
            const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN_FIELD';
            const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues. ${errorCode}`;
            const humanReadableMessage = errorTemplate
              .replace('{field}', fieldList)
              .replace('{object}', sObjectName);
            const currentCount = errorCountMap.get(humanReadableMessage) ?? 0;
            errorCountMap.set(humanReadableMessage, currentCount + batchData.length);
            failedCount += batchData.length;
            reject(err);
          });

          batch.execute(batchData);
        });

        batches.push(batchPromise);

        if (batches.length >= concurrencyLimit) {
          await Promise.race(batches);
        }
      }

      await Promise.all(batches);
      await job.close();
      progressBar.update(100);
      progressBar.finish();

      if (failedCount > 0) {
        console.error(chalk.yellowBright(`❌ Failed to insert ${failedCount} record(s) for sObject: ${sObjectName}`));
        console.error(chalk.whiteBright('Error breakdown:'));
        errorCountMap.forEach((count, message) => {
          console.error(`• Insertion failed: ${chalk.redBright(message)}`);
        });
      }
    } catch (error) {
      const errorCode = (error as any).statusCode || 'UNKNOWN_ERROR';
      const fields = (error as any).fields || [];
      const fieldList = fields.length > 0 ? fields.join(', ') : 'UNKNOWN FIELD';
      const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues. ${errorCode}`;
      const humanReadableMessage = errorTemplate
        .replace('{field}', fieldList)
        .replace('{object}', sObjectName);
      progressBar.stop();
      throw new Error(humanReadableMessage);
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
  private updateCreatedRecordIds(object: string, results: CreateResult[]): void {
    const ids = results.filter((result) => result.success).map((result) => result.id);
    DataGenerate.createdRecordsIds.set(object, ids);
  }

  /**
   * Handles the processing of fields for generating the initial JSON file based on the provided configuration.
   * This method calls `processFieldsForInitialJsonFile` with the given file and Salesforce connection.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object to process.
   * @param {any[]} file - An array of field records representing the configuration for generating the initial JSON file.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */
  private async handleFieldProcessingForIntitalJsonFile(
    conn: Connection,
    object: string,
    file: any[]
  ): Promise<Array<Partial<TargetData>>> {
    return this.processFieldsForInitialJsonFile(file, conn, object);
  }

  /**
   * Handles the processing of fields for parent objects based on the provided query.
   * This method queries Salesforce for field data and then processes the fields using `processFieldsForParentObjects`.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} query - The SOQL query string to fetch field data.
   * @param {string} object - The API name of the Salesforce object to process.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */
  private async handleFieldProcessingForParentObjects(
    conn: Connection,
    query: string,
    object: string
  ): Promise<Array<Partial<TargetData>>> {
    const result = await conn.query(query);
    const nameFieldResult = await conn.query(
      `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true AND IsNillable = true  AND IsNameField = true`
    );
    const combinedResults = [...result.records, ...nameFieldResult.records];
    return this.processFieldsForParentObjects(combinedResults, conn, object);
  }

  /**
   * Processes the fields from Salesforce records and prepares them for further use.
   * This method iterates through the records, identifies field types, and fetches related values as needed.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {boolean} [isParentObject=false] - Indicates whether the fields are from a parent object.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */


  private async processFields(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string,
    isParentObject: boolean = false
  ): Promise<Array<Partial<TargetData>>> {
    const processedFields: Array<Partial<TargetData>> = [];

    for (const item of records) {

      const fieldName = isParentObject ? item.QualifiedApiName : item.name;
      const dataType = isParentObject ? item.DataType : item.type;
      const isReference = dataType === 'reference';
      const isPicklist = dataType === 'picklist' || dataType === 'multipicklist';

      if (item.QualifiedApiName === 'ShouldSyncWithOci') {
        continue;
      }

      if (excludeFieldsSet.has(fieldName)) continue;

      const details: Partial<TargetData> = { name: fieldName };

      const excludedReferenceFields = [
        'OwnerId',
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
        'PricebookEntryId',
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

      ];


      if (isReference && !(excludedReferenceFields.includes(fieldName) && !((object === 'address' || item.ReferenceTo === 'address' || object === 'productrequestlineitem') && fieldName === 'ParentId'))) {

        details.type = 'Custom List';
        const isMasterDetail = !isParentObject ? item.relationshipType !== 'lookup' : !item.IsNillable;
        // Creating new account record for the reference asset 
        if (item.QualifiedApiName === 'ContactId' && item.ReferenceTo.referenceTo[0] === 'Contact' && item.RelationshipName === 'Account') {
          details.values = await this.fetchRelatedMasterRecordIds(conn, 'Account', object);
        }
        if (item.QualifiedApiName === 'ContactId' && item.ReferenceTo.referenceTo[0] === 'Contact') {
          details.values = await this.fetchRelatedMasterRecordIds(conn, item.ReferenceTo?.referenceTo, object);
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
            details.values = await this.fetchRelatedMasterRecordIds(conn, 'Order', object);
            processedFields.push(details);
            continue;
          }
          if (object === 'Contract' && item.QualifiedApiName === 'AccountId' && item.RelationshipName === 'Account') {
            continue;
          }
          details.values = await this.fetchRelatedMasterRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo, object);
          if (isMasterDetail) {
            depthForRecord++;
          }
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
    return processedFields;
  }



  /**
   * Processes the fields from Salesforce records to generate the initial JSON file data.
   * This method delegates the processing to `processFields`.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data for the initial JSON file.
   */
  private async processFieldsForInitialJsonFile(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string
  ): Promise<Array<Partial<TargetData>>> {
    return this.processFields(records, conn, object);
  }

  /**
   * Processes fields for parent objects and retrieves related records, setting the `isParentObject` flag to `true`.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   */

  private async processFieldsForParentObjects(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string
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
    return this.processFields(records, conn, object, true);
  }

  /**
   * Fetches related master record IDs from a given reference object, and creates new records if none exist.
   *
   * If related records are found, it returns their IDs. If no records are found, it attempts to generate data
   * for the given reference object, inserts the records, and then returns the IDs of the newly created records.
   *
   * @param {Connection} conn - The Salesforce connection object to execute queries and insert records.
   * @param {string} referenceTo - The name of the reference object whose related records are being fetched.
   * @returns {Promise<string[]>} - A promise that resolves to an array of record IDs.
   * @throws {Error} - Throws an error if records cannot be fetched or inserted, or if maximum depth is reached.
   */

  private async fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string, object: string): Promise<string[]> {
    if (depthForRecord === 7) {
      throw new Error(`Too many levels of related records were followed for ${referenceTo}. Please simplify the relationship path or reduce nesting.`);
    }

    if ((referenceTo === 'Order' || referenceTo === 'Pricebookentry') && object !== 'returnorder') {
      throw new Error(`SmockIt cannot generate data for the reference sObject: ${chalk.blue(referenceTo)}. Please try using a different sObject.`);
    }

    const processFields = await this.processObjectFieldsForParentObjects(conn, referenceTo, true);
    const fieldMap = processFields.reduce<Record<string, any>>((acc, field) => {
      if (field.name) {
        return {
          ...acc,
          [field.name]: {
            type: field.type,
            values: field.values ?? [],
            label: field.label ?? field.name,
          },
        };
      }
      return acc;
    }, {});

    if (((referenceTo === 'Contact' && object === 'asset' || object === 'Asset') || (referenceTo === 'Contact' && object === 'case' || object === 'Case')) || (referenceTo === 'Asset' || referenceTo === 'asset')) {
      const accountResult = await conn.query('SELECT Id FROM Account ORDER BY CreatedDate DESC LIMIT 1');
      const accountIds = accountResult.records.map((record: any) => record.Id);
      fieldMap['AccountId'] = {
        type: 'reference',
        values: accountIds,
        label: 'Account ID',
      };
    }
    // conditinal handling for Order and Contract for AccountId and Status
    if (referenceTo === 'Contract' && (object === 'order' || object === 'Order')) {
      const accountResult = await conn.query('SELECT Id FROM Account ORDER BY CreatedDate DESC LIMIT 1');
      const accountIds = accountResult.records.map((record: any) => record.Id);

      fieldMap['Status'] = {
        type: 'Custom List',
        values: ['Draft'],
        label: 'Status',
      };
      fieldMap['AccountId'] = {
        type: 'reference',
        values: accountIds,
        label: 'Account ID',
      };
    }

    if (referenceTo === 'Order') {
      const accountResult = await conn.query('SELECT Id FROM Account ORDER BY CreatedDate DESC LIMIT 1');
      const accountIds = accountResult.records.map((record: any) => record.Id);
      fieldMap['Status'] = {
        type: 'Custom List',
        values: ['Draft'],
        label: 'Status',
      };
      fieldMap['AccountId'] = {
        type: 'reference',
        values: accountIds,
        label: 'Account ID',
      };

    }


    // Getting the values for parent fields records 
    const initialJsonData = await GenerateTestData.getFieldsData(fieldMap, 1);

    if (!initialJsonData || (Array.isArray(initialJsonData) && initialJsonData.length === 0)) {
      throw new Error(`Failed to generate valid data for ${referenceTo}`);
    }
    // Enhance the JSON data with required fields
    const enhancedJsonData = this.getJsonDataParentFields(initialJsonData, fieldMap);
    const insertResult = await DataGenerate.insertRecords(conn, referenceTo, enhancedJsonData);

    this.updateCreatedRecordIds(referenceTo, insertResult);

    const validIds = insertResult.filter((result) => result.success).map((result) => result.id);
    if (validIds.length === 0) {
      throw new Error(`Failed to insert records for ${referenceTo}`);
    }

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
    config.sObjects.forEach((sObject) => {
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
          sObjectFieldsMap.set(sObject.sObject, fieldsArray);
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
      'dependent-picklist': 'picklist',
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

    if (object === 'product2') {
      enhancedData.forEach((record, i) => {
        record['StockKeepingUnit'] = 'SKU-' + Math.floor(Math.random() * 1000000) + i;
      });
    }

    if (object === 'dandbcompany') {
      enhancedData.forEach((record) => {
        record['DunsNumber'] = Math.floor(Math.random() * 1000000);
        record['StockExchange'] = 'NYSE';
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

    if (object === 'warrantyterm') {
      enhancedData.forEach((record) => {
        record['ExpensesCoveredDuration'] = (Math.floor(Math.random() * 90) + 10);
        record['ExpensesCovered'] = (Math.floor(Math.random() * 90) + 10);
        record['PartsCoveredDuration'] = (Math.floor(Math.random() * 90) + 10);
        record['PartsCovered'] = (Math.floor(Math.random() * 90) + 10);
        record['LaborCovered'] = (Math.floor(Math.random() * 90) + 10);
        record['WarrantyDuration'] = (Math.floor(Math.random() * 90) + 10);
        record['LaborCoveredDuration'] = (Math.floor(Math.random() * 990) + 10);
      });

    }

    if (object === 'apptbundlepolicy') {
      enhancedData.forEach((record) => {
        record['LimitAmountOfBundleMembers'] = (Math.floor(Math.random() * 90) + 10);
        record['LimitDurationOfBundle'] = (Math.floor(Math.random() * 90) + 10);
        record['ConstantTimeValue'] = (Math.floor(Math.random() * 90) + 10);
        record['Priority'] = (Math.floor(Math.random()) + 1);
      });

    }


    if (object === 'unitofmeasure') {
      enhancedData.forEach((record) => {
        record['Type'] = 'distance';
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
        record['DeathDate'] = '2023-08-11';
      });
    }

    if (object === 'listemail') {
      const fromAddresses = [
        'noreply@example.com',
        'support@dummycorp.com',
        'sales@fakemail.org',
        'info@testcompany.net',
        'admin@mocksite.io',
        'contact@sampledomain.com',
        'hello@myfakeemail.com',
        'updates@notarealmail.org',
        'service@placeholdermail.com',
        'feedback@tempmail.dev'
      ];

      enhancedData.forEach((record) => {
        const randomIndex = Math.floor(Math.random() * fromAddresses.length);
        record['FromAddress'] = fromAddresses[randomIndex];
      });
    }


    if (object === 'shifttemplate') {
      enhancedData.forEach((record) => {
        record['BackgroundColor'] = '#000000';
        record['StartTime'] = '08:00:00.000Z';
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
    fieldMap: Record<string, { type: string; values: any[]; label: string }>
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

    return enhancedData;
  }
}
