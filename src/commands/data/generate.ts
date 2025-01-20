/* eslint-disable sf-plugin/flag-case */

/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable class-methods-use-this */


/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { Table } from 'console-table-printer';

import { Flags,Progress,SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { updateOrInitializeConfig, getTemplateJsonData } from '../template/upsert.js';
import { connectToSalesforceOrg ,validateConfigJson} from '../template/validate.js';
import {templateSchema,SObjectItem,sObjectSchemaType,} from '../../utils/types.js';

import { templateAddFlags} from '../template/upsert.js';
import { MOCKAROO_API_CALLS_PER_DAY, MOCKAROO_CHUNK_SIZE } from '../../utils/constants.js';

const fieldsConfigFile = 'generated_output.json';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('smocker-concretio', 'data.generate');

export type DataGenerateResult = {
  path: string;
};

type FieldRecord = {
  attributes: {
    type: string;
    url: string;
  };
  QualifiedApiName: string;
  IsDependentPicklist: boolean;
  NamespacePrefix: string | null;
  DataType: string;
  ReferenceTo: {
    referenceTo: null | any[];
  };
  RelationshipName: string | null;
  IsNillable: boolean;
};

type RecordId = {
  Id: string;
}

type QueryResult = {
  records: RecordId[];
}

type Fields = {
  [key: string]: any;
  type: string;
  values?: string[];
  relationshipType?: string;
  referenceTo?: string;
  'max-length'?: number;
  'child-dependent-field'?: string;
};

/* ------------------------------------------*/

type BulkQueryBatchResult = {
  batchId?: string;
  id?: string | null;
  jobId?: string;
  errors?: string[];
  success?: boolean;
};

type TargetData = {
  name: string;
  type: string;
  min?: number;
  max?: number;
  decimals?: number;
  values?: string[];
};

type fieldType =
  | 'text'
  | 'boolean'
  | 'phone'
  | 'currency'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'picklist'
  | 'reference'
  | 'dependent-picklist'
  | 'email'
  | 'address';

  type Field = {
    type: fieldType;
    values?: string[]; // For picklist or dependent-picklist
    referenceTo?: string; // For reference fields
    relationshipType?: 'lookup' | 'master-detail'; // For reference fields
    'child-dependent-field'?: string; // For dependent picklists
  };

type SObjectConfig = {
  sObject: string;
  language: string;
  count?: number;
  fields?: { [key: string]: Field };
};

type SObjectConfigFile = {
  sObjects: SObjectConfig[];
};

type jsonConfig = {
  outputFormat?: string[];
  sObjects: SObjectConfig[];
}

// output format table 
type ResultEntry = {
  'SObject(s)': string;
  JSON: string;
  CSV: string;
  DI: string;
  'Failed(DI)': number;
};

type GenericRecord = { [key: string]: any };
type CreateResult = { id: string; success: boolean; errors: any[] };

let depthForRecord = 0;

const excludeFieldsSet = new Set<string>();
const createdRecordsIds: Map<string, string[]> = new Map();
const progressBar = new Progress(true )

function createTable(): Table {
  return new Table({
      columns: [
          { name: 'SObject(s)', alignment: 'left', color: 'yellow', title: chalk.blue('SObject(s)') },
          { name: 'JSON', alignment: 'center', color: 'green', title: chalk.blue('JSON') },
          { name: 'CSV', alignment: 'center', color: 'green', title: chalk.blue('CSV') },
          { name: 'DI', alignment: 'left', color: 'green', title: chalk.blue('DI') },
          { name: 'Failed(DI)', alignment: 'center', title: chalk.red('Failed(DI)') },
      ],
      /* border styles to table */
      style: {
          headerTop: {
              left: chalk.green('╔'),
              mid: chalk.green('╦'),
              right: chalk.green('╗'),
              other: chalk.green('═'),
          },
          headerBottom: {
              left: chalk.green('╟'),
              mid: chalk.green('╬'),
              right: chalk.green('╢'),
              other: chalk.green('═'),
          },
          tableBottom: {
              left: chalk.green('╚'),
              mid: chalk.green('╩'),
              right: chalk.green('╝'),
              other: chalk.green('═'),
          },
          vertical: chalk.green('║'),
      },
  });
}

function createResultEntryTable(object: string, outputFormat: string[], failedCount: number): ResultEntry {
  return {
      'SObject(s)': object.toUpperCase(),
      JSON: outputFormat.includes('json') || outputFormat.includes('JSON') ? '\u2714' : '-',
      CSV: outputFormat.includes('csv') || outputFormat.includes('CSV') ? '\u2714' : '-',
      DI: outputFormat.includes('di') || outputFormat.includes('DI') ? (failedCount > 0 ? chalk.red('X') : '\u2714') : '-',
      'Failed(DI)': failedCount,
  };
}

export default class DataGenerate extends SfCommand<DataGenerateResult>  {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    ...templateAddFlags,
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
  
  public async run(): Promise<DataGenerateResult> {

    const { flags } = await this.parse(DataGenerate);
    const aliasOrUsername = flags.alias;
    const conn = await connectToSalesforceOrg(aliasOrUsername);
    let objectName = flags.sObject ? flags.sObject.toLowerCase() : undefined;
    const configFilePath = getTemplateJsonData(flags.templateName);
    // Load and validate the configuration
    const baseConfig = await this.loadAndValidateConfig(configFilePath, conn);
    // Process specific object configuration
    const objectsToProcess = this.processObjectConfiguration(baseConfig, objectName, flags);

    const outputData: any[] = [];

    for (const objectConfig of objectsToProcess) {
      const objectKey = Object.keys(objectConfig)[0];
      objectName = objectKey;
      const configForObject: sObjectSchemaType = objectConfig[objectKey] as sObjectSchemaType;

      let fieldsToExclude = configForObject['fieldsToExclude']?.map((field: string) => field.toLowerCase()) ?? [];
      const fieldsToIgnore = ['jigsaw', 'cleanstatus'];

      const getPickLeftFields = configForObject.pickLeftFields;

      fieldsToExclude = fieldsToExclude.filter((field: string) => !fieldsToIgnore.includes(field));

      fieldsToExclude = [...fieldsToIgnore, ...fieldsToExclude];

      const namespacePrefixToExclude =
        baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';
    // getting fieldsvalues for fields
    const considerMap = this.processFieldsToConsider(configForObject);
    const fieldsToConsider = Object.keys(considerMap);
      const allFields = await conn.query(
        `SELECT QualifiedApiName, IsDependentPicklist, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        AND IsCreatable = true
        AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
      );

      let fieldsToPass: FieldRecord[] = [];

      fieldsToPass = this.filterFieldsByPickLeftConfig(getPickLeftFields,configForObject,fieldsToConsider,fieldsToExclude,fieldsToIgnore,allFields);

      const fieldsObject = await this.processFieldsWithFieldsValues(conn, fieldsToPass, objectName, considerMap);

      const configToWrite: any = {
        sObject: objectName,
        language: configForObject.language ?? baseConfig.language,
        count: configForObject.count ?? baseConfig.count,
      };

      if (Object.keys(fieldsObject).length > 0) {
        configToWrite.fields = fieldsObject;
      }

      outputData.push(configToWrite);
    }
    const outputFile = path.resolve('./generated_output.json');
    fs.writeFileSync(
      outputFile,
      JSON.stringify({ outputFormat: baseConfig.outputFormat, sObjects: outputData }, null, 2),
      'utf8'
    );
    /* create */

    excludeFieldsSet.clear();

    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap = await this.getProcessedFields();
    
    const configPath = path.join(process.cwd(), fieldsConfigFile);
    const configData = fs.readFileSync(configPath, 'utf8');        
    const jsonDataForObjectNames: jsonConfig = JSON.parse(configData) as jsonConfig;

    const outputFormat = jsonDataForObjectNames.outputFormat ?? [];
    const sObjectNames = jsonDataForObjectNames.sObjects.map((sObject: { sObject: string }) => sObject.sObject);
    if (!sObjectNames) {
      throw new Error('One or more sObject names are undefined. Please check the configuration file.');
    }
    let jsonData: any 
    let fetchedData: Record<string, any > 
    let apiCallout: number = 0
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
      let countofRecordsToGenerate = currentSObject.count
      const fields = sObjectFieldsMap.get(object);

      if (!fields) {
        this.log(`No fields found for object: ${object}`);
        continue;
      }
      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, fields, object);

      if (countofRecordsToGenerate === undefined) {
        throw new Error(`Count for object "${object}" is undefined.`);
      }

      if (countofRecordsToGenerate > 1000) { 
 
        const numberOfChunks = Math.ceil(countofRecordsToGenerate / MOCKAROO_CHUNK_SIZE); 
        let allData: any[] = []; 

        for (let i = 0; i < numberOfChunks; i++) {
          
          if (apiCallout >= MOCKAROO_API_CALLS_PER_DAY) {
                this.log('API LIMIT EXCEEDED FOR THE DAY')
                throw new Error('API call limit exceeded for the day.');
            }
          const currentChunkSize = countofRecordsToGenerate > MOCKAROO_CHUNK_SIZE ? MOCKAROO_CHUNK_SIZE : countofRecordsToGenerate; 

          const urlTopass = `https://api.mockaroo.com/api/generate.json?key=${this.getApiKey()}&count=${currentChunkSize}`;
          const chunkData = await this.fetchMockarooData(urlTopass, processedFields);
                    
          apiCallout++;
          allData = allData.concat(chunkData) 
          countofRecordsToGenerate -= currentChunkSize; 

        }
        fetchedData = allData;
      }
      else {
        const url = `https://api.mockaroo.com/api/generate.json?key=${this.getApiKey()}&count=${countofRecordsToGenerate}`;
        fetchedData = await this.fetchMockarooData(url, processedFields);
      }

      jsonData = fetchedData

      this.saveOutputFileOfJsonAndCsv(jsonData, object, outputFormat, flags.templateName);

      // handling failedCount and insertedRecordIds
        const { failedCount: failedInsertions } = await this.handleDirectInsert(conn,outputFormat, object, jsonData);
        failedCount = failedInsertions; // Update the failed count
      
      const resultEntry = createResultEntryTable(object, outputFormat, failedCount);
      
      table.addRow(resultEntry);

    }
    // Save created record IDs file
    this.saveCreatedRecordIds(outputFormat,flags.templateName)

    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    this.log(chalk.blue.bold(`\nResults: \x1b]8;;${outputPathDir}\x1b\\${totalTime}(s)\x1b]8;;\x1b\\`));

    table.printTable();
    
    return { path: configFilePath };
  }

  /* complexity handling */
  private async loadAndValidateConfig(configFilePath: string, conn: Connection): Promise<templateSchema> {
    const isDataValid = await validateConfigJson(conn, configFilePath);
    if (!isDataValid) {
        throw new Error('Invalid data in the template');
    }

    try {
        const baseConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as templateSchema;
        baseConfig.sObjects = baseConfig.sObjects || [];
        return baseConfig;
    } catch (error) {
        this.error(`Failed to read or parse the base config file at ${configFilePath}`);
    }
}

// getting the fields values from the config
private processFieldsToConsider(configForObject: sObjectSchemaType): Record<string, any> {
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

private processObjectConfiguration(baseConfig: templateSchema, objectName: string | undefined, flags: any): any[] {
  let objectsToProcess = baseConfig.sObjects;

  if (objectName) {
      const existingObjectConfig = baseConfig.sObjects.find((o: SObjectItem) => {
          const objectKey = Object.keys(o)[0];
          return objectKey.toLowerCase() === objectName;
      });

      if (!existingObjectConfig) {
          this.error(`Object ${objectName} not found in base-config.`);
      } else {
          const objectKey = Object.keys(existingObjectConfig)[0];
          updateOrInitializeConfig(
              existingObjectConfig[objectKey],
              flags,
              ['language', 'count', 'fieldsToExclude', 'pickLeftFields', 'fieldsToConsider'],
              this.log.bind(this)
          );
          objectsToProcess = [existingObjectConfig];
      }
  }

  return objectsToProcess;
}

private getDefaultFieldsToPass(configForObject: sObjectSchemaType, allFields: any , fieldsToIgnore: string[]): FieldRecord[]  {
  let fieldsToPass: FieldRecord[] = [];
  
  // Check if the relevant fields in configForObject are undefined
  if (configForObject['fieldsToConsider'] === undefined && configForObject['fieldsToExclude'] === undefined && configForObject['pickLeftFields'] === undefined) {
    fieldsToPass = (allFields.records as FieldRecord[]).filter(
      (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
    );
  }
  return fieldsToPass;
}

private filterFieldsByPickLeftConfig(getPickLeftFields: boolean | undefined,configForObject: sObjectSchemaType, fieldsToConsider: string[],fieldsToExclude: string[],fieldsToIgnore: string[],allFields: any): FieldRecord[] {

  let fieldsToPass: FieldRecord[] = [];
// default object fields to pass when undefined
  fieldsToPass = this.getDefaultFieldsToPass(configForObject,allFields,fieldsToIgnore);

  if (getPickLeftFields === true && fieldsToIgnore.length > 0) {
    if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
      fieldsToPass = (allFields.records as FieldRecord[]).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      fieldsToPass = (allFields.records as FieldRecord[]).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      fieldsToPass = (allFields.records as FieldRecord[]).filter(
        (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
      );
    }
  } else if (getPickLeftFields === false && fieldsToIgnore.length > 0) {
    if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide a field or set pick-left field to true');
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide fieldsToConsider or set pickLeftFields to true');
    } else if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
      fieldsToPass = (allFields.records as FieldRecord[]).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );

      const requiredFields = this.getRequiredFields(fieldsToPass);
      const consideredFields = fieldsToPass.filter((record) =>
        fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
      );

      fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
    } else if (fieldsToConsider.length > 0 && fieldsToIgnore.length > 0 && fieldsToExclude.length === 0) {
      fieldsToPass = (allFields.records as FieldRecord[]).filter(
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

private async processFieldsWithFieldsValues(conn: Connection, fieldsToPass: FieldRecord[],objectName: string, considerMap: Record<string, any>): Promise<Record<string, Fields>> {

  const fieldsObject: Record<string, Fields> = {};

 // Initialize dependentPicklistResults for each object
      this.dependentPicklistResults = {};

      for (const inputObject of fieldsToPass) {
        let fieldConfig: Fields = { type: inputObject.DataType };

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
              };
            } else {
              fieldConfig = {
                type: 'text',
                values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()] 
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()] 
                : []
                
              };
            }
            break;

          case 'reference':
            fieldConfig = {
              type: 'reference',
              // referenceTo: inputObject.ReferenceTo?.referenceTo[0],
              referenceTo: inputObject.ReferenceTo?.referenceTo ? inputObject.ReferenceTo.referenceTo[0] : undefined,
              values: [],
              relationshipType: inputObject.RelationshipName
                ? inputObject.IsNillable === false
                  ? 'master-detail'
                  : 'lookup'
                : undefined,
            };
            break;

          case 'picklist':
            if (inputObject.IsDependentPicklist) {
              await this.depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
            } else {
              const picklistValues = await this.getPicklistValues(conn, objectName, inputObject.QualifiedApiName);
              fieldConfig = {
                type: 'picklist',
                // values: considerMap[inputObject.QualifiedApiName.toLowerCase()] || picklistValues,
                values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()] 
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()] 
                : picklistValues
              };
            }
            break;

          default:
            if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
              fieldConfig = { 
                type: inputObject.DataType, 
                values: considerMap[inputObject.QualifiedApiName.toLowerCase()]
              };
            } else {
              fieldConfig = { 
                type: inputObject.DataType 
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
        const dependentFieldsData = this.convertJSON(this.dependentPicklistResults, topControllingField);

        Object.assign(fieldsObject, dependentFieldsData);
        this.dependentPicklistResults = {};
      }      

  return fieldsObject;
}

