/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */


import { Connection } from '@salesforce/core';
import {Progress } from '@salesforce/sf-plugins-core';
import { connectToSalesforceOrg } from '../utils/generic_function.js';
import { CreateResult, GenericRecord } from '../utils/types.js';

const progressBar = new Progress(true )

export class SalesforceConnector {
  private alias: string;
  private conn?: Connection;
  public static createdRecordsIds: Map<string, string[]> = new Map();


  public constructor(alias: string) {
    this.alias = alias;
  }

  public async connect(): Promise<Connection> {
    if (!this.conn) this.conn = await connectToSalesforceOrg(this.alias);

    if (!this.conn) throw new Error('Failed to establish Salesforce connection');
    return this.conn;
  }

  public static async handleDirectInsert(conn: Connection,outputFormat: string[],object: string,jsonData: GenericRecord[]): Promise<{ failedCount: number; insertedIds: string[] }> {

    if (outputFormat.includes('DI') || outputFormat.includes('di')) {
      const errorSet: Set<string> = new Set();
      const insertedIds: string[] = [];
      let failedCount = 0;
  
      const insertResult = await SalesforceConnector.insertRecords(conn, object, jsonData);
  
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
        console.log(`\nFailed to insert ${failedCount} record(s) for '${object}' object with the following error(s):`);
        errorSet.forEach((error) => console.log(`- ${error}`));
      }
  
      SalesforceConnector.updateCreatedRecordIds(object, insertResult);
  
      return { failedCount, insertedIds };
    }
  
    // Default return if outputFormat does not include 'DI' or 'di'
    return { failedCount: 0, insertedIds: [] };
  }

  public static async insertRecords(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const sObjectName: string = Array.isArray(object) ? object[0] : object;
    const results: CreateResult[] = [];

    if (!dataArray.length) return results;

    const BATCH_SIZE = 200;

    const mapResults = (insertResults: any, startIndex: number = 0): CreateResult[] =>
      (Array.isArray(insertResults) ? insertResults : [insertResults]).map((result, index) => {
        if (!result.success) {
          console.error(`Failed to insert record ${startIndex + index} for ${sObjectName}:`, result.errors);
        }
        return {
          id: result.id ?? '',
          success: result.success,
          errors: result.errors ?? [],
        };
      });

    try {
      if (dataArray.length <= BATCH_SIZE) {
        const insertResults = await conn.sobject(sObjectName).create(dataArray);
        results.push(...mapResults(insertResults));
        return results;
      }

      const initialBatch = dataArray.slice(0, BATCH_SIZE);
      const initialResults = await conn.sobject(sObjectName).create(initialBatch);
      results.push(...mapResults(initialResults));

      const remainingData = dataArray.slice(BATCH_SIZE);
      if (!remainingData.length) return results;

      const job = conn.bulk.createJob(sObjectName, 'insert');
      const batches: Array<Promise<void>> = [];
      progressBar.start(100, { title: 'Test' });

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
      throw error;
    }

    return results;
  }

  public static updateCreatedRecordIds(object: string, results: CreateResult[]): void {
    const ids = results.filter((result) => result.success).map((result) => result.id);
    this.createdRecordsIds.set(object, ids);
  }

}