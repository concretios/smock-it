/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable class-methods-use-this */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import main from 'smockit-data-engine';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import chalk from 'chalk';
import { connectToSalesforceOrg } from '../../../utils/generic_function.js';
import DataGenerate from './generate.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'data.upload');

type DataUploadResult = { path: string };
type GenericRecord = Record<string, unknown>;
type FieldRecord = {
  QualifiedApiName: string;
  DataType: string;
  IsNillable: boolean;
  ReferenceTo: string[] | { referenceTo: string[] };
};
type TargetData = { name: string; type: string; values?: string[]; label?: string };
type CreateResult = { id: string; success: boolean; errors: any[] };

const createdRecordsIds: Map<string, string[]> = new Map();
const metadataCache: Map<string, FieldRecord[]> = new Map();
const referenceIdCache: Map<string, string[]> = new Map();
let depthForRecord = 0;

export default class DataUpload extends SfCommand<DataUploadResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly Examples = messages.getMessage('Examples');

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

  private static async csvToJsonPromise(filePath: string): Promise<GenericRecord[]> {
    return new Promise((resolve, reject) => {
      const records: GenericRecord[] = [];
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let headers: string[] = [];
      rl.on('line', (line) => {
        const values = line.split(',').map((v) => v.trim());
        if (!headers.length) {
          headers = values;
        } else {
          const record: GenericRecord = {};
          headers.forEach((header, index) => {
            record[header] = values[index] || '';
          });
          records.push(record);
        }
      });

      rl.on('close', () => {
        resolve(records);
      });
      rl.on('error', (err) => {
        console.error(`Error reading CSV: ${err}`);
        reject(err);
      });
    });
  }

  private static async parseFile(filePath: string, fileType: 'json' | 'csv'): Promise<GenericRecord[]> {
    try {
      if (fileType === 'json') {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(data) as GenericRecord[];
      }
      if (fileType === 'csv') {
        return await this.csvToJsonPromise(filePath);
      }
      throw new Error('Unsupported file type. Please provide a .json or .csv file.');
    } catch (error) {
      throw new Error(`Failed to parse file: ${String(error)}`);
    }
  }

  private static checkFileType(filename: string): 'json' | 'csv' {
    if (!filename.includes('.'))
      throw new Error(
        "File type missing from '-u' or '--upload' flag. Please provide a filename with .json or .csv extension."
      );
    const fileExtension = path.extname(filename).toLowerCase();
    if (fileExtension !== '.json' && fileExtension !== '.csv')
      throw new Error("Unsupported file type in '-u' or '--upload' flag. Please provide a .json or .csv file.");
    const filePath = path.join(process.cwd(), 'data_gen/output', filename);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return fileExtension === '.json' ? 'json' : 'csv';
  }

  private static saveCreatedRecordIds(): void {
    const outputDir = path.join(process.cwd(), 'data_gen', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const fileName = `createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]
      }.json`;
    const resultObject: Record<string, string[]> = {};
    createdRecordsIds.forEach((ids, objectName) => (resultObject[objectName] = ids));
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(resultObject, null, 2), 'utf-8');
    console.log(
      chalk.green.bold(`The IDs of the created records have been saved to: ${path.join(outputDir, fileName)}`)
    );
  }

  private static processInsertResults(sobject: string, insertResults: CreateResult[]): void {
    const failedRecords: number = insertResults.filter((result) => !result.success).length;

    const insertedIds: string[] = [];

    insertResults.forEach((result, index) => {
      if (result.success && result.id) {
        insertedIds.push(result.id);
      }
    });

    if (failedRecords > 0) {
      const errorMessage = `${failedRecords} record(s) failed to insert.`;
      throw new Error(errorMessage); // Throw a single error message
    }
    if (insertedIds.length > 0) {
      createdRecordsIds.set(sobject, insertedIds);
    } else {
      throw new Error('No records were inserted. Some fields may not be valid or no data provided.');
    }
  }

  private async fetchObjectMetadata(conn: Connection, sobject: string): Promise<FieldRecord[]> {
    if (metadataCache.has(sobject)) return metadataCache.get(sobject)!;
    const query = `
      SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo
      FROM EntityParticle
      WHERE EntityDefinition.QualifiedApiName = '${sobject}' AND IsCreatable = true
    `;
    try {
      const result = await conn.tooling.query<FieldRecord>(query);
      metadataCache.set(sobject, result.records);
      return result.records;
    } catch (error) {
      throw new Error(`Failed to fetch metadata for ${sobject}: ${String(error)}`);
    }
  }

  private async processFieldsForParentObjects(
    fields: FieldRecord[],
    conn: Connection,
    object: string
  ): Promise<Array<Partial<TargetData>>> {
    const processedFields: Array<Partial<TargetData>> = [];
    const picklistFields = fields.filter((f) => f.DataType === 'picklist' || f.DataType === 'multipicklist');
    const picklistValues =
      picklistFields.length > 0
        ? await this.getPicklistValuesBulk(
          conn,
          object,
          picklistFields.map((f) => f.QualifiedApiName)
        )
        : {};

    for (const item of fields) {
      const fieldName = item.QualifiedApiName;
      const dataType = item.DataType;
      const isReference = dataType === 'reference' && !['OwnerId', 'CreatedById', 'ParentId'].includes(fieldName);
      const isPicklist = dataType === 'picklist' || dataType === 'multipicklist';

      const details: Partial<TargetData> = { name: fieldName };

      if (isReference) {
        details.type = 'Custom List';
        if (!item.IsNillable) depthForRecord++;
        const referenceTo = Array.isArray(item.ReferenceTo) ? item.ReferenceTo[0] : item.ReferenceTo?.referenceTo?.[0];
        if (referenceTo) {
          details.values = await this.fetchRelatedRecordIds(conn, referenceTo);
          processedFields.push(details);
        }
      } else if (isPicklist) {
        details.type = 'Custom List';
        details.values = picklistValues[fieldName] || [];
        processedFields.push(details);
      } else {
        const fieldType = this.getFieldType(item);
        if (fieldType) {
          details.type = fieldType;
          processedFields.push(details);
        }
      }
    }
    return processedFields;
  }

  private getFieldType(item: FieldRecord): string {
    const itemType = item.DataType;
    if (itemType === 'string' || itemType === 'textarea') return 'text';
    if (itemType === 'picklist' || itemType === 'multipicklist') return 'picklist';
    return itemType;
  }

  private async getPicklistValuesBulk(
    conn: Connection,
    object: string,
    fields: string[]
  ): Promise<Record<string, string[]>> {
    try {
      const describe = await conn.describe(object);
      const result: Record<string, string[]> = {};
      for (const fieldName of fields) {
        const fieldDetails = describe.fields.find((f: any) => f.name === fieldName);
        result[fieldName] = fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
      }
      return result;
    } catch (error) {
      throw new Error(`Failed to fetch picklist values for ${object}: ${String(error)}`);
    }
  }

  private async fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
    if (referenceIdCache.has(referenceTo)) return referenceIdCache.get(referenceTo) ?? [];
    if (createdRecordsIds.has(referenceTo)) {
      const ids = createdRecordsIds.get(referenceTo) ?? [];
      referenceIdCache.set(referenceTo, ids);
      return ids;
    }
    try {
      const relatedRecords = await conn.query<{ Id: string }>(`SELECT Id FROM ${referenceTo} LIMIT 1`);
      const ids = relatedRecords.records.map((record) => record.Id);
      referenceIdCache.set(referenceTo, ids);
      return ids;
    } catch (error) {
      throw new Error(`Failed to fetch related record IDs for ${referenceTo}:${String(error)}`);
    }
  }

  private async enhanceJsonDataWithRequiredFields(
    jsonData: GenericRecord[],
    fieldMap: Record<string, { type: string; values: any[]; label: string }>,
    conn: Connection,
    sobject: string
  ): Promise<GenericRecord[]> {
    if (!jsonData?.length) return jsonData;
    const getRandomValue = (values: any[]): any =>
      values.length ? values[Math.floor(Math.random() * values.length)] : null;

    const referenceFields = (await this.fetchObjectMetadata(conn, sobject)).filter(
      (f) => f.DataType === 'reference' && f.QualifiedApiName !== 'OwnerId'
    );

    const refIdValidations: Map<string, Set<string>> = new Map();
    for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
      if (fieldDetails.type !== 'Custom List' || !fieldDetails.values.length) continue;
      const refField = referenceFields.find((f) => f.QualifiedApiName === fieldName);
      const refObject =
        refField &&
        (Array.isArray(refField.ReferenceTo) ? refField.ReferenceTo[0] : refField.ReferenceTo?.referenceTo?.[0]);
      if (!refObject) continue;

      const idsToValidate = new Set<string>();
      jsonData.forEach((record) => {
        const value = record[fieldName];
        if (value && typeof value === 'string') idsToValidate.add(value);
      });
      refIdValidations.set(fieldName, idsToValidate);
    }

    const enhancedData = jsonData.map((record) => ({ ...record }));
    for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
      if (fieldDetails.type !== 'Custom List' || !fieldDetails.values.length) continue;
      const refField = referenceFields.find((f) => f.QualifiedApiName === fieldName);
      const refObject =
        refField &&
        (Array.isArray(refField.ReferenceTo) ? refField.ReferenceTo[0] : refField.ReferenceTo?.referenceTo?.[0]);
      if (!refObject) continue;

      const validIds = refIdValidations.get(fieldName)?.size
        ? await this.validateReferenceIds(conn, refObject, Array.from(refIdValidations.get(fieldName)!))
        : new Set<string>();

      for (const record of enhancedData) {
        const providedValue = record[fieldName];
        if (providedValue && validIds.has(providedValue as string)) continue;
        record[fieldName] = getRandomValue(fieldDetails.values);
      }
    }
    return enhancedData;
  }

  private async validateReferenceIds(conn: Connection, sobject: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    try {
      const query = `SELECT Id FROM ${sobject} WHERE Id IN ('${ids.join("','")}')`;
      const result = await conn.query<{ Id: string }>(query);
      return new Set(result.records.map((r) => r.Id));
    } catch (error) {
      console.warn(`Failed to validate IDs for ${sobject}: ${String(error)}`);
      return new Set();
    }
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
      throw new Error(
        `Max depth of ${MAX_DEPTH} reached at ${referencedObject}. Reference chain: ${parentChain.join(' -> ')}.`
      );
    }

    if (!referencedObject) throw new Error('Referenced object is undefined or invalid.');
    const currentChain = [...parentChain, referencedObject];

    if (createdRecordsIds.has(referencedObject)) {
      const ids = createdRecordsIds.get(referencedObject) ?? [];
      if (ids.length > 0) return ids[0];
    }

    try {
      const existingRecords = await conn.query<{ Id: string }>(`SELECT Id FROM ${referencedObject} LIMIT 1`);
      if (existingRecords.records.length > 0) {
        const id = existingRecords.records[0].Id;
        createdRecordsIds.set(referencedObject, [id]);
        return id;
      }
    } catch (error) {
      throw new Error(`Failed to query ${referencedObject}: ${String(error)}`);
    }

    depthForRecord++;
    const fields = await this.fetchObjectMetadata(conn, referencedObject);
    const referenceFields = fields.filter((f) => f.DataType === 'reference' && f.QualifiedApiName !== 'OwnerId');
    const requiredReferenceFields = referenceFields.filter((f) => !f.IsNillable);

    const parentIds: Map<string, string> = new Map();
    for (const refField of requiredReferenceFields) {
      const fieldName = refField.QualifiedApiName;
      const refObject = Array.isArray(refField.ReferenceTo)
        ? refField.ReferenceTo[0]
        : refField.ReferenceTo?.referenceTo?.[0];
      if (!refObject || refObject === referencedObject) continue;

      const parentId = await this.ensureParentRecordsExist(conn, refObject, true, hierarchyLevel + 1, currentChain);
      parentIds.set(fieldName, parentId);
    }

    const processFields = await this.processFieldsForParentObjects(fields, conn, referencedObject);
    const fieldMap = processFields.reduce<Record<string, any>>((acc, field) => {
      if (field.name) {
        acc[field.name] = { type: field.type, values: field.values ?? [], label: field.label ?? field.name };
      }
      return acc;
    }, {});

    const jsonData = await main.getFieldsData(fieldMap, 1);
    if (!jsonData?.length) throw new Error(`Failed to generate valid data for ${referencedObject}`);

    const enhancedData = await this.enhanceJsonDataWithRequiredFields(jsonData, fieldMap, conn, referencedObject);
    const cleanedData = enhancedData.map((record) => {
      const cleaned = { ...record };
      parentIds.forEach((id, field) => (cleaned[field] = id));
      delete cleaned['OwnerId'];
      return cleaned;
    });

    const insertResults: CreateResult[] = (await DataGenerate.insertRecords(
      conn,
      referencedObject,
      cleanedData
    )) as CreateResult[];
    const newIds = insertResults.filter((r) => r.success && r.id).map((r) => r.id);
    if (!newIds.length)
      throw new Error(
        `Failed to create ${referencedObject}: ${JSON.stringify(insertResults.map((r) => r.errors ?? []).flat())}`
      );

    createdRecordsIds.set(referencedObject, newIds);
    depthForRecord--;
    return newIds[0];
  }

  public async run(): Promise<DataUploadResult> {
    const { flags } = await this.parse(DataUpload);
    const filename = flags.uploadFile ?? 'err';
    const aliasOrUsername = flags.alias ?? 'err';
    const sobject = flags.sObject ?? 'err';
    if (!flags.sObject) {
      throw new Error(
        "Data can't be uploaded without a sObject. Please provide a valid sObject name in the command using '-s' or '--sObject' flag."
      );
    }
    const fileType = DataUpload.checkFileType(filename);
    const filePath = path.join(process.cwd(), 'data_gen/output', filename);

    try {
      const conn = await connectToSalesforceOrg(aliasOrUsername);
      let records = await DataUpload.parseFile(filePath, fileType);


      if (!Array.isArray(records)) records = [records];

      const fields = await this.fetchObjectMetadata(conn, sobject);



      const referenceFields = fields.filter((f) => f.DataType === 'reference' && f.QualifiedApiName !== 'OwnerId');

      const parentRecordIds: Map<string, string> = new Map();
      depthForRecord = 0;
      for (const field of referenceFields) {
        const fieldName = field.QualifiedApiName;
        const refObject = Array.isArray(field.ReferenceTo) ? field.ReferenceTo[0] : field.ReferenceTo?.referenceTo?.[0];
        if (!refObject) continue;
        const isFieldInJson = records.some((r) => r[fieldName] !== undefined);
        const isRequired = !field.IsNillable;
        if (isFieldInJson || isRequired) {
          parentRecordIds.set(
            fieldName,
            await this.ensureParentRecordsExist(conn, refObject, isRequired, 0, [sobject])
          );
        }
      }

      const processFields = await this.processFieldsForParentObjects(fields, conn, sobject);
      const fieldMap = processFields.reduce<Record<string, any>>((acc, field) => {
        if (field.name) {
          acc[field.name] = { type: field.type, values: field.values ?? [], label: field.label ?? field.name };
        }
        return acc;
      }, {});

      records = await this.enhanceJsonDataWithRequiredFields(records, fieldMap, conn, sobject);
      const finalRecords = records.map((record) => {
        const cleaned = { ...record };
        referenceFields.forEach((field) => {
          const fieldName = field.QualifiedApiName;
          if (parentRecordIds.has(fieldName)) cleaned[fieldName] = parentRecordIds.get(fieldName);
        });
        delete cleaned['OwnerId'];
        return cleaned;
      });

      const insertResults = await DataGenerate.insertRecords(conn, sobject, finalRecords);
      DataUpload.processInsertResults(sobject, insertResults);
      DataUpload.saveCreatedRecordIds();

      return { path: filePath };
    } catch (error) {
      throw new Error(`${String(error)}`);
    }
  }
}
