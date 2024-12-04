/* eslint-disable no-console */
/* eslint-disable sf-plugin/command-summary */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable sf-plugin/no-hardcoded-messages-flags */
/* eslint-disable no-useless-escape */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable jsdoc/check-alignment */
/* eslint-disable @typescript-eslint/member-delimiter-style */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable unicorn/prefer-node-protocol */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable no-param-reassign */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable sf-plugin/no-missing-messages */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable sf-plugin/get-connection-with-version */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
import * as path from 'path';
// import { fileURLToPath } from 'url';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { Connection } from '@salesforce/core';
import fetch from 'node-fetch';
import { templateAddFlags } from '../template/upsert.js';
const fieldsConfigFile = 'generated_output.json';
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'create.record');
let depthForRecord = 0;
// let orgConnection: any;
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

const _excludeFieldsSet = new Set<string>();
const createdRecordsIds: Map<string, string[]> = new Map();

export default class CreateRecord extends SfCommand<CreateRecordResult> {
  public static readonly flags = {
    ...templateAddFlags,
    templateName: Flags.string({
      summary: messages.getMessage('flags.confDir.summary'),
      char: 't',
    }),
    'include-files': Flags.string({
      summary: messages.getMessage('flags.include-files.summary'),
      description: messages.getMessage('flags.include-files.description'),
      char: 'f',
      multiple: true,
    }),
  };
  public orgConnection: any;

  /**
   * Main method to execute the record creation process.
   *
   * @returns {Promise<CreateRecordResult>} - The result of the record creation, including the path to the script.
   * @author Kunal Vishnani
   */
  public async run(): Promise<CreateRecordResult> {
    const { flags } = await this.parse(CreateRecord);
    _excludeFieldsSet.clear();
    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap = await this.getProcessedFields();

    const conn = this.orgConnection;
    const configPath = path.join(process.cwd(), fieldsConfigFile);
    const configData = fs.readFileSync(configPath, 'utf8');
    const jsonDataForObjectNames = JSON.parse(configData);

    // Get outputFormat from JSON
    const outputFormat = jsonDataForObjectNames.outputFormat;
    const sObjectNames = jsonDataForObjectNames.sObjects.map((sObject: { sObject: string }) => sObject.sObject);
    const sObjectCountMap: Map<string, number> = new Map();
    jsonDataForObjectNames.sObjects.forEach((sObject: { sObject: string; count: number }) => {
      const sObjectName = sObject.sObject;
      const objectCount = sObject.count;
      sObjectCountMap.set(sObjectName, objectCount);
    });

    for (const object of sObjectNames) {
      const url = `https://api.mockaroo.com/api/generate.json?key=${this.getApiKey()}&count=${sObjectCountMap.get(
        object
      )}`;
      depthForRecord = 0;
      const fields = sObjectFieldsMap.get(object);
      if (!fields) {
        this.log(`No fields found for object: ${object}`);
        continue;
      }
      const processedFields = await this.processObjectFieldsForIntitalJsonFile(conn, fields, object);
      const jsonData = await this.fetchMockarooData(url, processedFields);

      if (outputFormat.includes('json') || outputFormat.includes('json')) {
        const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];
        const jsonFilePath = `${process.cwd()}/data_gen/output/${object}_${flags.templateName?.replace(
          '.json',
          ''
        )}_${dateTime}.json`;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        this.log(`Data for ${object} saved as JSON in ${jsonFilePath}`);
      }

      if (outputFormat.includes('csv') || outputFormat.includes('csv')) {
        const csvData = this.convertJsonToCsv(jsonData);
        const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];
        const csvFilePath = `${process.cwd()}/data_gen/output/${object}_${flags.templateName?.replace(
          '.json',
          ''
        )}_${dateTime}.csv`;
        fs.writeFileSync(csvFilePath, csvData);
        this.log(`Data for ${object} saved as CSV in ${csvFilePath}`);
      }

      if (outputFormat.includes('DI') || outputFormat.includes('di')) {
        // Create records in Salesforce and store IDs
        const errorSet: Set<string> = new Set();
        const insertedIds: string[] = [];
        const insertResult = await this.insertRecords(conn, object, jsonData);
        insertResult.forEach((result: { id?: string; success: boolean; errors?: any[] }) => {
          if (result.success && result.id) {
            insertedIds.push(result.id);
          } else if (result.errors) {
            result.errors.forEach((error) => errorSet.add(error.message));
          }
        });
        this.log(`Records inserted for ${object}`);
        if (errorSet.size > 0) {
          this.log(
            `\nFailed to insert ${
              insertResult.length - insertedIds.length
            } record(s) for '${object}' object with following error(s):`
          );
          errorSet.forEach((error) => this.log(`- ${error}`));
        }
        this.updateCreatedRecordIds(object, insertResult);

        if (flags['include-files'] !== undefined && flags['include-files']?.length > 0) {
          this.insertImage(flags['include-files'], conn, insertedIds);
        }
      }
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

