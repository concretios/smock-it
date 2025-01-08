/* eslint-disable sf-plugin/flag-case */
/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Connection } from '@salesforce/core';
import fetch from 'node-fetch';
import { Progress }  from '@salesforce/sf-plugins-core';
// import chalk  from 'chalk';
// eslint-disable-next-line import/no-extraneous-dependencies
import {table} from 'console-table-without-index';

import { templateAddFlags} from '../template/upsert.js';
import { MOCKAROO_API_CALLS_PER_DAY, MOCKAROO_CHUNK_SIZE } from '../../utils/constants.js';

const fieldsConfigFile = 'generated_output.json';
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'create.record');
let depthForRecord = 0;
export type CreateRecordResult = { path: string };

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
  [key: string]: any; // For dynamic dependent-picklist structures
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

type GenericRecord = { [key: string]: any };
type CreateResult = { id: string; success: boolean; errors: any[] };

const excludeFieldsSet = new Set<string>();
const createdRecordsIds: Map<string, string[]> = new Map();
const progressBar = new Progress(true )


export default class CreateRecord extends SfCommand<CreateRecordResult> {
  
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    ...templateAddFlags,
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      char: 't',
    }),
    'include-files': Flags.string({
      summary: messages.getMessage('flags.include-files.summary'),
      description: messages.getMessage('flags.include-files.description'),
      char: 'f',
      multiple: true,
    }),
    alias : Flags.string({
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      char: 'a',
      required: true,
    }),
  };
  public orgConnection: any;

  public async run(): Promise<CreateRecordResult> {

    const { flags } = await this.parse(CreateRecord);
    excludeFieldsSet.clear();

    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap = await this.getProcessedFields();
    
    const conn = this.orgConnection;
    const configPath = path.join(process.cwd(), fieldsConfigFile);
    const configData = fs.readFileSync(configPath, 'utf8');
    // console.log(chalk.green('Config Data: --------------'), configData);
        
    const jsonDataForObjectNames = JSON.parse(configData);
    // console.log(chalk.green('jsonDataForObjectNames: '), jsonDataForObjectNames);

    const outputFormat = jsonDataForObjectNames.outputFormat;
    const sObjectNames = jsonDataForObjectNames.sObjects.map((sObject: { sObject: string }) => sObject.sObject);
    if (sObjectNames.includes(undefined)) {
      throw new Error('One or more sObject names are undefined. Please check the configuration file.');
    }
    let jsonData: any 
    let fetchedData: Record<string, any > 
    let apiCallout: number = 0
    const resultTable: Array<any> = []; 

    for (const object of sObjectNames) {

      depthForRecord = 0;
      const currentSObject = jsonDataForObjectNames.sObjects.find(
        (sObject: { sObject: string }) => sObject.sObject === object
      );
      let countofRecordsToGenerate = currentSObject.count;
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

      const resultEntry: any = {
        SObject: object.toUpperCase().replace(/^'|'$/g,),
        JSON: '-',
        CSV: '-',
        DI: '-',
      };
      
      if (outputFormat.includes('json') || outputFormat.includes('json')) {
        const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];
        const jsonFilePath = `${process.cwd()}/data_gen/output/${object}_` + flags.templateName?.replace(
          '.json',
          ''
        ) + `_${dateTime}.json`;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        // this.log(chalk.green(`Data for ${object} saved as JSON in `) + jsonFilePath);
        resultEntry.CSV = 'YES';

      }

      if (outputFormat.includes('csv') || outputFormat.includes('csv')) {
        const csvData = this.convertJsonToCsv(jsonData);
        const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];
        const csvFilePath = `${process.cwd()}/data_gen/output/${object}_` + flags.templateName?.replace(
          '.json',
          ''
        )+ `${dateTime}.csv`;
        fs.writeFileSync(csvFilePath, csvData);
        // this.log(chalk.green(`Data for ${object} saved as CSV in `) + csvFilePath);
        resultEntry.JSON = 'YES';
      }

      if (outputFormat.includes('DI') || outputFormat.includes('di')) {
        // Create records in Salesforce and store IDs
        const errorSet: Set<string> = new Set();
        const insertedIds: string[] = [];
        const insertResult = await this.insertRecords(conn, object, jsonData);
        insertResult.forEach((result: { id?: string; success: boolean; errors?: any[] }) => {
          if (result.success && result.id) {
            insertedIds.push(result.id);
          }
    
          else if (result.errors) {
            result.errors.forEach((error) => {
              const errorMessage = error?.message || JSON.stringify(error) || 'Unknown error';
              errorSet.add(errorMessage);
            });
          }
        });

        if (errorSet.size > 0) {
          this.log(`\nFailed to insert ${insertResult.length - insertedIds.length} record(s) for '${object}' object with following error(s):`);
          errorSet.forEach((error) => this.log(`- ${error}`));
        }
        this.updateCreatedRecordIds(object, insertResult);
        resultEntry.DI = 'YES';

        if (flags['include-files'] !== undefined && flags['include-files']?.length > 0) {
          this.insertImage(flags['include-files'], conn, insertedIds);
        }
      }
      resultTable.push(resultEntry);
    }
    // Save created record IDs if needed
    if (outputFormat.includes('DI') || outputFormat.includes('di')) {
      this.saveMapToJsonFile(
        'data_gen',
        flags.templateName?.replace('.json', '') +
          'createdRecords_' +
          new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0] +
          '.json'
      );
    }
    console.table(resultTable)
    console.log(table(resultTable));

    return { path: `${process.cwd()}/src/commands/create/record.ts` };
  }


  
  private async processObjectFieldsForIntitalJsonFile(
    conn: Connection,
    config: any[],
    object: string
  ): Promise<Partial<TargetData>[]> {

    const processedFields = await this.handleFieldProcessingForIntitalJsonFile(conn, object, config);
    return processedFields;
  }

  private async processObjectFieldsForParentObjects(
    conn: Connection,
    object: string,
    onlyRequiredFields: boolean
  ): Promise<Partial<TargetData>[]> {
    const query = this.buildFieldQuery(object, onlyRequiredFields);

    const processedFields = await this.handleFieldProcessingForParentObjects(conn, query, object);
    return processedFields;
  }

  private buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
    if (onlyRequiredFields) query += ' AND IsNillable = false';
    return query;
  }

  private async fetchMockarooData(url: string, body: Partial<TargetData>[]): Promise<GenericRecord[]> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body as Record<string, unknown>[]),
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
  ): Promise<Partial<TargetData>[]> {
    return this.processFieldsForInitialJsonFile(file, conn, object);
  }

  private async handleFieldProcessingForParentObjects(
    conn: Connection,
    query: string,
    object: string
  ): Promise<Partial<TargetData>[]> {
    const result = await conn.query(query);
    const nameFieldResult = await conn.query(
      `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true AND IsNillable = true  AND IsNameField = true`
    );
    const combinedResults = [...result.records, ...nameFieldResult.records];
    return this.processFieldsForParentObjects(combinedResults, conn, object);
  }
 
  private async processFields(
    records: Record<string, any>[],
    conn: Connection,
    object: string,
    isParentObject: boolean = false
  ): Promise<Partial<TargetData>[]> {
    const processedFields: Partial<TargetData>[] = [];

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
        details.type = 'Custom List'; // random value pick krta h
        details.values = await this.getPicklistValuesWithDependentValues(conn, object, fieldName, item);
        processedFields.push(details);
      } else {
         // details ki value contains item .value contain hoti
        details.type = this.getFieldType(item, isParentObject);
        if (details.type) processedFields.push(details);
      }
    }
    return processedFields;
  }

  private async processFieldsForInitialJsonFile(
    records: Record<string, any>[],
    conn: Connection,
    object: string
  ): Promise<Partial<TargetData>[]> {
    return this.processFields(records, conn, object);
  }

  private async processFieldsForParentObjects(
    records: Record<string, any>[],
    conn: Connection,
    object: string
  ): Promise<Partial<TargetData>[]> {
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
    fieldName = fieldName.toLowerCase();
    if (fieldName.includes('name')) {
      return this.getNameFieldType(fieldName);
    }
    if (fieldName.includes('title')) return 'Title';
    if (fieldName.includes('street')) return 'Street Name';
    if (fieldName.includes('city')) return 'City';
    if (fieldName.includes('state')) return 'State';
    if (fieldName.includes('postalcode') || fieldName.includes('Postal_Code')) return 'Postal Code';
    if (fieldName.includes('dunsnumber')) return 'Number';
    if (fieldName.includes('naicscode')) return 'Number';
    if (fieldName.includes('yearstarted')) return '';
    if (fieldName.includes('country') && fieldName.includes('code')) return 'Country Code';
    if (fieldName.includes('country')) return 'Country';
    if (fieldName.includes('company')) return 'Company Name';
    if (fieldName.includes('site')) return '';
    if (fieldName.includes('department')) return 'Department (Corporate)';
    if (fieldName.includes('language')) return 'Language';
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

    const relatedRecords = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
    return relatedRecords.records.map((record: any) => record.Id);
  }

  private async fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    if (createdRecordsIds.has(referenceTo + '')) {
      return Array.from(createdRecordsIds.get(referenceTo + '') ?? []);
    }

    const relatedRecords = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);

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
    return relatedRecords.records.map((record: any) => record.Id);
  }

  public async getPicklistValuesWithDependentValues(
    conn: Connection,
    object: string,
    field: string,
    item: Record<string, any>
  ): Promise<string[]> {
    if (item.values != null && item.values.length > 0) {
      return item.values;
    } else if (item.value != null && item.value.length > 0) {
      return [item.value];
    }
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    const picklistValues = fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value) ?? [];
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


  private async insertImage(filePaths: string[], conn: Connection, parentIds: string[]) {
    try {
      for (const parentId of parentIds) {
        for (const filePath of filePaths) {
          const fileContent = fs.readFileSync(filePath);
          const base64Image = fileContent.toString('base64');

          const contentVersion = {
            Title: path.basename(filePath), // Set file name as the title
            PathOnClient: filePath, // Path on the local machine
            VersionData: base64Image, // Base64-encoded file content
            FirstPublishLocationId: parentId, // The parent record ID (like an Account or Opportunity)
          };

          const result = await conn.sobject('ContentVersion').create(contentVersion);

          if (result.success) {
            this.log('Image inserted successfully with ContentVersion ID:', result.id);
          } else {
            this.error('Failed to insert image:');
          }
        }
      }
    } catch (error) {
      this.error('Error inserting random image:');
    }
  }

  private saveMapToJsonFile(folderName: string, fileName: string) {
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

  private convertJsonToCsv(jsonData: any[]): string {
    let fields;
    if (Array.isArray(jsonData)) {
      fields = Object.keys(jsonData[0]);
    } else {
      fields = Object.keys(jsonData);
      jsonData = [jsonData];
    }
    const csvRows = jsonData.map((row) => fields.map((field) => row[field]).join(','));
    return [fields.join(','), ...csvRows].join('\n');
  }
}
