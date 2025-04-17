/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable sf-plugin/flag-case */
import * as fs from 'node:fs';
import main from 'sf-mock-data';

import * as path from 'node:path';
import * as readline from 'node:readline';

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { connectToSalesforceOrg } from '../../utils/generic_function.js';
import { SalesforceConnector } from '../../services/salesforce-connector.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'data.upload');

type FieldRecord = {
  QualifiedApiName: string;
  IsDependentPicklist: boolean;
  NamespacePrefix?: string;
  DataType: string;
  ReferenceTo?: string[] | { referenceTo: string[] };
  RelationshipName?: string;
  IsNillable: boolean;
};

type DataUploadResult = {
  path: string;
};

type GenericRecord = Record<string, unknown>;

type TargetData = {
  name: string;
  type: string;
  min?: number;
  max?: number;
  decimals?: number;
  values?: string[];
  label?: string;
};

const createdRecordsIds: Map<string, string[]> = new Map();
let depthForRecord = 0;

export default class DataUpload extends SfCommand<DataUploadResult> {
  public static readonly summary: string = messages.getMessage('summary');
  public static readonly Examples: string = messages.getMessage('Examples');

  public static readonly flags = {
    uploadFile: Flags.string({
      summary: messages.getMessage('flags.uploadFile.summary'),
      description: messages.getMessage('flags.uploadFile.description'),
      char: 'u',
    }),
    alias: Flags.string({
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      char: 'a',
    }),
    sObject: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObject.summary'),
      description: messages.getMessage('flags.sObject.description'),
      required: false,
    }),
  };

  private static csvToJsonPromise(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const records: any[] = [];
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let headers: string[] = [];

      rl.on('line', (line) => {
        const values = line.split(',');
        if (!headers.length) {
          headers = values;
        } else {
          const record: GenericRecord = {};
          headers.forEach((header, index) => {
            record[header.trim()] = values[index]?.trim() || '';
          });
          records.push(record);
        }
      });

      rl.on('close', () => {
        const jsonString = JSON.stringify(records);
        resolve(jsonString);
      });

      rl.on('error', (error) => reject(error));
    });
  }

  private static async parseFile(filePath: string, fileType: 'json' | 'csv'): Promise<GenericRecord[]> {
    if (fileType === 'json') {
      const rawData: string = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(rawData) as GenericRecord[];
    }

    if (fileType === 'csv') {
      try {
        const jsonData = await this.csvToJsonPromise(filePath);
        return JSON.parse(jsonData) as GenericRecord[];
      } catch (error) {
        throw new Error(`Failed to process CSV file: ${error}`);
      }
    }

    throw new Error('Unexpected file type encountered.');
  }

  private static checkFileType(filename: string): 'json' | 'csv' {
    if (!filename.includes('.')) {
      throw new Error('File type missing. Please provide a filename with .json or .csv extension.');
    }

    const directory = path.join(process.cwd(), 'data_gen/output');
    const filePath = path.join(directory, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileExtension = path.extname(filename).toLowerCase();
    if (fileExtension === '.json') return 'json';
    if (fileExtension === '.csv') return 'csv';

    throw new Error('Unsupported file type. Please provide a .json or .csv file.');
  }

  // DI Create RecordIds
  private static saveCreatedRecordIds(folderName: string, fileName: string): void {
    const sanitizedFileName = fileName.replace(/[:/\\<>?|*]/g, '_');
    const outputDir = path.join(process.cwd(), folderName, 'output');

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

  private static processInsertResults(sobject: string, insertResults: { id?: string; success: boolean; errors?: any[] }[]): void {
    const errorSet: Set<string> = new Set();
    const insertedIds: string[] = [];

    insertResults.forEach((result, index) => {
      if (result.success && result.id) {
        insertedIds.push(result.id);
      } else if (result.errors) {
        result.errors.forEach((error) => {
          const errorMessage = error || JSON.stringify(error) || 'Unknown error';
          errorSet.add(`Record ${index + 1}: ${errorMessage}`);
        });
      }
    });

    if (errorSet.size > 0) {
      errorSet.forEach((error) => console.log(`- ${error}`));
    }

    if (insertedIds.length > 0) {
      createdRecordsIds.set(sobject, insertedIds);
      DataUpload.saveCreatedRecordIds(
        'data_gen',
        `createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]}.json`
      );
    } else {
      throw new Error('No records were inserted');
    }
  }

  private async processFieldsForParentObjects(
    records: Array<Record<string, any>>,
    conn: Connection,
    object: string
  ): Promise<Array<Partial<TargetData>>> {
    const processedFields: Array<Partial<TargetData>> = [];
    for (const item of records) {
      const fieldName = item.QualifiedApiName;
      const dataType = item.DataType;
      const isReference = dataType === 'reference';
      const isPicklist = dataType === 'picklist' || dataType === 'multipicklist';

      const details: Partial<TargetData> = { name: fieldName };

      if (isReference && !['OwnerId', 'CreatedById', 'ParentId'].includes(fieldName)) {
        details.type = 'Custom List';
        const isMasterDetail = !item.IsNillable;
        if (isMasterDetail) {
          depthForRecord++;
        }
        const referenceTo = Array.isArray(item.ReferenceTo) ? item.ReferenceTo[0] : item.ReferenceTo?.referenceTo?.[0];
        if (referenceTo) {
          const relatedIds = await this.fetchRelatedRecordIds(conn, referenceTo);
          details.values = relatedIds;
        }
        processedFields.push(details);
      } else if (isPicklist) {
        details.type = 'Custom List';
        details.values = await this.getPicklistValues(conn, object, fieldName);
        processedFields.push(details);
      } else {
        details.type = this.getFieldType(item);
        if (details.type) processedFields.push(details);
      }
    }
    return processedFields;
  }

  private async processObjectFieldsForParentObjects(
    conn: Connection,
    object: string,
    onlyRequiredFields: boolean
  ): Promise<Array<Partial<TargetData>>> {
    const query = this.buildFieldQuery(object, onlyRequiredFields);
    const result = await conn.query(query);
    const nameFieldResult = await conn.query(
      `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true AND IsNillable = true AND IsNameField = true`
    );
    const combinedResults = [...result.records, ...nameFieldResult.records];
    return this.processFieldsForParentObjects(combinedResults, conn, object);
  }

  private buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
    if (onlyRequiredFields) query += ' AND IsNillable = false';
    return query;
  }

  private getFieldType(item: Record<string, any>): string {
    const itemType = item.DataType;

    if (itemType === 'reference') {
      return 'reference';
    }

    if (itemType === 'string' || itemType === 'textarea') {
      return 'text';
    }

    if (itemType === 'picklist' || itemType === 'multipicklist') {
      return 'picklist';
    }

    return itemType;
  }

  // line 558 in record.ts
  private async getPicklistValues(conn: Connection, object: string, field: string): Promise<string[]> {
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    return fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
  }
  // line 526 in record.ts 
  private async fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    if (createdRecordsIds.has(referenceTo)) {
      return Array.from(createdRecordsIds.get(referenceTo) ?? []);
    }

    const relatedRecords: { records: { Id: string }[] } = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
    return relatedRecords.records.map((record) => record.Id);
  }

  private async enhanceJsonDataWithRequiredFields(
    jsonData: any[],
    fieldMap: Record<string, { type: string; values: any[]; label: string }>,
    conn: Connection,
    sobject: string
  ): Promise<any[]> {
    if (!jsonData || jsonData.length === 0) {
      console.error('No JSON data provided to enhance');
      return jsonData;
    }

    const getRandomValue = (values: any[]): any => {
      if (!values || values.length === 0) return null;
      return values[Math.floor(Math.random() * values.length)];
    };

    // Fetch reference fields metadata for the sObject
    const referenceFieldsQuery = `
      SELECT QualifiedApiName, ReferenceTo, IsNillable
      FROM EntityParticle
      WHERE EntityDefinition.QualifiedApiName = '${sobject}'
      AND DataType = 'reference'
      AND IsCreatable = true
      AND QualifiedApiName != 'OwnerId'
    `;
    const referenceFieldsResult = await conn.query<FieldRecord>(referenceFieldsQuery);
    const referenceFields = referenceFieldsResult.records;

    const enhancedData = jsonData.map(record => ({ ...record }));
   //  console.log(`>>> Original JSON data: ${JSON.stringify(enhancedData)}`);

    for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
      const { type, values } = fieldDetails;
      const isReferenceField = type === 'Custom List' || type === 'reference';
      const refField = referenceFields.find(f => f.QualifiedApiName === fieldName);
      const refObject = refField && (Array.isArray(refField.ReferenceTo) ? refField.ReferenceTo[0] : refField.ReferenceTo?.referenceTo?.[0]);

      // Skip if not a reference field or no values to assign
      if (!isReferenceField || values.length === 0) {
        continue;
      }

      for (const record of enhancedData) {
       //  console.log(`>>> Processing field ${fieldName} for record: ${JSON.stringify(record)}`);

        const providedValue = record[fieldName];

        if (providedValue && isReferenceField && refObject) {
          // Validate the provided reference ID
          try {
            const result = await conn.query<{ Id: string }>(
              `SELECT Id FROM ${refObject} WHERE Id = '${providedValue}' LIMIT 1`
            );
            if (result.records.length > 0) {
              // Valid ID, keep it
              continue;
            } else {
             //  console.log(`>>> Invalid reference ID ${providedValue} for ${fieldName} in ${sobject}, replacing with a valid ID`);
              record[fieldName] = getRandomValue(values);
            }
          } catch (error) {
            
            
            console.log(`>>> Error validating ${fieldName} ID ${providedValue}: ${error}`);
            record[fieldName] = getRandomValue(values);
          }
        } else if (!providedValue && isReferenceField && values.length > 0) {
          // Assign a random valid ID for reference fields that are missing
          record[fieldName] = getRandomValue(values);
        }
      }
    }

    return enhancedData;
  }

  private async ensureParentRecordsExist(
    conn: Connection,
    referencedObject: string,
    isRequired: boolean,
    hierarchyLevel: number = 0,
    parentChain: string[] = []
  ): Promise<string> {
    const MAX_DEPTH = 2;

    if (hierarchyLevel >= MAX_DEPTH) {
      const errorMsg = `Max depth of ${MAX_DEPTH} reached at ${referencedObject}. Reference chain: ${parentChain.join(' -> ')}. Please create ${referencedObject} records manually first.`;
      createdRecordsIds.clear();
      DataUpload.saveCreatedRecordIds(
        'data_gen',
        `createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]}.json`
      );
      throw new Error(errorMsg);
    }

    if (!referencedObject) {
      const errorMsg = 'Referenced object is undefined or invalid.';
      throw new Error(errorMsg);
    }

    // Update parent chain for tracking
    const currentChain = [...parentChain, referencedObject];

    if (createdRecordsIds.has(referencedObject)) {
      const existingIds = createdRecordsIds.get(referencedObject) ?? [];
      if (existingIds.length > 0) {
        this.log(`>>> Reusing cached ID for ${referencedObject}: ${existingIds[0]}`);
        return existingIds[0];
      }
    }

   //  this.log(`>>> Querying Salesforce for ${referencedObject}`);
    try {
      const relatedRecords = await conn.query(`SELECT Id FROM ${referencedObject} LIMIT 1`);
      if (relatedRecords.records.length > 0) {
        const id = relatedRecords.records[0].Id;
        if (id) {
          createdRecordsIds.set(referencedObject, [id]);
        } else {
          throw new Error(`Expected a valid ID but got undefined for ${referencedObject}`);
        }
        // this.log(`>>> Found existing ${referencedObject}: ${id}`);
        return id;
      }
    } catch (error) {
      const errorMsg = `Failed to query ${referencedObject}: ${error}`;
      throw new Error(errorMsg);
    }

    this.log(`>>> Creating new ${referencedObject}`);
    depthForRecord++;

    const describeQuery = `
      SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo
      FROM EntityParticle
      WHERE EntityDefinition.QualifiedApiName = '${referencedObject}'
      AND IsCreatable = true
    `;
    let fieldsResult: { records: FieldRecord[] };
    try {
      fieldsResult = await conn.query(describeQuery);
      // this.log(`>>> Fetched metadata for ${referencedObject}: ${fieldsResult.records.length} fields`);
    } catch (error) {
      const errorMsg = `Failed to fetch metadata for ${referencedObject}: ${error}`;
      throw new Error(errorMsg);
    }
    const allFields = fieldsResult.records;

    const referenceFields = allFields.filter(
      (field) => field.DataType === 'reference' && field.QualifiedApiName !== 'OwnerId'
    );
    const requiredReferenceFields = referenceFields.filter((field) => !field.IsNillable);
   //  this.log(`>>> ${referencedObject} has ${requiredReferenceFields.length} required reference fields`);

    const parentIds: Map<string, string> = new Map();
    for (const refField of requiredReferenceFields) {
      const fieldName = refField.QualifiedApiName;
      let refObject: string | undefined;

      if (Array.isArray(refField.ReferenceTo)) {
        refObject = refField.ReferenceTo[0];
      } else if (refField.ReferenceTo && typeof refField.ReferenceTo === 'object') {
        refObject = (refField.ReferenceTo as any)?.referenceTo?.[0];
      }

      this.log(`>>> ${referencedObject}.${fieldName} references ${refObject}`);

      if (!refObject) {
        this.log(`>>> WARNING: Invalid ReferenceTo for ${fieldName}. Skipping.`);
        continue;
      }

      if (refObject === referencedObject) {
        this.log(`>>> WARNING: Self-reference in ${fieldName}. Skipping.`);
        continue;
      }

      try {
        const parentId = await this.ensureParentRecordsExist(conn, refObject, true, hierarchyLevel + 1, currentChain);
        parentIds.set(fieldName, parentId);
        this.log(`>>> Resolved ${refObject} ID: ${parentId}`);
      } catch (error) {
        const errorMsg = `Failed to resolve ${refObject} for ${fieldName}: ${error}`;
        this.log(`>>> ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    this.log(`>>> Generating mock data for ${referencedObject}`);
    let processFields: Array<Partial<TargetData>>;
    try {
      processFields = await this.processObjectFieldsForParentObjects(conn, referencedObject, true);
    } catch (error) {
      const errorMsg = `Failed to generate mock fields for ${referencedObject}: ${error}`;
      this.log(`>>> ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

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

    let jsonData: GenericRecord[];
    try {
      const initialJsonData = await main.getFieldsData(fieldMap, 1);
      if (!initialJsonData || (Array.isArray(initialJsonData) && initialJsonData.length === 0)) {
        throw new Error(`Failed to generate valid data for ${referencedObject}`);
      }
      jsonData = await this.enhanceJsonDataWithRequiredFields(initialJsonData, fieldMap, conn, referencedObject);
      this.log(`>>> Generated mock data for ${referencedObject}`);
    } catch (error) {
      const errorMsg = `Failed to fetch mock data for ${referencedObject}: ${error}`;
      this.log(`>>> ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const jsonDataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const cleanedJsonData = jsonDataArray.map((record) => {
      const cleanedRecord = { ...record };
      for (const [fieldName, parentId] of parentIds) {
        cleanedRecord[fieldName] = parentId;
      }
      if (cleanedRecord['OwnerId']) {
        delete cleanedRecord['OwnerId'];
      }
      return cleanedRecord;
    });

    this.log(`>>> Inserting ${referencedObject}`);
    let insertResults: { id?: string; success: boolean; errors?: any[] }[];
    try {
      insertResults = await SalesforceConnector.insertRecords(conn, referencedObject, cleanedJsonData);
    } catch (error) {
      const errorMsg = `Failed to insert ${referencedObject}: ${error}`;
      this.log(`>>> ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const newIds = insertResults
      .filter((result) => result.success && result.id)
      .map((result) => result.id as string);

    if (newIds.length === 0) {
      const errors = insertResults.flatMap((result) => result.errors ?? []);
      const errorMsg = `Failed to create ${referencedObject}: ${JSON.stringify(errors)}`;
      this.log(`>>> ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    createdRecordsIds.set(referencedObject, newIds);
    this.log(`>>> Created ${referencedObject}: ${newIds[0]}`);
    DataUpload.saveCreatedRecordIds(
      'data_gen',
      `createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]}.json`
    );

    depthForRecord--;
    this.log(`>>> Exiting ensureParentRecordsExist: ${referencedObject} with ID ${newIds[0]}`);
    return newIds[0];
  }

  public async run(): Promise<DataUploadResult> {
    const { flags } = await this.parse(DataUpload);
    const filename = flags['uploadFile'] ?? 'err';
    const aliasOrUsername = flags.alias ?? 'err';
    const sobject = flags.sObject ?? 'err';
    const fileType = DataUpload.checkFileType(filename);
    const filePath = path.join(process.cwd(), 'data_gen/output', filename);

    const conn = await connectToSalesforceOrg(aliasOrUsername);
    let records = await DataUpload.parseFile(filePath, fileType);

    if (!Array.isArray(records)) {
      records = [records];
    }

    // Fetch all fields metadata for the sObject
    const referenceFieldsQuery = `
      SELECT QualifiedApiName, DataType, ReferenceTo, IsNillable
      FROM EntityParticle
      WHERE EntityDefinition.QualifiedApiName = '${sobject}'
      AND IsCreatable = true
      AND DataType = 'reference'
      AND QualifiedApiName != 'OwnerId'
    `;
    const referenceFieldsResult = await conn.tooling.query(referenceFieldsQuery);
    const referenceFields = referenceFieldsResult.records;
   //  console.log(`>>> Reference fields: ${JSON.stringify(referenceFields)}`);

    // Map to store parent record IDs for reference fields
    const parentRecordIds: Map<string, string> = new Map();

    // Process all reference fields
    depthForRecord = 0;
    for (const field of referenceFields) {
      const fieldName = field.QualifiedApiName;
      const refObject = Array.isArray(field.ReferenceTo) ? field.ReferenceTo[0] : (field.ReferenceTo as any)?.referenceTo?.[0];
      if (!refObject) {
       //  this.log(`Error: ReferenceTo is invalid for field ${fieldName}: ${JSON.stringify(field.ReferenceTo)}`);
        continue;
      }
      // Check if the field is present in the JSON or is required
      const isFieldInJson = records.some((record) => record[fieldName] !== undefined);
      const isRequired = !field.IsNillable;
      if (isFieldInJson || isRequired) {
        const parentId = await this.ensureParentRecordsExist(conn, refObject, isRequired, 0, [sobject]);
        parentRecordIds.set(fieldName, parentId);
      }
    }

    // Enhance JSON data with valid reference IDs
    const processFields = await this.processObjectFieldsForParentObjects(conn, sobject, false); // Include all fields, not just required
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
    records = await this.enhanceJsonDataWithRequiredFields(records, fieldMap, conn, sobject);

    // Validate and update reference fields in the JSON records
    const finalRecords = await Promise.all(
      records.map(async (record) => {
        const cleanedRecord = { ...record };
        for (const field of referenceFields) {
          const fieldName = field.QualifiedApiName;
          const refObject = Array.isArray(field.ReferenceTo) ? field.ReferenceTo[0] : (field.ReferenceTo as any)?.referenceTo?.[0];
          const providedId = cleanedRecord[fieldName];

          if (!refObject) continue;

          if (providedId && typeof providedId === 'string') {
            try {
              const result = await conn.query<{ Id: string }>(
                `SELECT Id FROM ${refObject} WHERE Id = '${providedId}' LIMIT 1`
              );
              if (result.records.length === 0) {
                // Invalid ID, replace with a valid one from parentRecordIds
                cleanedRecord[fieldName] = parentRecordIds.get(fieldName);
              }
            } catch (error) {
              // Error validating ID, replace with a valid one
              cleanedRecord[fieldName] = parentRecordIds.get(fieldName);
            }
          } else if (parentRecordIds.has(fieldName)) {
            // No provided ID, use a valid one if available
            cleanedRecord[fieldName] = parentRecordIds.get(fieldName);
          }
        }

        if (cleanedRecord['OwnerId']) {
          delete cleanedRecord['OwnerId'];
        }
        return cleanedRecord;
      })
    );

    try {
      const insertResults = await SalesforceConnector.insertRecords(conn, sobject, finalRecords);
      DataUpload.processInsertResults(sobject, insertResults);
    } catch (error) {
      console.error('Insert Error:', error);
      throw error;
    }

    return { path: filePath };
  }
}