    return { path: `${process.cwd()}/src/commands/create/record.ts` };
  }

  /**
   * Establishes and returns a connection to the Salesforce org based on the username or alias.
   *
   * @param {string} username - The username of the Salesforce org or alias to connect to.
   * @returns {Promise<Connection>} - The connection object for interacting with Salesforce.
   * @author Kunal Vishnani
   */
  // private async getConnection(username?: string): Promise<Connection> {
  //   const org = await Org.create({ aliasOrUsername: username });
  //   return org.getConnection();
  // }
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
   * @author Kunal Vishnani
   */
  private async processObjectFieldsForIntitalJsonFile(
    conn: Connection,
    config: any[],
    object: string
  ): Promise<Partial<TargetData>[]> {
    // const query = this.buildFieldQuery(object, true);

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
   * @author Kunal Vishnani
   */
  private async processObjectFieldsForParentObjects(
    conn: Connection,
    object: string,
    onlyRequiredFields: boolean
  ): Promise<Partial<TargetData>[]> {
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
   * @author Kunal Vishnani
   */
  private buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
    if (onlyRequiredFields) query += ' AND IsNillable = false';
    return query;
  }

  /**
   * Fetches data from the Mockaroo API using a POST request with the specified URL and request body.
   * The method sends the provided data to Mockaroo and returns the response as an array of `GenericRecord` objects.
   *
   * @param {string} url - The URL of the Mockaroo API endpoint to send the request to.
   * @param {Partial<TargetData>[]} body - The data to be sent in the request body, in JSON format.
   * @returns {Promise<GenericRecord[]>} - A promise that resolves to an array of `GenericRecord` objects received from the Mockaroo API.
   * @throws {Error} - Throws an error if the request to Mockaroo fails or if the response is not OK.
   * @author Kunal Vishnani
   */
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
  /**
   * Inserts records into a specified Salesforce object using the provided connection and JSON data for first 200 records.
   * For more than 200 record creation, use The Bulk API to processes records in batches (up to 10,000 per batch).
   * Each batch counts as a single API call, making it efficient for handling large datasets.
   *
   * @param {Connection} conn - The Salesforce connection instance used to perform the insert operation.
   * @param {string} object - The API name of the Salesforce object where the records will be inserted.
   * @param {GenericRecord[]} jsonData - An array of records to be inserted, formatted as `GenericRecord` objects.
   * @returns {Promise<CreateResult[]>} - A promise that resolves to an array of `CreateResult` objects, each representing the result of an insert operation.
   * @throws {Error} - Throws an error if the insert operation fails or if the response is not as expected.
   * @author Khushboo Sharma
   */
  private async insertRecords(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
    const results: CreateResult[] = [];
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const initialRecords = dataArray.slice(0, 200);
    if (initialRecords.length > 0) {
      try {
        const insertResults = await conn.sobject(object).create(initialRecords);
        const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
          (result) => ({
            id: result.id ?? '',
            success: result.success,
            errors: result.errors,
          })
        );
        results.push(...initialInsertResult);
      } catch (error) {
        console.error('Error during standard API insertion:', error);
        throw error;
      }
    }
    if (dataArray.length > 200) {
      const remainingRecords = dataArray.slice(200);
      const job = conn.bulk.createJob(object, 'insert');
      const batch = job.createBatch();
      batch.execute(remainingRecords);

      await new Promise<void>((resolve, reject) => {
        batch.on('queue', () => {
          batch.poll(1_000 /* interval(ms) */, 30_000 /* timeout(ms) */);
          resolve();
        });
        batch.on('error', (err) => {
          reject(err);
        });
      });
      const bulkResults: CreateResult[] = await new Promise((resolve, reject) => {
        batch.on('response', (rets: BulkQueryBatchResult[]) => {
          const mappedResults: CreateResult[] = rets.map((ret: BulkQueryBatchResult) => ({
            id: ret.id ?? '',
            success: ret.success ?? false,
            errors: ret.errors ?? [],
          }));
          resolve(mappedResults);
        });
        batch.on('error', (err) => {
          reject(err);
        });
      });

      results.push(...bulkResults);
      await job.close();
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
   * @author Kunal Vishnani
   */
  private updateCreatedRecordIds(object: string, results: CreateResult[]): void {
    const ids = results.filter((result) => result.success).map((result) => result.id);
    createdRecordsIds.set(object, ids);
  }

  /**
   * Handles the processing of fields for generating the initial JSON file based on the provided configuration.
   * This method calls `processFieldsForInitialJsonFile` with the given file and Salesforce connection.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object to process.
   * @param {any[]} file - An array of field records representing the configuration for generating the initial JSON file.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   * @author Kunal Vishnani
   */
  private async handleFieldProcessingForIntitalJsonFile(
    conn: Connection,
    object: string,
    file: any[]
  ): Promise<Partial<TargetData>[]> {
    // const result = await conn.query(query);
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
   * @author Kunal Vishnani
   */
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
  /**
   * Processes the fields from Salesforce records and prepares them for further use.
   * This method iterates through the records, identifies field types, and fetches related values as needed.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @param {boolean} [isParentObject=false] - Indicates whether the fields are from a parent object.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   * @author Kunal Vishnani
   */
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

      // const isNonNillableReference = isParentObject && !item.IsNillable;

      if (_excludeFieldsSet.has(fieldName)) continue;

      const details: Partial<TargetData> = { name: fieldName };

      if (isReference && !['OwnerId', 'CreatedById', 'ParentId'].includes(fieldName)) {
        details.type = 'Custom List';
        const isMasterDetail = !isParentObject ? item.relationshipType !== 'lookup' : !item.IsNillable;

        if (item.values && item.values.length) {
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
      } else if (isPicklist) {
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
   * @author Kunal Vishnani
   */
  private async processFieldsForInitialJsonFile(
    records: Record<string, any>[],
    conn: Connection,
    object: string
  ): Promise<Partial<TargetData>[]> {
    return this.processFields(records, conn, object);
  }

  /**
   * Processes fields for parent objects and retrieves related records, setting the `isParentObject` flag to `true`.
   *
   * @param {Record<string, any>[]} records - An array of field records to process.
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} object - The API name of the Salesforce object.
   * @returns {Promise<Partial<TargetData>[]>} - A promise that resolves to an array of processed field data.
   * @author Kunal Vishnani
   */
  private async processFieldsForParentObjects(
    records: Record<string, any>[],
    conn: Connection,
    object: string
  ): Promise<Partial<TargetData>[]> {
    return this.processFields(records, conn, object, true);
  }

  /**
   * Determines the field type based on the item's type and field name, with special handling for various data types.
   *
   * @param {Record<string, any>} item - The field record containing the type and name.
   * @param {boolean} [isParentObject=false] - Indicates if the field is from a parent object.
   * @returns {string} - The field type as a string.
   * @author Kunal Vishnani
   */
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

  /**
   * Gets the type for string fields based on the field name, with special handling for common naming patterns.
   *
   * @param {string} fieldName - The name of the field to determine the type for.
   * @returns {string} - The field type as a string.
   * @author Kunal Vishnani
   */
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

  /**
   * Gets the name field type based on the field name, with special handling for different name parts.
   *
   * @param {string} fieldName - The name of the field to determine the type for.
   * @returns {string} - The name field type as a string.
   * @author Kunal Vishnani
   */
  private getNameFieldType(fieldName: string): string {
    if (fieldName.includes('last')) return 'Last Name';
    if (fieldName.includes('first')) return 'First Name';
    if (fieldName.includes('middle')) return 'Word';
    if (fieldName.includes('salutation')) return 'Prefix';
    return 'Full Name';
  }

  /**
   * Gets the type for double fields based on the field name.
   *
   * @param {string} fieldName - The name of the field to determine the type for.
   * @returns {string} - The field type as a string.
   * @author Kunal Vishnani
   */
  private getDoubleFieldType(fieldName: string): string {
    if (fieldName.includes('latitude')) return 'Latitude';
    return 'Number';
  }

  /**
   * Gets the type for textarea fields based on the field name.
   *
   * @param {string} fieldName - The name of the field to determine the type for.
   * @returns {string} - The field type as a string.
   * @author Kunal Vishnani
   */
  private getTextareaFieldType(fieldName: string): string {
    if (fieldName.includes('street')) return 'Street Name';
    return '';
  }

  /**
   * Fetches related lookup record IDs for a given reference object from Salesforce.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} referenceTo - The API name of the referenced object.
   * @returns {Promise<string[]>} - A promise that resolves to an array of related record IDs.
   * @author Kunal Vishnani
   */
  private async fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    if (createdRecordsIds.has(referenceTo + '')) {
      return Array.from(createdRecordsIds.get(referenceTo + '') || []);
    }

    const relatedRecords = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
    return relatedRecords.records.map((record: any) => record.Id);
  }

  /**
   * Fetches related master record IDs, inserting records if necessary, and handling depth restrictions.
   *
   * @param {Connection} conn - The Salesforce connection object.
   * @param {string} referenceTo - The API name of the referenced master object.
   * @returns {Promise<string[]>} - A promise that resolves to an array of related master record IDs.
   * @author Kunal Vishnani
   */
  private async fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    if (createdRecordsIds.has(referenceTo + '')) {
      return Array.from(createdRecordsIds.get(referenceTo + '') || []);
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

  /**
   * Retrieves picklist values for a given field from Salesforce.
   *
   * @param {Connection} conn - The Salesforce connection object.`1
   * @param {string} object - The API name of the Salesforce object.
   * @param {string} field - The name of the picklist field.
   * @param {Record<string, any>} item - The field record containing picklist information.
   * @returns {Promise<string[]>} - A promise that resolves to an array of picklist values.
   * @author Kunal Vishnani
   */
  // public async getPicklistValues(
  //   conn: Connection,
  //   object: string,
  //   field: string,
  //   item: Record<string, any>
  // ): Promise<string[]> {
  //   if (item.values != null && item.values.length > 0) {
  //     return item.values;
  //   } else if (item.value != null && item.value.length > 0) {
  //     return [item.value];
  //   }
  //   const result = await conn.describe(object);
  //   const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
  //   const picklistValues = fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value) || [];
  //   return picklistValues;
  // }

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
    const picklistValues = fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value) || [];
    return picklistValues;
  }

  /**
   * Retrieves the API key from the configuration file.
   *
   * @returns {string} - The API key for external services.
   * @throws {Error} - Throws an error if the API key is not defined in the configuration file.
   * @author Kunal Vishnani
   */
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

  /**
   * Reads and parses the SObject configuration file.
   *
   * @returns {Promise<SObjectConfigFile>} - A promise that resolves to the parsed SObject configuration data.
   * @author Kunal Vishnani
   */
  private async readSObjectConfigFile(): Promise<SObjectConfigFile> {
    const configPath = path.resolve(process.cwd(), fieldsConfigFile);
    const configData = await fs.promises.readFile(configPath, 'utf-8');
    return JSON.parse(configData) as SObjectConfigFile;
  }

  /**
   * Processes the SObject configuration and returns a map of SObject names to their field objects.
   *
   * @returns {Promise<Map<string, any[]>>} - A promise that resolves to a map of SObject names to field objects.
   * @author Kunal Vishnani
   */
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
          const fieldObject: any = {
            name: fieldName,
            type: this.mapFieldType(fieldDetails.type),
          };

          if (fieldDetails.type === 'picklist' || fieldDetails.type === 'reference') {
            fieldObject.values = fieldDetails.values || [];
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
   * @param {fieldType} fieldType - The field type to map.
   * @returns {string} - The mapped field type as a string.
   * @author Kunal Vishnani
   */
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
      'dependent-picklist': 'picklist', // Skipping dependent-picklist for now
    };

    return typeMapping[fieldType] || 'Unknown';
  }
  /**
   * Retrieves a random element from an array.
   *
   * @param {T[]} array - The array from which to select a random element.
   * @returns {T | undefined} - The randomly selected element or `undefined` if the array is empty.
   * @author Kunal Vishnani
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
   * @author Kunal Vishnani
   */
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
              if (childFieldDetails && childFieldDetails[childDependentField]) {
                const grandChildFieldDetails = childFieldDetails[childDependentField][randomChildValue];

                // Updated: handle nested values inside the `values` key
                if (grandChildFieldDetails && grandChildFieldDetails['values']) {
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

  /**
   * Insert files with salesforce record Id.
   *
   * @param {string} filePaths - File Path in system.
   * @param {conn} conn - The Salesforce connection instance to interact with the org.
   * @param {string[]} parentIds - The array of salesforce records parent id.
   * @author Kunal Vishnani
   */
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
    const sanitizedFileName = fileName.replace(/[:\/\\<>?|*]/g, '_');
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
    this.log(`File created at: ${outputFile}`);
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
