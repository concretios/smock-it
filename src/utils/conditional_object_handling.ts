/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

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
import chalk from 'chalk';
// export async function insertRecordsspecial(conn: Connection, object: string, jsonData: GenericRecord[]): Promise<CreateResult[]> {
//     const results: CreateResult[] = [];
//     const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
//     if (dataArray.length <= 200) {
//       try {
//         const insertResults = await conn.sobject(object).create(jsonData);
//         const initialInsertResult: CreateResult[] = (
//           Array.isArray(insertResults) ? insertResults : [insertResults]
//         ).map((result) => ({
//           id: result.id ?? '',
//           success: result.success,
//           errors: result.errors,
//         }));
//         results.push(...initialInsertResult);
//       } catch (error) {
//         console.error('Error inserting records:', error);
//       }
//     } else {
//       const storeHere = dataArray.splice(0, 200);
//       const insertResults = await conn.sobject(object).create(storeHere);
//       const initialInsertResult: CreateResult[] = (Array.isArray(insertResults) ? insertResults : [insertResults]).map(
//         (result) => ({
//           id: result.id ?? '',
//           success: result.success,
//           errors: result.errors,
//         })
//       );
//       results.push(...initialInsertResult);

//       progressBar.start(100, { title: 'Test' });
//       const totalRecords = dataArray.length;
//       let processedRecords = 0;

//       try {
//         const job = conn.bulk.createJob(object, 'insert');
//         const batchSize = 200;

//         for (let i = 0; i < dataArray.length; i += batchSize) {
//           const batchData = dataArray.slice(i, i + batchSize);
//           const batch = job.createBatch();
//           batch.execute(batchData);

//           await new Promise<void>((resolve, reject) => {
//             batch.on('queue', () => {
//               batch.poll(500 , 600_000 );
//             });

//             batch.on('response', (rets: any[]) => {
//               const mappedResults: CreateResult[] = rets.map((ret: any) => ({
//                 id: ret.id ?? '',
//                 success: ret.success ?? false,
//                 errors: ret.errors ?? [],
//               }));

//               results.push(...mappedResults);
//               processedRecords += batchData.length;
//               const percentage = Math.ceil((processedRecords / totalRecords) * 100);
//               progressBar.update(percentage);

//               if (processedRecords >= totalRecords) {
//                 progressBar.update(100);
//                 progressBar.finish();
//               }

//               resolve();
//             });

//             batch.on('error', (err) => {
//               console.error('Batch Error:', err);
//               reject(err);
//             });
//           });
//         }

//         await job.close();
//       } catch (error) {
//         console.error('Error during bulk processing:', error);
//         progressBar.stop();
//         throw error;
//       }
//     }

//     return results;
//   }

export async function insertRecordsspecial(
    conn: Connection,
    object: string,
    jsonData: GenericRecord[]
): Promise<CreateResult[]> {
    const results: CreateResult[] = [];
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];

    const errorCountMap: Map<string, number> = new Map();
    let failedCount = 0;

    const mapResults = (insertResults: any): CreateResult[] =>
        (Array.isArray(insertResults) ? insertResults : [insertResults]).map((result) => {
            if (!result.success) {
                failedCount++;
                if (Array.isArray(result.errors)) {
                    result.errors.forEach((err: any) => {
                        const errorCode = err.statusCode;
                        const humanReadableMessage =
                            errorCode && salesforceErrorMap[errorCode]
                                ? salesforceErrorMap[errorCode]
                                : err.message || 'Unknown error occurred during insertion.';
                        const count = errorCountMap.get(humanReadableMessage) ?? 0;
                        errorCountMap.set(humanReadableMessage, count + 1);
                    });
                }
            }

            return {
                id: result.id ?? '',
                success: result.success,
                errors: result.errors ?? [],
            };
        });

    if (dataArray.length <= 200) {
        try {
            const insertResults = await conn.sobject(object).create(jsonData);
            results.push(...mapResults(insertResults));
        } catch (error) {
            console.error('Error inserting records:', error);
        }
    } else {
        const storeHere = dataArray.splice(0, 200);
        const insertResults = await conn.sobject(object).create(storeHere);
        results.push(...mapResults(insertResults));

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
                        batch.poll(500, 600_000);
                    });

                    batch.on('response', (rets: any[]) => {
                        results.push(...mapResults(rets));
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
                        const errorCode = (err as any).statusCode;
                        const humanReadableMessage =
                            errorCode && salesforceErrorMap[errorCode]
                                ? salesforceErrorMap[errorCode]
                                : err.message || 'Unknown error occurred during bulk insertion.';
                        const count = errorCountMap.get(humanReadableMessage) ?? 0;
                        errorCountMap.set(humanReadableMessage, count + batchData.length);
                        failedCount += batchData.length;

                        console.error('Batch Error:', humanReadableMessage);
                        reject(err);
                    });
                });
            }

            await job.close();
        } catch (error) {
            const errorCode = (error as any).statusCode;
            const humanReadableMessage =
                errorCode && salesforceErrorMap[errorCode]
                    ? salesforceErrorMap[errorCode]
                    : (error as any).message || 'Unknown error occurred during insertion.';
            console.error('Error during bulk processing:', humanReadableMessage);
            progressBar.stop();
            throw new Error(humanReadableMessage);
        }
    }

    if (failedCount > 0) {
        console.error(chalk.yellowBright(`❌ Failed to insert ${failedCount} record(s) for sObject: ${object}`));
        console.error(chalk.whiteBright('Error breakdown:'));
        errorCountMap.forEach((count, message) => {
            console.error(`• Record(s) failed with: ${chalk.redBright(message)}`);
        });
    }

    return results;
}


