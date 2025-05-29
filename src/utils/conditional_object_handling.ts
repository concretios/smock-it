/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
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

export async function insertRecordsspecial(
    conn: Connection,
    object: string,
    jsonData: GenericRecord[]
): Promise<CreateResult[]> {
    const results: CreateResult[] = [];
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    const sObjectName = Array.isArray(object) ? object[0] : object;


    const errorCountMap: Map<string, number> = new Map();
    let failedCount = 0;

 
    const mapResults = (insertResults: any, startIndex: number): CreateResult[] =>
        (Array.isArray(insertResults) ? insertResults : [insertResults]).map((result, index) => {
            if (!result.success) {
                failedCount++;
                const record = dataArray[startIndex + index]; // Get the record that failed
                const possibleFields = record ? Object.keys(record).join(', ') : 'unknown field';
                if (result.errors && Array.isArray(result.errors)) {
                    result.errors.forEach((err: any) => {
                        const errorCode = err.statusCode || 'UNKNOWN_ERROR';
                        const fields = err.fields || [];
                        const fieldList = fields.length > 0 ? fields.join(', ') : possibleFields;
                        const errorTemplate = salesforceErrorMap[errorCode] || `Failed to insert "${object}" records due to technical issues..`;
                        const humanReadableMessage = errorTemplate
                            .replace('{field}', fieldList)
                            .replace('{object}', sObjectName)
                            .replace('{possibleFields}', possibleFields);
                        const currentCount = errorCountMap.get(humanReadableMessage) ?? 0;
                        errorCountMap.set(humanReadableMessage, currentCount + 1);
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
            results.push(...mapResults(insertResults, 0));
        } catch (error) {
            console.error('Error inserting records:', error);
        }
    } else {
        const storeHere = dataArray.splice(0, 200);
        const insertResults = await conn.sobject(object).create(storeHere);
        results.push(...mapResults(insertResults, 0));

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
                        results.push(...mapResults(rets, i));
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


export const restrictedObjects = ['accountcleaninfo', 'activity', 'timeslot', 'pricebookentry', 'paymentgatewayprovider', 'consumptionschedule', 'AppointmentTopicTimeSlot', 'approvalsubmission', 'approvalworkitem', 'approvalsubmissiondetail', 'assetaction', 'assetactionsource', 'assetstateperiod', 'contactcleaninfo', 'creditmemo', 'creditmemoinvapplication', 'creditmemoline', 'entitymilestone', 'financebalancesnapshot', 'floworchestrationinstance', 'floworchestrationlog', 'floworchestrationstageinstance', 'floworchestrationstepinstance', 'floworchestrationworkitem', 'invoice', 'invoiceline', 'leadcleaninfo', 'paymentmethod', 'serializedproducttransaction', 'serviceappointmentcapacityusage'];

export const userLicenseObjects = new Set(['resourceabsence', 'resourcepreference', 'servicecrewmember', 'serviceresource', 'serviceresourcecapacity', 'serviceresourcepreference', 'serviceresourceskill', 'serviceterritorymember', 'timesheet', 'timesheetentry', 'user', 'userprovisioningrequest', 'workbadge', 'workthanks', 'shift']);

export const salesforceErrorMap: Record<string, string> = {
    REQUIRED_FIELD_MISSING: 'Some required field on object "{object}" is missing. Please ensure it is filled.',
    INVALID_CROSS_REFERENCE_KEY: 'The referenced record for field on object "{object}" is missing or invalid. Please ensure the related data exists.',
    INVALID_TYPE_ON_FIELD_IN_RECORD: 'The value for field "{field}" on object "{object}" doesn’t match the expected type. Please check dates, numbers, or picklist options.',
    STRING_TOO_LONG: 'The value in the field "{field}" on the object "{object}" exceeds the allowed length. Please shorten it or use fieldsToConsider to specify a shorter value.',
    MAXIMUM_HIERARCHY_TREE_SIZE_REACHED: 'The hierarchy for object "{object}" exceeds the supported depth. Please simplify the structure.',
    INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: 'The value for field "{field}" on object "{object}" is invalid. Please use one of the allowed picklist values.',
    INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: 'You don’t have permission to access the record referenced by field "{field}" on object "{object}". Please contact your Salesforce admin.',
    DUPLICATES_DETECTED: 'A duplicate record was detected for object "{object}". Please review your data to avoid duplicates.',
    DUPLICATE_VALUE: 'A record with the same value in field "{field}" on object "{object}" already exists. Please check for duplicates.',
    INVALID_OPERATION: 'The operation on object "{object}" couldn’t be completed due to business rules. Please review your input.',
    CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: 'The record for object "{object}" failed validation. Please contact support.',
    STANDARD_PRICE_NOT_DEFINED: 'SmockIt will not be able to generate the data for the sObject "{object}". Please try for the supported sObject!',
    UNABLE_TO_LOCK_ROW: 'The record for object "{object}" is currently locked by another process. Please try again shortly.',
    LIMIT_EXCEEDED: 'The data processing limit has been reached. Please reduce the size or try again later.',
    REQUEST_LIMIT_EXCEEDED: 'The API request limit for object "{object}" has been reached. Please wait and try again.',
    FIELD_CUSTOM_VALIDATION_EXCEPTION: 'The field "{field}" on object "{object}" doesn’t meet validation criteria. Please review and try again.',
    FIELD_FILTER_VALIDATION_EXCEPTION: 'The value in field "{field}" on object "{object}" doesn’t meet the filter criteria. Please review and try again.',
    INVALID_FIELD: 'The field "{field}" on object "{object}" is invalid. Please verify your configuration.',
    INVALID_ID_FIELD: 'The ID in field "{field}" on object "{object}" is incorrect. Please verify the record ID.',
    FIELD_INTEGRITY_EXCEPTION: 'The field on object "{object}" cannot be accessed due to restrictions. Please check field-level security or contact your Salesforce admin.',
    STORAGE_LIMIT_EXCEEDED: 'You have reached the current data storage limit. Consider cleaning up or upgrading to keep things running smoothly..',
    INVALID_FIELD_IN_RECORD: 'The field "{field}" on object "{object}" is invalid. Please verify your configuration.',
    INVALID_FIELD_FOR_INSERT_UPDATE: 'The field "{field}" on object "{object}" cannot be updated. Please check field permissions.',
};