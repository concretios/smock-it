/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable jsdoc/tag-lines */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import GenerateTestData from 'sf-mock-data';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection, SfError } from '@salesforce/core';
import chalk from 'chalk';
import { connectToSalesforceOrg } from '../../../utils/generic_function.js';
import DataGenerate from './generate.js';
import { GenericRecord, CreateResult, FieldRecord } from '../../../utils/types.js';
import { insertRecordsspecial } from '../../../utils/conditional_object_handling.js';


Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'data.upload');

const MAX_RECURSION_DEPTH = 4;

type DataUploadResult = { path: string };

export default class DataUpload extends SfCommand<DataUploadResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('Examples');

  private static createdRecordsIds: Map<string, string[]> = new Map();
  private static metadataCache: Map<string, FieldRecord[]> = new Map();
  private static currentDepth = 0; // Tracks the current depth in the hierarchy

  public static readonly flags = {
    uploadFile: Flags.string({
      summary: messages.getMessage('flags.uploadFile.summary'),
      description: messages.getMessage('flags.uploadFile.description'),
      char: 'u',
      required: true,
    }),
    alias: Flags.string({
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      char: 'a',
      required: true,
    }),
    sObject: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObject.summary'),
      description: messages.getMessage('flags.sObject.description'),
      required: true,
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
      rl.on('close', () => resolve(records));
      rl.on('error', (err) => reject(new SfError(`Error reading CSV file: ${err.message}`, 'CsvParseError')));
    });
  }

  private static async parseFile(filePath: string): Promise<GenericRecord[]> {
    const fileExtension = path.extname(filePath).toLowerCase();
    try {
      if (fileExtension === '.json') {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(data);
        return Array.isArray(parsedData) ? parsedData : [parsedData];
      }
      if (fileExtension === '.csv') {
        return await this.csvToJsonPromise(filePath);
      }
      throw new SfError('Unsupported file type. Please provide a .json or .csv file.', 'UnsupportedFileTypeError');
    } catch (error: any) {
      throw new SfError(`Failed to parse file: ${error.message}`, 'FileParseError', [], error);
    }
  }

  private static checkFile(filename: string): string {
    if (!filename.includes('.'))
      throw new SfError(
        "File type missing from '-u' or '--upload-file' flag. Please provide a filename with .json or .csv extension.",
        'MissingFileExtension'
      );
    const fileExtension = path.extname(filename).toLowerCase();
    if (fileExtension !== '.json' && fileExtension !== '.csv')
      throw new SfError(
        "Unsupported file type in '-u' or '--upload-file' flag. Please provide a .json or .csv file.",
        'UnsupportedFileTypeError'
      );
    const filePath = path.join(process.cwd(), 'data_gen/output', filename);
    if (!fs.existsSync(filePath)) throw new SfError(`File not found: ${filePath}`, 'FileNotFound');
    return filePath;
  }

  private static saveCreatedRecordIds(log: (message: string) => void): void {
    const outputDir = path.join(process.cwd(), 'data_gen', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const fileName = `upload_createdRecords_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const resultObject: Record<string, string[]> = {};
    this.createdRecordsIds.forEach((ids, objectName) => (resultObject[objectName] = ids));
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(resultObject, null, 2), 'utf-8');
    log(chalk.green(`\n👍 Success! Created record IDs saved to: ${chalk.cyan(path.join(outputDir, fileName))}`));
  }

  private static processInsertResults(
    sobject: string,
    results: CreateResult[],
    totalRecords: number,
    log: (message: string) => void
  ): void {
    const successfulInserts = results.filter((r) => r.success);
    const failedInserts = results.filter((r) => !r.success);
    if (failedInserts.length > 0) {
      log(chalk.red(`Failed to insert ${failedInserts.length} ${sobject} records.`));
      const errorSummary = new Map<string, number>();
      failedInserts.forEach((res) => {
        const errorMessage = res.errors?.[0]?.message || 'Unknown error';
        errorSummary.set(errorMessage, (errorSummary.get(errorMessage) ?? 0) + 1);
      });
      log(chalk.red('Error summary:'));
      errorSummary.forEach((count, message) => {
        log(chalk.red(`- ${message} (${count} times)`));
      });
    }

    if (successfulInserts.length === 0 && totalRecords > 0) {
      throw new SfError(`No records were inserted for sObject: ${sobject}.`, 'InsertFailed');
    }
  }

  private async fetchObjectMetadata(conn: Connection, sobject: string, onlyRequired = false): Promise<FieldRecord[]> {
    if (!onlyRequired && DataUpload.metadataCache.has(sobject)) {
      return DataUpload.metadataCache.get(sobject)!;
    }
    let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo, RelationshipName, IsDependentPicklist FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${sobject}' AND IsCreatable = true`;
    if (onlyRequired) {
      query += ' AND IsNillable = false';
    }
    try {
      const result = await conn.tooling.query<FieldRecord>(query);
      if (!onlyRequired) {
        DataUpload.metadataCache.set(sobject, result.records);
      }
      return result.records;
    } catch (error: any) {
      throw new SfError(`Failed to fetch metadata for ${sobject}: ${error.message}`, 'MetadataError', [], error);
    }
  }

  private static coerceValue(value: any, dataType: string): any {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const lowerDataType = dataType.toLowerCase();
    switch (lowerDataType) {
      case 'boolean':
        if (typeof value === 'boolean') return value;
        const strValue = String(value).toLowerCase();
        return strValue === 'true' || strValue === '1';
      case 'double':
      case 'currency':
      case 'percent':
      case 'int':
        const num = parseFloat(String(value));
        return isNaN(num) ? undefined : num;
      case 'picklist':
        return String(value);
      default:
        return value;
    }
  }

  private async getPicklistValues(conn: Connection, object: string, field: string): Promise<string[]> {
    try {
      const result = await conn.describe(object);
      const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
      const picklistValues: string[] =
        fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value as string) ?? [];
      return picklistValues;
    } catch (error: any) {
      throw new SfError(
        `Failed to fetch picklist values for field ${field} on object ${object}: ${error.message}`,
        'PicklistFetchError',
        [],
        error
      );
    }
  }


  private getRandomPicklistValue(values: string[]): string | undefined {
    if (!values.length) return undefined;
    return values[Math.floor(Math.random() * values.length)];
  }

  private async ensureParentRecordExists(
    conn: Connection,
    referenceTo: string,
    sobject: string
  ): Promise<string> {
    if (!referenceTo) {
      throw new SfError(
        'Internal Error: ensureParentRecordExists was called with an undefined object name.',
        'InvalidInput'
      );
    }

    // Check if parent record already exists
    if (DataUpload.createdRecordsIds.has(referenceTo)) {
      return DataUpload.createdRecordsIds.get(referenceTo)![0];
    }

    // Check depth before proceeding
    if (DataUpload.currentDepth >= MAX_RECURSION_DEPTH) {
      throw new SfError(
        `Maximum hierarchy depth of ${MAX_RECURSION_DEPTH} reached while creating parent for ${referenceTo}. Simplify the relationship path or reduce nesting.`,
        'MaxHierarchyDepth'
      );
    }

    DataUpload.currentDepth++; // Increment depth for this level

    // Handle special case for Contact when sobject is Asset
    if (referenceTo === 'Contact' && sobject.toLowerCase() === 'asset') {
      const contactResult = await conn.query(
        'SELECT Id FROM Contact WHERE AccountId != NULL ORDER BY CreatedDate DESC LIMIT 1'
      );
      if (contactResult.records.length > 0) {
        const contactId = contactResult.records[0].Id;
        if (contactId) {
          DataUpload.createdRecordsIds.set(referenceTo, [contactId]);
          DataUpload.currentDepth--; // Decrement depth before returning
          return contactId;
        } else {
          throw new SfError('Contact ID is undefined.', 'UndefinedContactIdError');
        }
      }
    }

    try {
      const requiredFields = await this.fetchObjectMetadata(conn, referenceTo, true);
      const recordToCreate: GenericRecord = {};
      const fieldMap: Record<string, { type: string; values: any[]; label: string }> = {};

      // Define fields to exclude
      const excludedFields = new Set([
        'OwnerId',
        'IsStopped',
        'HasOptedOutOfEmail',
        'HasOptedOutOfFax',
        'DoNotCall',
        'ForecastCategoryName',
        'ShouldSyncWithOci',
      ]);

      // Map Salesforce DataType to fieldMap type
      const fieldTypeMap: Record<string, string> = {
        string: 'text',
        reference: 'reference',
        picklist: 'picklist',
      };

      // Transform requiredFields into fieldMap and handle recursive references
      for (const field of requiredFields) {
        const fieldName = field.QualifiedApiName;
        if (excludedFields.has(fieldName)) continue;

        // Handle special cases
        if (referenceTo === 'Order' && fieldName === 'Status') {
          recordToCreate.Status = 'Draft';
          continue;
        }
        if (referenceTo === 'Contract' && fieldName === 'Status') {
          recordToCreate.Status = 'Draft';
          continue;
        }

        const fieldType = fieldTypeMap[field.DataType.toLowerCase()] || field.DataType.toLowerCase();

        if (field.DataType === 'reference') {
          const parentOfParentName = (field.ReferenceTo as any)?.referenceTo?.[0];
          if (parentOfParentName) {
            // Recursive call to create grandparent
            const grandParentId = await this.ensureParentRecordExists(conn, parentOfParentName, referenceTo);
            recordToCreate[fieldName] = grandParentId;
          }
        } else if (field.DataType === 'picklist') {
          const picklistValues = await this.getPicklistValues(conn, referenceTo, fieldName);
          if (picklistValues.length > 0) {
            const randomValue = this.getRandomPicklistValue(picklistValues);
            if (randomValue) {
              recordToCreate[fieldName] = randomValue;
            }
          } else {
            console.warn(`No picklist values found for field ${fieldName} on ${referenceTo}`);
          }
        } else {
          fieldMap[fieldName] = {
            type: fieldType,
            values: [],
            label: fieldName,
          };
        }
      }

      // Generate data for non-reference and non-picklist fields
      if (Object.keys(fieldMap).length > 0) {
        const generatedData = await GenerateTestData.getFieldsData(fieldMap, 1);
        Object.assign(recordToCreate, generatedData[0]);
      }

      // Ensure Asset has at least AccountId if not already set
      if (referenceTo === 'Asset' && !recordToCreate.AccountId && !recordToCreate.ContactId) {
        const accountId = await this.ensureParentRecordExists(conn, 'Account', referenceTo);
        recordToCreate.AccountId = accountId;
      }

      // Insert the new record
      const insertResult = await DataGenerate.insertRecords(conn, referenceTo, [recordToCreate]);
      const newId = insertResult[0]?.id;

      if (!insertResult[0]?.success || !newId) {
        const errorMsg = insertResult[0]?.errors?.[0]?.message ?? 'Unknown error';
        throw new SfError(`Failed to create parent record for ${referenceTo}: ${errorMsg}`, 'ParentInsertFailed');
      }

      DataUpload.createdRecordsIds.set(referenceTo, [newId]);
      return newId;
    } catch (err: any) {
      this.spinner.stop('Error');
      if (err instanceof SfError) {
        throw err;
      }
      throw new SfError(
        `An unexpected error occurred while creating parent for ${referenceTo}: ${err.message}`,
        'ParentCreationUnexpectedError',
        [],
        err
      );
    } finally {
      DataUpload.currentDepth--;
    }
  }

  public async run(): Promise<DataUploadResult> {
    DataUpload.createdRecordsIds.clear();
    DataUpload.metadataCache.clear();
    DataUpload.currentDepth = 0;

    const { flags } = await this.parse(DataUpload);
    const sobject = flags.sObject ?? 'err';
    const fileName = flags.uploadFile ?? 'err';
    const filePath = DataUpload.checkFile(fileName);



    const conn = await connectToSalesforceOrg(flags.alias);

    const recordsFromFile = await DataUpload.parseFile(filePath);
    const sObjectMeta = await this.fetchObjectMetadata(conn, sobject);
    const allReferenceFieldsMeta = sObjectMeta.filter((f) => f.DataType === 'reference');
    const parentTypesToCreate = new Set<string>();

    // Identify parent types for reference fields
    allReferenceFieldsMeta
      .filter((f) => !f.IsNillable && !['OwnerId', 'CreatedById', 'LastModifiedById'].includes(f.QualifiedApiName))
      .forEach((refField) => {
        const parentObjectName = (refField.ReferenceTo as any)?.referenceTo?.[0];
        if (parentObjectName) parentTypesToCreate.add(parentObjectName);
      });

    recordsFromFile.forEach((record) => {
      for (const key in record) {
        const meta = allReferenceFieldsMeta.find((f) => f.QualifiedApiName === key);
        if (meta) {
          const parentObjectName = (meta.ReferenceTo as any)?.referenceTo?.[0];
          if (parentObjectName) parentTypesToCreate.add(parentObjectName);
        }
      }
    });

    const parentIdMap = new Map<string, string>();
    for (const parentObjectName of parentTypesToCreate) {
      const parentId = await this.ensureParentRecordExists(conn, parentObjectName, sobject);
      parentIdMap.set(parentObjectName, parentId);
    }

    // this.spinner.start(`Uploading data to Salesforce org: ${flags.alias}. Please wait...`);

    const fieldMetaMap = new Map(sObjectMeta.map((f) => [f.QualifiedApiName, f]));

    const finalRecordsToInsert = await Promise.all(
      recordsFromFile.map(async (fileRecord) => {
        const finalRecord: GenericRecord = {};

        for (const key in fileRecord) {
          const meta = fieldMetaMap.get(key);
          if (!meta) continue;

          else if (meta.DataType !== 'reference') {
            const coercedValue = DataUpload.coerceValue(fileRecord[key], meta.DataType);
            if (coercedValue !== undefined) {
              finalRecord[key] = coercedValue;
            }
          }
        }

        // Assign parent IDs for required reference fields
        allReferenceFieldsMeta.forEach((refField) => {
          const parentObjectName = (refField.ReferenceTo as any)?.referenceTo?.[0];
          if (parentObjectName && parentIdMap.has(parentObjectName)) {
            finalRecord[refField.QualifiedApiName] = parentIdMap.get(parentObjectName);
          }
        });

        return finalRecord;
      })
    );


    this.log(chalk.blueBright('📦 Uploading Data into SF Org...'));
    this.log(
      chalk.blue(
        `   • sObject      : ${chalk.bold(sobject)}\n` +
        `   • Record Count : ${chalk.bold(finalRecordsToInsert.length.toString())}\n` +
        `   • Target Org   : ${chalk.yellowBright(flags.alias)}\n`
      )
    );
    this.log(chalk.blueBright('⏳ Please wait while records are being processed...\n'));

    let insertResults;
    if (
      sobject.toLowerCase() === 'order' ||
      sobject.toLowerCase() === 'task' ||
      sobject.toLowerCase() === 'productitemtransaction' ||
      sobject.toLowerCase() === 'event'
    ) {
      insertResults = await insertRecordsspecial(conn, sobject, finalRecordsToInsert);
    } else {
      insertResults = await DataGenerate.insertRecords(conn, sobject, finalRecordsToInsert);
    }

    DataUpload.processInsertResults(sobject, insertResults, finalRecordsToInsert.length, this.log.bind(this));

    const successfulMainRecordIds = insertResults.filter((r) => r.success).map((r) => r.id as string);
    if (successfulMainRecordIds.length > 0) {
      const existingIds = DataUpload.createdRecordsIds.get(sobject) || [];
      DataUpload.createdRecordsIds.set(sobject, [...existingIds, ...successfulMainRecordIds]);
    }

    DataUpload.saveCreatedRecordIds(this.log.bind(this));

    return { path: filePath };
  }
}