export const restrictedObjects = ['accountcleaninfo', 'activity', 'timeslot', 'paymentgatewayprovider', 'consumptionschedule', 'AppointmentTopicTimeSlot', 'approvalsubmission', 'approvalworkitem', 'approvalsubmissiondetail', 'assetaction', 'assetactionsource', 'assetstateperiod', 'contactcleaninfo', 'creditmemo', 'creditmemoinvapplication', 'creditmemoline', 'entitymilestone', 'financebalancesnapshot', 'floworchestrationinstance', 'floworchestrationlog', 'floworchestrationstageinstance', 'floworchestrationstepinstance', 'floworchestrationworkitem', 'invoice', 'invoiceline', 'leadcleaninfo', 'paymentmethod', 'serializedproducttransaction', 'serviceappointmentcapacityusage'];
export const userLicenseObjects = new Set(['resourceabsence', 'resourcepreference', 'servicecrewmember', 'serviceresource', 'serviceresourcecapacity', 'serviceresourcepreference', 'serviceresourceskill', 'serviceterritorymember', 'timesheet', 'timesheetentry', 'user', 'userprovisioningrequest', 'workbadge', 'workthanks', 'shift']);


export const salesforceErrorMap: Record<string, string> = {
    REQUIRED_FIELD_MISSING: 'Some required information is missing. Please ensure all required fields are filled.',
    INVALID_FIELD_FOR_INSERT_UPDATE: 'A field cannot be edited due to restrictions. Please verify field permissions.',
    INVALID_CROSS_REFERENCE_KEY: 'A referenced record is missing or invalid. Please ensure all related data exists.',
    INVALID_TYPE_ON_FIELD_IN_RECORD: 'Looks like the value doesn’t match the field type. Please check dates, numbers, or picklist options.',
    STRING_TOO_LONG: 'The text entered in a field is a little too long. Try shortening it to fit the allowed limit.',
    INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: 'Invalid picklist value. Please use one of the allowed values.',
    INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: 'You don’t have permission to access the record. Please reach out to your Salesforce admin for help.',
    DUPLICATES_DETECTED: 'A similar record already exists. Please review your data to avoid duplicates.',
    INVALID_OPERATION: 'The operation couldn’t be completed due to business rules. Please review your input and adjust as needed.',
    CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: 'Entity failed validation. Please contact support.',
    UNABLE_TO_LOCK_ROW: 'This record is currently being updated by another process , generation is paused for now. Please try again shortly.',
    LIMIT_EXCEEDED: 'TYou’ve reached the data processing limit. Please reduce the batch size or try again shortly',
    REQUEST_LIMIT_EXCEEDED: 'API request limit reached. Please wait a moment before trying again',
    FIELD_CUSTOM_VALIDATION_EXCEPTION: 'Some information doesn’t meet required criteria. Please review your data and try again.',
    FIELD_FILTER_VALIDATION_EXCEPTION: 'The value entered doesn’t meet the filter criteria set for the field. Please review and try again.',
    INVALID_FIELD: 'The field name entered is invalid. Please verify your configuration and try again.',
    INVALID_ID_FIELD: 'The ID format you entered is incorrect. Please verify your record IDs and try again.',
    FIELD_INTEGRITY_EXCEPTION: 'One or more fields cannot be accessed due to some restrictions. Please reach out to your Salesforce admin for help.',
};