// save output in different formats file (JSON, CSV)
private saveOutputFileOfJsonAndCsv(jsonData: GenericRecord[], object: string,outputFormat: string[],templateName: string): void {

  const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];

  // Save JSON output
  if (outputFormat.includes('json') || outputFormat.includes('json')) {
    const jsonFilePath = `${process.cwd()}/data_gen/output/${object}_` + templateName?.replace(
      '.json',
      ''
    ) + `_${dateTime}.json`;
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
  }

  // Save CSV output
  if (outputFormat.includes('csv') || outputFormat.includes('csv')) {
    const csvData = this.convertJsonToCsv(jsonData);
    const csvFilePath = `${process.cwd()}/data_gen/output/${object}_` + templateName?.replace(
      '.json',
      ''
    )+ `${dateTime}.csv`;
    fs.writeFileSync(csvFilePath, csvData);
  }
}
// save output in formats file (DI)
private saveCreatedRecordIds(outputFormat: string[], templateName: string): void {
  if (outputFormat.includes('DI') || outputFormat.includes('di')) {
    const fileName = `${templateName?.replace('.json', '')}_createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]}.json`;
    this.saveMapToJsonFile('data_gen', fileName);
  }
}

// handling [DI] failed count and error
private async handleDirectInsert(conn: Connection,outputFormat: string[],object: string,jsonData: GenericRecord[]): Promise<{ failedCount: number; insertedIds: string[] }> {

  if (outputFormat.includes('DI') || outputFormat.includes('di')) {
    const errorSet: Set<string> = new Set();
    const insertedIds: string[] = [];
    let failedCount = 0;

    const insertResult = await this.insertRecords(conn, object, jsonData);

    insertResult.forEach((result: { id?: string; success: boolean; errors?: any[] }) => {
      if (result.success && result.id) {
        insertedIds.push(result.id);
      } else if (result.errors) {
        result.errors.forEach((error) => {
          const errorMessage = error?.message || JSON.stringify(error) || 'Unknown error';
          errorSet.add(errorMessage);
        });
      }
    });

    failedCount = insertResult.length - insertedIds.length;

    if (errorSet.size > 0) {
      this.log(`\nFailed to insert ${failedCount} record(s) for '${object}' object with the following error(s):`);
      errorSet.forEach((error) => this.log(`- ${error}`));
    }

    this.updateCreatedRecordIds(object, insertResult);

    return { failedCount, insertedIds };
  }

  // Default return if outputFormat does not include 'DI' or 'di'
  return { failedCount: 0, insertedIds: [] };
}

