/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/quotes */
import { Connection } from "@salesforce/core";
import { GenericRecord, CreateResult } from "./types.js";
import { Progress } from "@salesforce/sf-plugins-core";
const progressBar = new Progress(true);
export async function insertRecordsspecial(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
    const results: CreateResult[] = [];
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    if (dataArray.length <= 200) {
      try {
        const insertResults = await conn.sobject(object).create(jsonData);
        const initialInsertResult: CreateResult[] = (
          Array.isArray(insertResults) ? insertResults : [insertResults]
        ).map((result) => ({
          id: result.id ?? '',
          success: result.success,
          errors: result.errors,
        }));
        results.push(...initialInsertResult);
      } catch (error) {
        console.error('Error inserting records:', error);
      }
    } else {
      const storeHere = dataArray.splice(0, 200);
      const insertResults = await conn.sobject(object).create(storeHere);
      const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
        (result) => ({
          id: result.id ?? '',
          success: result.success,
          errors: result.errors,
        })
      );
      results.push(...initialInsertResult);

      progressBar.start(100, { title: 'Test' });
      const totalRecords = dataArray.length;
      let processedRecords = 0;

      try {
        const job = conn.bulk.createJob(object, 'insert');
        const batchSize = 200;

        for (let i = 0; i < dataArray.length; i += batchSize) {
          const batchData = dataArray.slice(i, i + batchSize);
          const batch = job.createBatch();
          batch.execute(batchData);

          await new Promise<void>((resolve, reject) => {
            batch.on('queue', () => {
              batch.poll(500 , 600_000 );
            });

            batch.on('response', (rets: any[]) => {
              const mappedResults: CreateResult[] = rets.map((ret: any) => ({
                id: ret.id ?? '',
                success: ret.success ?? false,
                errors: ret.errors ?? [],
              }));

              results.push(...mappedResults);
              processedRecords += batchData.length;
              const percentage = Math.ceil((processedRecords / totalRecords) * 100);
              progressBar.update(percentage);

              if (processedRecords >= totalRecords) {
                progressBar.update(100);
                progressBar.finish();
              }

              resolve();
            });

            batch.on('error', (err) => {
              console.error('Batch Error:', err);
              reject(err);
            });
          });
        }

        await job.close();
      } catch (error) {
        console.error('Error during bulk processing:', error);
        progressBar.stop();
        throw error;
      }
    }

    return results;
  }

export const restrictedObjects = ['accountcleaninfo', 'activity','timeslot', 'paymentgatewayprovider', 'AppointmentTopicTimeSlot', 'approvalsubmission', 'approvalworkitem', 'approvalsubmissiondetail', 'assetaction', 'assetactionsource', 'assetstateperiod', 'contactcleaninfo', 'creditmemo', 'creditmemoinvapplication', 'creditmemoline', 'entitymilestone', 'financebalancesnapshot', 'floworchestrationinstance', 'floworchestrationlog', 'floworchestrationstageinstance', 'floworchestrationstepinstance', 'floworchestrationworkitem', 'invoice', 'invoiceline', 'leadcleaninfo', 'paymentmethod', 'serializedproducttransaction', 'serviceappointmentcapacityusage'];
export const userLicenseObjects = new Set(['resourceabsence','resourcepreference','servicecrewmember','serviceresource','serviceresourcecapacity','serviceresourcepreference','serviceresourceskill','serviceterritorymember','timesheet','timesheetentry','user','userprovisioningrequest','workbadge','workthanks','shift']);


export const salesforceErrorMap: Record<string, string> = {
    REQUIRED_FIELD_MISSING: 'Some required information is missing. Please ensure all required fields are filled.',
    INVALID_FIELD_FOR_INSERT_UPDATE: 'A field cannot be edited due to restrictions. Please verify field permissions.',
    INVALID_CROSS_REFERENCE_KEY: 'A referenced record is missing or invalid. Please ensure all related data exists.',
    INVALID_TYPE_ON_FIELD_IN_RECORD: 'Field type mismatch. Please verify formats such as dates, numbers, or picklists.',
    STRING_TOO_LONG: 'A field contains text that is too long. Please shorten the value.',
    INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: 'Invalid picklist value. Please use one of the allowed values.',
    INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: 'Permission issue while referencing a record. Contact your Salesforce admin.',
    DUPLICATES_DETECTED: 'Duplicate record detected. Please check your data.',
    INVALID_OPERATION: 'he operation is not valid due to business rules. Review your input.',
    CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: 'Entity failed validation. Please contact support.',
    UNABLE_TO_LOCK_ROW: 'Another process is updating this record. Please try again later.',
    LIMIT_EXCEEDED: 'Too much data processed. Reduce batch size or try later.',
    REQUEST_LIMIT_EXCEEDED: 'API request limit exceeded. Wait and retry.',
    FIELD_CUSTOM_VALIDATION_EXCEPTION: 'Validation rule failed. Please check your data.',
    FIELD_FILTER_VALIDATION_EXCEPTION: 'Filter criteria not met. Please check your data.',
    INVALID_FIELD: 'Invalid field name. Please check your configuration.',
    INVALID_ID_FIELD: 'Invalid ID format. Please check your record IDs.',
    FIELD_INTEGRITY_EXCEPTION: 'One or more fields cannot be accessed due to some restrictions. Contact your Salesforce admin.',
  };
  