/* eslint-disable import/no-extraneous-dependencies */
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
import main from 'sf-mock-data';

import { Flags,Progress,SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { updateOrInitializeConfig, getTemplateJsonData } from '../template/upsert.js';
import { connectToSalesforceOrg ,validateConfigJson} from '../template/validate.js';
import {templateSchema,SObjectItem,sObjectSchemaType,tempAddFlags,DataGenerateResult,FieldRecord,
  RecordId,QueryResult,Fields,TargetData,fieldType,Field,SObjectConfigFile,jsonConfig,GenericRecord,CreateResult
} 
from '../../utils/types.js';
import { createTable,createResultEntryTable } from '../../utils/output_table.js';

import { templateAddFlags} from '../template/upsert.js';

const fieldsConfigFile = 'generated_output.json';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('smocker-concretio', 'data.generate');

let depthForRecord = 0;

const excludeFieldsSet = new Set<string>();
const createdRecordsIds: Map<string, string[]> = new Map();
const progressBar = new Progress(true )


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
      const objectKey = Object.keys(objectConfig as Record<string, any>)[0];
      objectName = objectKey;

      const configForObject: sObjectSchemaType = (objectConfig as Record<string, any>)[objectKey] as sObjectSchemaType;

      const namespacePrefixToExclude =
      baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';

      const allFields = await conn.query(
        `SELECT QualifiedApiName, IsDependentPicklist,Label, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        AND IsCreatable = true
        AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
      );

      const requiredFields = this.getRequiredFields(allFields.records as FieldRecord[]);
        const requiredFieldNames = requiredFields.map(field => field.QualifiedApiName.toLowerCase());  

      let fieldsToPass: FieldRecord[] = [];


      let fieldsToExclude = configForObject['fieldsToExclude']?.map((field: string) => field.toLowerCase()) ?? [];
      const fieldsToIgnore = ['jigsaw', 'cleanstatus'];
      fieldsToExclude = fieldsToExclude.filter((field: string) => !fieldsToIgnore.includes(field) && !requiredFieldNames.includes(field.toLowerCase()));
      fieldsToExclude = [...fieldsToIgnore, ...fieldsToExclude];

      const getPickLeftFields = configForObject.pickLeftFields;

    // getting fieldsvalues for fields
      const considerMap = this.processFieldsToConsider(configForObject);

      const fieldsToConsider = Object.keys(considerMap);

      fieldsToPass = this.filterFieldsByPickLeftConfig(getPickLeftFields,configForObject,fieldsToConsider,fieldsToExclude,fieldsToIgnore,allFields);

      const fieldsObject = await this.processFieldsWithFieldsValues(conn, fieldsToPass, objectName, considerMap);

      const configToWrite: any = {
        sObject: objectName,
        language: configForObject.language ?? baseConfig.language,
        count: configForObject.count ?? baseConfig.count,
      };

      if (Object.keys(fieldsObject).length > 0) {
        (configToWrite as { fields?: Record<string, Fields> }).fields = fieldsObject;
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
    // let fetchedData: Record<string, any > 
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
      const countofRecordsToGenerate = currentSObject.count
      const fields = sObjectFieldsMap.get(object);

      if (!fields) {
        this.log(`No fields found for object: ${object}`);
        continue;
      }
      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, fields, object);
      if (countofRecordsToGenerate === undefined) {
        throw new Error(`Count for object "${object}" is undefined.`);
      }
      const basicJsonData = await main.main(configPath,object);
      const jsonData = this.enhanceDataWithSpecialFields(basicJsonData, processedFields, countofRecordsToGenerate);

      this.saveOutputFileOfJsonAndCsv(jsonData as GenericRecord[], object, outputFormat, flags.templateName);

      // handling failedCount and insertedRecordIds
        const { failedCount: failedInsertions } = await this.handleDirectInsert(conn,outputFormat, object, jsonData as GenericRecord[]);
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
        return {...baseConfig,sObjects:baseConfig.sObjects ?? []};
    } catch (error) {
        this.error(`Failed to read or parse the base config file at ${configFilePath}`);
    }
}

// getting the fields values from the config
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
private processObjectConfiguration(baseConfig: templateSchema, objectName: string | undefined, flags: tempAddFlags): any[] {
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
              existingObjectConfig[objectKey],flags,
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
    fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
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
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
      );
    }
  } else if (getPickLeftFields === false && fieldsToIgnore.length > 0) {
    if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide a field or set pick-left field to true');
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide fieldsToConsider or set pickLeftFields to true');
    } else if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );

      const requiredFields = this.getRequiredFields(fieldsToPass);
      const consideredFields = fieldsToPass.filter((record) =>
        fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
      );

      fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
    } else if (fieldsToConsider.length > 0 && fieldsToIgnore.length > 0 && fieldsToExclude.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
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

private async processFieldsWithFieldsValues(conn: Connection, fieldsToPass: FieldRecord[],objectName: string, considerMap: Record<string, string[]>): Promise<Record<string, Fields>> {

  const fieldsObject: Record<string, Fields> = {};

 // Initialize dependentPicklistResults for each object
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
                label : inputObject.Label

              };
            } else {
              fieldConfig = {
                type: 'text',
                values: (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]) 
                ? (considerMap[inputObject.QualifiedApiName.toLowerCase()]) 
                : [],
                label : inputObject.Label

                
              };
            }
            break;

          case 'reference':
              fieldConfig = {
                type: 'reference',
                referenceTo: inputObject.ReferenceTo?.referenceTo ? (inputObject.ReferenceTo.referenceTo[0] as string) : undefined,

                values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()] 
                  ? considerMap[inputObject.QualifiedApiName.toLowerCase()] 
                  : [],
                relationshipType: inputObject.RelationshipName ? 'master-detail' : 'lookup',
                label : inputObject.Label
              };
              break;

          case 'picklist':
            if (inputObject.IsDependentPicklist) {
              await this.depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
            } else {
              const picklistValues = await this.getPicklistValues(conn, objectName, inputObject.QualifiedApiName,considerMap);
              fieldConfig = {
                type: 'picklist',
                values: (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]) 
                ? (considerMap[inputObject.QualifiedApiName.toLowerCase()]) 
                : picklistValues,
                label : inputObject.Label
              };
            }
            break;

          default:
            if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
              fieldConfig = { 
                type: inputObject.DataType, 
                values: considerMap[inputObject.QualifiedApiName.toLowerCase()],
                label : inputObject.Label
              };
            } else {
              fieldConfig = { 
                type: inputObject.DataType ,
                label : inputObject.Label
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
        const dependentFieldsData = this.convertJSON(this.dependentPicklistResults, topControllingField) as Record<string, Fields>;

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
          const errorMessage = ((error as { message?: string })?.message ?? JSON.stringify(error)) || 'Unknown error';
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


  private async getPicklistValues(
    conn: Connection,
    object: string,
    field: string,
    considerMap: Record<string, any>
  ): Promise<string[]> {
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    const pickListValues: string[] = fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value as string) ?? [];

    Object.keys(considerMap).forEach((key) => {
      if (
        Object.keys(considerMap).includes(key.toLowerCase()) &&
        considerMap[key.toLowerCase()].length > 0 &&
        key.toLowerCase() === field.toLowerCase()
      ) {
        const fieldConsiderationValues: string[] = considerMap[field.toLowerCase()] as string[]
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

  private async depPicklist(conn: Connection, objectName: string, dependentFieldApiName: string, considerMap: Record<string, string[]> ): Promise<void> {
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
        if (!pickListFieldValues.some(item => item.parentFieldValue === considerMap[key.toLowerCase()][0])) {
          throw new Error(`Parent value '${considerMap[key.toLowerCase()][0]}' not found in the picklist values for '${key}'`);
        }
        const filteredArray = pickListFieldValues.filter(item => item.parentFieldValue === considerMap[key.toLowerCase()][0]);

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
  private getControllingFieldName(dependentField: any): string | null {
    const controllerName: string | undefined = dependentField.controllerName as string | undefined;
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

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<string, Fields>;
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

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<string, Fields> | null;

        if (nestedOutput) {
          Object.assign(output[childFieldName][parentValue], nestedOutput);
        }
      });
    });

    return output;
  }

  private getRequiredFields(fields: FieldRecord[]): FieldRecord[] {
    const requiredFields = fields.filter((record) => record.IsNillable === false);
    return requiredFields;
  }

  private mergeFieldsToPass(fields: FieldRecord[]): FieldRecord[] {
    const mergedFields = [...new Map(fields.map((field) => [field.QualifiedApiName, field])).values()];
    return mergedFields;
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

  // private async insertRecords(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
  //   const results: CreateResult[] = [];
  //   const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
  //   const sObjectName = Array.isArray(object) ? object[0] : object;
  
  //   if (dataArray.length <= 200) {
  //     try {
  //       const insertResults = await conn.sobject(sObjectName).create(jsonData);
  //       const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
  //         (result, index) => {
  //           if (!result.success) {
  //             console.error(`Failed to insert record ${index} for ${sObjectName}:`, result.errors);
  //           }
  //           return {
  //             id: result.id ?? '',
  //             success: result.success,
  //             errors: result.errors,
  //           };
  //         }
  //       );
  //       results.push(...initialInsertResult);
  //     } catch (error) {
  //       console.error('Error inserting records:', error);
  //     }
  //   } else {
  //     // Bulk processing logic (similarly enhance error logging)
  //     const storeHere = dataArray.splice(0, 200);
  //     const insertResults = await conn.sobject(sObjectName).create(storeHere);
  //     const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
  //       (result, index) => {
  //         if (!result.success) {
  //           console.error(`Failed to insert record ${index} for ${sObjectName}:`, result.errors);
  //         }
  //         return {
  //           id: result.id ?? '',
  //           success: result.success,
  //           errors: result.errors,
  //         };
  //       }
  //     );
  //     results.push(...initialInsertResult);
  
  //     progressBar.start(100, { title: 'Test' });
  //     const totalRecords = dataArray.length;
  //     let processedRecords = 0;
  
  //     try {
  //       const job = conn.bulk.createJob(sObjectName, 'insert');
  //       const batchSize = 200;
  
  //       for (let i = 0; i < dataArray.length; i += batchSize) {
  //         const batchData = dataArray.slice(i, i + batchSize);
  //         const batch = job.createBatch();
  //         batch.execute(batchData);
  
  //         await new Promise<void>((resolve, reject) => {
  //           batch.on('queue', () => {
  //             batch.poll(500, 600_000);
  //           });
  
  //           batch.on('response', (rets: any[]) => {
  //             const mappedResults: CreateResult[] = rets.map((ret, index) => {
  //               if (!ret.success) {
  //                 console.error(`Bulk insert failed for record ${index + i} in ${sObjectName}:`, ret.errors);
  //               }
  //               return {
  //                 id: ret.id ?? '',
  //                 success: ret.success ?? false,
  //                 errors: ret.errors ?? [],
  //               };
  //             });
  
  //             results.push(...mappedResults);
  //             processedRecords += batchData.length;
  //             const percentage = Math.ceil((processedRecords / totalRecords) * 100);
  //             progressBar.update(percentage);
  
  //             if (processedRecords >= totalRecords) {
  //               progressBar.update(100);
  //               progressBar.finish();
  //             }
  
  //             resolve();
  //           });
  
  //           batch.on('error', (err) => {
  //             console.error('Batch Error:', err);
  //             reject(err);
  //           });
  //         });
  //       }
  
  //       await job.close();
  //     } catch (error) {
  //       console.error('Error during bulk processing:', error);
  //       progressBar.stop();
  //       throw error;
  //     }
  //   }
  
  //   return results;
  // }

  private async insertRecords(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const sObjectName = Array.isArray(object) ? object[0] : object;
    const results: CreateResult[] = [];

    // Early return for empty array
    if (!dataArray.length) return results;

    const BATCH_SIZE = 200;
    
    // Helper function to map results
    const mapResults = (insertResults: any, startIndex: number = 0): CreateResult[] => 
        (Array.isArray(insertResults) ? insertResults : [insertResults]).map((result, index) => {
            if (!result.success) {
                console.error(`Failed to insert record ${startIndex + index} for ${sObjectName}:`, result.errors);
            }
            return {
                id: result.id ?? '',
                success: result.success,
                errors: result.errors ?? []
            };
        });

    try {
        // Small batch processing
        if (dataArray.length <= BATCH_SIZE) {
            const insertResults = await conn.sobject(sObjectName).create(dataArray);
            results.push(...mapResults(insertResults));
            return results;
        }

        // Initial batch
        const initialBatch = dataArray.slice(0, BATCH_SIZE);
        const initialResults = await conn.sobject(sObjectName).create(initialBatch);
        results.push(...mapResults(initialResults));

        // Bulk processing for remaining records
        const remainingData = dataArray.slice(BATCH_SIZE);
        if (!remainingData.length) return results;

        const job = conn.bulk.createJob(sObjectName, 'insert');
        const batches: Array<Promise<void>> = [];
        progressBar.start(100, { title: 'Test' });

        // Process in parallel with controlled concurrency
        const concurrencyLimit = 5;
        for (let i = 0; i < remainingData.length; i += BATCH_SIZE) {
            const batchData = remainingData.slice(i, i + BATCH_SIZE);
            const batch = job.createBatch();

            const batchPromise = new Promise<void>((resolve, reject) => {
                batch.on('queue', () => batch.poll(500, 600_000));
                
                batch.on('response', (rets: any[]) => {
                    results.push(...mapResults(rets, i + BATCH_SIZE));
                    const percentage = Math.ceil(((i + batchData.length + BATCH_SIZE) / dataArray.length) * 100);
                    progressBar.update(percentage);
                    resolve();
                });

                batch.on('error', reject);
                batch.execute(batchData);
            });

            batches.push(batchPromise);
            
            // Control concurrency
            if (batches.length >= concurrencyLimit) {
                await Promise.race(batches);
            }
        }

        await Promise.all(batches);
        await job.close();
        progressBar.update(100);
        progressBar.finish();

    } catch (error) {
        console.error('Error in insertRecords:', error);
        progressBar.stop();
        throw error; // Re-throw to maintain error handling upstream
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
           // details value contains item .value contain
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

    private async fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
      if (createdRecordsIds.has(referenceTo + '')) {
        return Array.from(createdRecordsIds.get(referenceTo + '') ?? []);
      }
  
      const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
      return relatedRecords.records.map((record: RecordId) => record.Id);

    }

  private async fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    const existingIds = createdRecordsIds.get(referenceTo) ?? [];
    if (existingIds.length > 0) {
      return Array.from(existingIds);
    }
  
    const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
  
    if (relatedRecords.records.length === 0) {
      if (depthForRecord === 3) {
        this.error(`Max Depth Reached! Please create ${referenceTo} records first.`);
      }
  
      const processFields = await this.processObjectFieldsForParentObjects(conn, referenceTo, true);
      console.log('processFields', processFields);
  
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
  
      // Generate initial JSON data using the existing getFieldsData
      const initialJsonData = await main.getFieldsData(fieldMap, 1);
  
      if (!initialJsonData || (Array.isArray(initialJsonData) && initialJsonData.length === 0)) {
        this.error(`Failed to generate valid data for ${referenceTo}`);
      }
  
      // Enhance the JSON data with required fields
      const enhancedJsonData = this.enhanceJsonDataWithRequiredFields(initialJsonData, fieldMap);
  
      const insertResult = await this.insertRecords(conn, referenceTo, enhancedJsonData);
      this.updateCreatedRecordIds(referenceTo, insertResult);
  
      const validIds = insertResult.filter(result => result.success).map(result => result.id);
      if (validIds.length === 0) {
        this.error(`Failed to insert records for ${referenceTo}`);
      }
  
      return validIds;
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
  
    private mapFieldType(fieldTypes: fieldType): string {
      const typeMapping: { [key in fieldType]: string } = {
        picklist: 'picklist',
        reference: 'reference',
        'dependent-picklist': 'picklist'
      };
  
      return typeMapping[fieldTypes] || 'Unknown';
    }
  
    private getRandomElement<T>(array: T[]): T | undefined {
      return array[Math.floor(Math.random() * array.length)];
    }
  
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
                const childFieldDetails = fieldDetails[childField][randomParentValue] as Record<string, Field>;
                if (childFieldDetails?.[childDependentField]) {
                  const grandChildFieldDetails = (childFieldDetails[childDependentField] as Record<string, any>)[randomChildValue] as Record<string, Field>;
  
                  // Updated: handle nested values inside the `values` key
                  if (grandChildFieldDetails?.['values']) {
                    const grandChildValues = grandChildFieldDetails['values'];
                    if (grandChildValues) {
                      const grandChildFieldObject: any = {
                        name: childDependentField,
                        type: 'picklist',
                        value: Array.isArray(grandChildValues) ? this.getRandomElement(grandChildValues) as string : undefined,
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
  
    }

    private enhanceDataWithSpecialFields(basicData: any[], processedFields: Array<Partial<TargetData>>, count: number): any[] {
      const enhancedData = basicData.map(item => ({ ...item }));
       this.getRandomElement = <T>(array: T[]): T | undefined => {
        const element = array[Math.floor(Math.random() * array.length)];
        return Array.isArray(element) ? element[0] : element; 
      };
      for (const field of processedFields) {
        if (field.type === 'Custom List' && field.values) {
          const values = Array.from({ length: count }, () => this.getRandomElement(field.values ?? []));
          values.forEach((value, index) => {
            if (field.name) {
                enhancedData[index][field.name] = value;
            }
          });
        }
      }

  
      return enhancedData;
    }

    
    private enhanceJsonDataWithRequiredFields(jsonData: any[],fieldMap: Record<string, { type: string; values: any[]; label: string }>): any[] {
      if (!jsonData || jsonData.length === 0) {
        console.error('No JSON data provided to enhance');
        return jsonData;
      }
    
      // Helper to pick a random value from an array
      const getRandomValue = (values: any[]): any => {
        if (!values || values.length === 0) return null;
        return values[Math.floor(Math.random() * values.length)];
      };
    
      // Enhance each record in the JSON data
      let enhancedData = jsonData.map(record => ({ ...record }));
    
      for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
        const { type, values } = fieldDetails;
    
        // Skip if the field is already populated or if no values are available
        if (values.length === 0 || enhancedData.every(record => fieldName in record)) {
          continue;
        }
    
        // Handle fields that need values (e.g., Custom List or reference)
        if (type === 'Custom List' || type === 'reference') {
          enhancedData = enhancedData.map(record => {
            if (!(fieldName in record)) {
              return { ...record, [fieldName]: getRandomValue(values) };
            }
            return record;
          });
        }
      }
    
      return enhancedData;
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