/* --------------------------- */
  // private async getPicklistValues(conn: Connection, object: string, field: string): Promise<string[]> {
  //   const result = await conn.describe(object);
  //   const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
  //   return fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value) ?? [];
  // }

  private async getPicklistValues(conn: Connection, object: string, field: string): Promise<string[]> {
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    return fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
  }

  private async depPicklist(conn: Connection, objectName: string, dependentFieldApiName: string, considerMap: Record<string, any> ): Promise<void> {
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
      if (entry.validFor) {
        const base64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const validForControllerValues = [];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const base64chars = entry.validFor.split('');
        for (let i = 0; i < controllerValues.length; i++) {
          const bitIndex = Math.floor(i / 6);
          const bitShift = 5 - (i % 6);
          if ((base64map.indexOf(base64chars[bitIndex]) & (1 << bitShift)) !== 0) {
            validForControllerValues.push(controllerValues[i].label);
          }
        }
        validForControllerValues.forEach((controllerValue) => {
          if (!dependentPicklistValues.has(controllerValue)) {
            dependentPicklistValues.set(controllerValue, []);
          }
          dependentPicklistValues.get(controllerValue)?.push(entry.value);
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
        const filteredArray = pickListFieldValues.filter(item => item.parentFieldValue === considerMap[key.toLowerCase()][0]);

        if (filteredArray.length > 0) {
          filteredArray[0].childValues = considerMap[filteredArray[0].childFieldName.toLowerCase()];
          this.dependentPicklistResults[key] = filteredArray;

        }
      }
    });
  }
  private getControllingFieldName(dependentField: any): string | null {
    const controllerName: string | undefined = dependentField.controllerName;
    return controllerName ?? null;
  }

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

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues);
        if (nestedOutput) {
          Object.assign(output[controllingFieldName][childFieldName][entry.parentFieldValue], nestedOutput);
        }
      });
    }

    return output;
  }

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

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues);

        if (nestedOutput) {
          Object.assign(output[childFieldName][parentValue], nestedOutput);
        }
      });
    });

    return output;
  }

  private getRequiredFields(fields: FieldRecord[]): FieldRecord[] {
    return fields.filter((record) => record.IsNillable === false);
  }

  private mergeFieldsToPass(fields: FieldRecord[]): FieldRecord[] {
    return [...new Map(fields.map((field) => [field.QualifiedApiName, field])).values()];
  }

  /* createRecord*/

    private async processObjectFieldsForIntitalJsonFile(
      conn: Connection,
      config: any[],
      object: string
    ): Promise<Array<Partial<TargetData>>> {
  
      const processedFields = await this.handleFieldProcessingForIntitalJsonFile(conn, object, config);
      return processedFields;
    }
  
    private async processObjectFieldsForParentObjects(
      conn: Connection,
      object: string,
      onlyRequiredFields: boolean
    ): Promise<Array<Partial<TargetData>>> {
      const query = this.buildFieldQuery(object, onlyRequiredFields);
  
      const processedFields = await this.handleFieldProcessingForParentObjects(conn, query, object);
      return processedFields;
    }
  
    private buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
      let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
      if (onlyRequiredFields) query += ' AND IsNillable = false';
      return query;
    }
  
    private async fetchMockarooData(url: string, body: Array<Partial<TargetData>>): Promise<GenericRecord[]> {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body as Array<Record<string, unknown>>),
        });
  
        if (!response.ok) {
          throw new Error(`Error fetching data from Mockaroo : ${await response.text()}`);
        }
        return (await response.json()) as GenericRecord[];
      } catch (error) {
        this.error(`Error fetching data from Mockaroo : ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  
    private async insertRecords(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
      const   results: CreateResult[] = [];
      const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
  
      const initialRecords = dataArray.slice(0, 200);
      const insertResults = await conn.sobject(object).create(initialRecords);
      const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
        (result) => ({
          id: result.id ?? '',
          success: result.success,
          errors: result.errors,
        })
      );
      results.push(...initialInsertResult);
      if (dataArray.length > 200) {
        progressBar.start(100, { title: 'Test' } ); 
        const remainingRecords = dataArray.slice(200);
        const remainingTotal = remainingRecords.length
        const job = conn.bulk.createJob(object, 'insert');
        const batch = job.createBatch();
         batch.execute(remainingRecords);
        await new Promise<void>((resolve, reject) => {
          batch.on('queue', () => {
            batch.poll(500 /* interval(ms) */, 600_000 /* timeout(ms) */);
            const pollInterval = setInterval(() => {
              batch
                .check()
                .then((batchStatus) => {
                  const  recordsProcessed: number  = Number(batchStatus.numberRecordsProcessed) || 0;
                  const   percentage: number  = Math.ceil((recordsProcessed / remainingTotal) * 100); // Percentage calculation for remaining records
                  progressBar.update(percentage);
                  if (batchStatus.state === 'Completed' || batchStatus.state === 'Failed') {
                    clearInterval(pollInterval);
                    if (batchStatus.state === 'Failed') {
                      console.error('Batch failed.');
                      reject(new Error('Batch processing failed.'));
                    }
                  }
                })
                .catch((err) => {
                  clearInterval(pollInterval);
                  console.error('Error while checking batch status:', err);
                  reject(err);
                });
            }, 1000);
          });
          batch.on('response', (rets: BulkQueryBatchResult[]) => {
            const mappedResults: CreateResult[] = rets.map((ret: BulkQueryBatchResult) => ({
              id: ret.id ?? '',
              success: ret.success ?? false,
              errors: ret.errors ?? [],
            }));
      
            results.push(...mappedResults); // Push the bulk results to the main results array
            progressBar.update(100);
            progressBar.finish();
            resolve();
          });
          batch.on('error', (err) => {
            reject(err);
          });
        });
        
        await job.close();
      }
      return results;
    }
   
    private updateCreatedRecordIds(object: string, results: CreateResult[]): void {
      const ids = results.filter((result) => result.success).map((result) => result.id);
      createdRecordsIds.set(object, ids);
    }
  
    private async handleFieldProcessingForIntitalJsonFile(
      conn: Connection,
      object: string,
      file: any[]
    ): Promise<Array<Partial<TargetData>>> {
      return this.processFieldsForInitialJsonFile(file, conn, object);
    }
  
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
  
        if (excludeFieldsSet.has(fieldName)) continue;
  
        const details: Partial<TargetData> = { name: fieldName };
  
        if (isReference && !['OwnerId', 'CreatedById', 'ParentId'].includes(fieldName)) {
          details.type = 'Custom List';
          const isMasterDetail = !isParentObject ? item.relationshipType !== 'lookup' : !item.IsNillable;
  
          if (item.values?.length) {
            details.values = item.values;
          } else {
            details.values = isMasterDetail
              ? await this.fetchRelatedMasterRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo)
              : await this.fetchRelatedRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo);
          }
  
          if (isMasterDetail) {
            depthForRecord++;
          }
          processedFields.push(details);
        } else if (isPicklist || item.values?.length > 0) {
          details.type = 'Custom List'; // random value pick
          details.values = await this.getPicklistValuesWithDependentValues(conn, object, fieldName, item);
          processedFields.push(details);
        } else {
           // details value contains item .value
          details.type = this.getFieldType(item, isParentObject);
          if (details.type) processedFields.push(details);
        }
      }
      return processedFields;
    }
  
    private async processFieldsForInitialJsonFile(
      records: Array<Record<string, any>>,
      conn: Connection,
      object: string
    ): Promise<Array<Partial<TargetData>>> {
      return this.processFields(records, conn, object);
    }
  
    private async processFieldsForParentObjects(
      records: Array<Record<string, any>>,
      conn: Connection,
      object: string
    ): Promise<Array<Partial<TargetData>>> {
      return this.processFields(records, conn, object, true);
    }
  
    private getFieldType(item: Record<string, any>, isParentObject: boolean = false): string {
      const fieldName = isParentObject ? item.QualifiedApiName : (item.name as string);
      const itemType = isParentObject ? item.DataType : item.type;
      switch (itemType) {
        case 'string':
        case 'address':
          return this.getStringFieldType(fieldName);
        case 'boolean':
          return 'Boolean';
        case 'email':
          return 'Email Address';
        case 'phone':
          return 'Phone';
        case 'date':
        case 'datetime':
          return 'Datetime';
        case 'textarea':
          return this.getTextareaFieldType(fieldName);
        case 'double':
          return this.getDoubleFieldType(fieldName);
        case 'currency':
          return 'Number';
        default:
          return '';
      }
    }
  
    private getStringFieldType(fieldName: string): string {
      const lowerCasefieldName = fieldName.toLowerCase();
      if (lowerCasefieldName.includes('name')) {
        return this.getNameFieldType(lowerCasefieldName);
      }
      if (lowerCasefieldName.includes('title')) return 'Title';
      if (lowerCasefieldName.includes('street')) return 'Street Name';
      if (lowerCasefieldName.includes('city')) return 'City';
      if (lowerCasefieldName.includes('state')) return 'State';
      if (lowerCasefieldName.includes('postalcode') || lowerCasefieldName.includes('Postal_Code')) return 'Postal Code';
      if (lowerCasefieldName.includes('dunsnumber')) return 'Number';
      if (lowerCasefieldName.includes('naicscode')) return 'Number';
      if (lowerCasefieldName.includes('yearstarted')) return '';
      if (lowerCasefieldName.includes('country') && lowerCasefieldName.includes('code')) return 'Country Code';
      if (lowerCasefieldName.includes('country')) return 'Country';
      if (lowerCasefieldName.includes('company')) return 'Company Name';
      if (lowerCasefieldName.includes('site')) return '';
      if (lowerCasefieldName.includes('department')) return 'Department (Corporate)';
      if (lowerCasefieldName.includes('language')) return 'Language';
      return 'App Name';
    }
  
    private getNameFieldType(fieldName: string): string {
      if (fieldName.includes('last')) return 'Last Name';
      if (fieldName.includes('first')) return 'First Name';
      if (fieldName.includes('middle')) return 'Word';
      if (fieldName.includes('salutation')) return 'Prefix';
      return 'Full Name';
    }
  
    private getDoubleFieldType(fieldName: string): string {
      if (fieldName.includes('latitude')) return 'Latitude';
      return 'Number';
    }
  
    private getTextareaFieldType(fieldName: string): string {
      if (fieldName.includes('street')) return 'Street Name';
      return '';
    }
  
    private async fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
      if (createdRecordsIds.has(referenceTo + '')) {
        return Array.from(createdRecordsIds.get(referenceTo + '') ?? []);
      }
  
      const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
      return relatedRecords.records.map((record: RecordId) => record.Id);

    }
  
    private async fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
      if (createdRecordsIds.has(referenceTo + '')) {
        return Array.from(createdRecordsIds.get(referenceTo + '') ?? []);
      }
  
      const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
  
      if (relatedRecords.records.length === 0) {
        if (depthForRecord === 3) {
          this.error('Max Depth Reach Please Create ' + referenceTo + ' Records First');
        }
        const processedFields = await this.processObjectFieldsForParentObjects(conn, referenceTo, true);
        const jsonData = await this.fetchMockarooData(
          `https://api.mockaroo.com/api/generate.json?key=${this.getApiKey()}&count=1`,
          processedFields
        );
        const insertResult = await this.insertRecords(conn, referenceTo, jsonData);
        this.updateCreatedRecordIds(referenceTo, insertResult);
        return insertResult.map((result) => result.id).filter((id) => id !== '');
      }
      return relatedRecords.records.map((record: RecordId) => record.Id);
    }
  
    private async getPicklistValuesWithDependentValues(
      conn: Connection,
      object: string,
      field: string,
      item: Record<string, any>
    ): Promise<string[]> {
      if (item.values != null && item.values.length > 0) {
        return item.values as string[];
      } 
      else if (item.value != null && item.value.length > 0) {
        return [item.value] as string[];
      }
      const result = await conn.describe(object);
      const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
      const picklistValues: string[] = fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
      return picklistValues;
    }
  
    private getApiKey(): string {
      try {
        const apiKey = process.env.MOCKAROO_API_KEY;
        if (!apiKey) {
          throw new Error(
            'API key missing: Please add your Mockaroo API key to Environment Variable "MOCKAROO_API_KEY".'
          );
        }
  
        return apiKey;
      } catch (error) {
        this.error(`Failed to read Mockaroo API key: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  
    private async readSObjectConfigFile(): Promise<SObjectConfigFile> {
      const configPath = path.resolve(process.cwd(), fieldsConfigFile);
      const configData = await fs.promises.readFile(configPath, 'utf-8');
      return JSON.parse(configData) as SObjectConfigFile;
    }
  
    private async getProcessedFields(): Promise<Map<string, any[]>> {
      const config = await this.readSObjectConfigFile();
      const sObjectFieldsMap: Map<string, any[]> = new Map();
      config.sObjects.forEach((sObject) => {
        if (sObject.fields) {
          
          const fieldsArray: any[] = []; // Temporary array to accumulate fields for each SObject
          for (const [fieldName, fieldDetails] of Object.entries(sObject.fields)) {
            if (fieldDetails.type === 'dependent-picklist') {
              this.processDependentPicklists(fieldName, fieldDetails, fieldsArray);
              continue;
            }
            let fieldObject: any = {};
  
            if (fieldDetails.type === 'picklist' || fieldDetails.type === 'reference') {
              fieldObject.name = fieldName;
              fieldObject.values = fieldDetails.values ?? [];
              fieldObject.referenceTo = fieldDetails.referenceTo;
              fieldObject.relationshipType = fieldDetails.relationshipType;
              fieldsArray.push(fieldObject);
              continue;
            }
            if (fieldDetails.values?.length && fieldDetails.values?.length > 0) {
              fieldObject = {
                name: fieldName,
                values: fieldDetails.values,
              };
            } else {
              fieldObject = {
                name: fieldName,
                type: this.mapFieldType(fieldDetails.type),
              };
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
  
    private mapFieldType(fieldType: fieldType): string {
      const typeMapping: { [key in fieldType]: string } = {
        text: 'string',
        boolean: 'checkbox',
        phone: 'phone',
        currency: 'currency',
        double: 'number',
        email: 'email',
        date: 'date',
        time: 'Time',
        datetime: 'datetime',
        picklist: 'picklist',
        reference: 'reference',
        address: 'address',
        'dependent-picklist': 'picklist',
      };
  
      return typeMapping[fieldType] || 'Unknown';
    }
  
    private getRandomElement<T>(array: T[]): T | undefined {
      return array[Math.floor(Math.random() * array.length)];
    }
  
    private processDependentPicklists(fieldName: string, fieldDetails: any, fieldsArray: any[]): void {
      const parentField = fieldName;
      const childField = fieldDetails['child-dependent-field'] as string;
  
      const fieldObjectDepParent: any = {
        name: parentField,
        type: this.mapFieldType(fieldDetails.type),
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
        // Get a random parent value
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
                const childFieldDetails = fieldDetails[childField][randomParentValue];
                if (childFieldDetails?.[childDependentField]) {
                  const grandChildFieldDetails = childFieldDetails[childDependentField][randomChildValue];
  
                  // Updated: handle nested values inside the `values` key
                  if (grandChildFieldDetails?.['values']) {
                    const grandChildValues = grandChildFieldDetails['values'];
                    if (grandChildValues) {
                      const grandChildFieldObject: any = {
                        name: childDependentField,
                        type: 'picklist',
                        value: this.getRandomElement(grandChildValues),
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
  
    // private async insertImage(filePaths: string[], conn: Connection, parentIds: string[]): Promise<void> {
    //   try {
    //     for (const parentId of parentIds) {
    //       for (const filePath of filePaths) {
    //         const fileContent = fs.readFileSync(filePath);
    //         const base64Image = fileContent.toString('base64');
  
    //         const contentVersion = {
    //           Title: path.basename(filePath), // Set file name as the title
    //           PathOnClient: filePath, // Path on the local machine
    //           VersionData: base64Image, // Base64-encoded file content
    //           FirstPublishLocationId: parentId, // The parent record ID (like an Account or Opportunity)
    //         };
  
    //         const result = await conn.sobject('ContentVersion').create(contentVersion);
  
    //         if (result.success) {
    //           this.log('Image inserted successfully with ContentVersion ID:', result.id);
    //         } else {
    //           this.error('Failed to insert image:');
    //         }
    //       }
    //     }
    //   } catch (error) {
    //     this.error('Error inserting random image:');
    //   }
    // }
  
    private saveMapToJsonFile(folderName: string, fileName: string): void {
      const sanitizedFileName = fileName.replace(/[:/\\<>?|*]/g, '_');
      const baseDir = process.cwd();
      const outputDir = path.join(baseDir, folderName, 'output');
  
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
  
      const resultObject: Record<string, string[]> = {};
      createdRecordsIds.forEach((ids, objectName) => {
        resultObject[objectName] = ids;
      });
  
      const outputFile = path.join(outputDir, sanitizedFileName);
      fs.writeFileSync(outputFile, JSON.stringify(resultObject, null, 2), 'utf-8');
      // this.log(`File created at=============: ${outputFile}`);
  
    }
  
    private convertJsonToCsv(jsonData: GenericRecord[]): string {
      let fields;
      let data = jsonData;
      if (Array.isArray(jsonData)) {
        fields = Object.keys(jsonData[0]);
      } else {
        fields = Object.keys(jsonData);
        data = [jsonData];
      }
      const csvRows = data.map((row: Record<string, any>) => fields.map((field: string) => row[field] as string).join(','));
      return [fields.join(','), ...csvRows].join('\n');
    }
}
