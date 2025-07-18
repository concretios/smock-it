/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This module provides utilities for saving generated Salesforce record data into
 * JSON and CSV file formats, as well as for storing the IDs of created records during
 * a direct insert (DI) operation.
 **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GenericRecord } from '../utils/types.js';
import DataGenerate from '../commands/smockit/data/generate.js';

export function saveOutputFileOfJsonAndCsv(
  jsonData: GenericRecord[],
  object: string,
  outputFormat: string[],
  templateName: string
): void {
  const dateTime = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0];
  const outputPathDir = `${process.cwd()}/data_gen/output/`;
  if (!fs.existsSync(outputPathDir)) fs.mkdirSync(outputPathDir, { recursive: true });

  if (outputFormat.includes('json') || outputFormat.includes('JSON')) {
    const jsonFilePath = `${outputPathDir}${object}_${templateName?.replace('.json', '')}_${dateTime}.json`;
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
  }

  if (outputFormat.includes('csv') || outputFormat.includes('CSV')) {
    const csvData = convertJsonToCsv(jsonData);
    const csvFilePath = `${outputPathDir}${object}_${templateName?.replace('.json', '')}_${dateTime}.csv`;
    fs.writeFileSync(csvFilePath, csvData);
  }
}

export function saveCreatedRecordIds(outputFormat: string[], templateName: string): void {
  if (outputFormat.includes('DI') || outputFormat.includes('di')) {
    const fileName = `${templateName?.replace('.json', '')}_createdRecords_${new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').split('.')[0]
      }.json`;
    saveMapToJsonFile('data_gen', fileName);
  }
}

function saveMapToJsonFile(folderName: string, fileName: string): void {
  const sanitizedFileName = fileName.replace(/[:/\\<>?|*]/g, '_');
  const baseDir = process.cwd();
  const outputDir = path.join(baseDir, folderName, 'output');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const resultObject: Record<string, string[]> = {};

  DataGenerate.createdRecordsIds.forEach((ids, objectName) => {
    resultObject[objectName] = ids;
  });
  const outputFile = path.join(outputDir, sanitizedFileName);
  fs.writeFileSync(outputFile, JSON.stringify(resultObject, null, 2), 'utf-8');
}

export function convertJsonToCsv(jsonData: GenericRecord[]): string {
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
