
/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Connection } from '@salesforce/core';
import { validateConfigJson } from '../commands/smockit/template/validate.js';

import { getTemplateJsonPath } from '../utils/generic_function.js';
import { templateSchema, SObjectConfigFile } from '../utils/types.js';

const fieldsConfigFile = 'generated_output.json';

// Mapping of expected keys to their standardized form
const keyNormalizationMap: { [key: string]: string } = {
  namespacetoexclude: 'namespaceToExclude',
  outputformat: 'outputFormat',
  count:'count',
  fieldsToExclude: 'fieldstoexclude'
};

// Valid values for outputFormat
const validOutputFormats = ['json','di','csv'];

/*
*
 * Normalizes the keys and specific values of an object to their standardized form.
 * @param obj - The object to normalize.
 * @returns A new object with standardized keys and values.
 */
function normalizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeys);
  }
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const normalized: { [key: string]: any } = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = keyNormalizationMap[key.toLowerCase()] || key;
    if (normalizedKey === 'outputFormat' && Array.isArray(value)) {
      // Normalize outputFormat values to lowercase and ensure they are valid
      normalized[normalizedKey] = value.map((v: string) => {
        const normalizedValue = v.toLowerCase();
        if (!validOutputFormats.includes(normalizedValue)) {
          throw new Error(`Invalid outputFormat value: ${v}. Valid values are: ${validOutputFormats.join(', ')}`);
        }
        return normalizedValue;
      });
    } else {
      normalized[normalizedKey] = normalizeKeys(value);
    }
  }
  return normalized;
}

export async function loadAndValidateConfig(conn: Connection, templateName: string): Promise<templateSchema> {
  const configFilePath = getTemplateJsonPath(templateName);
  await validateConfigJson(conn, configFilePath);

  try {
    const fileContent = await fs.promises.readFile(configFilePath, 'utf-8');
    const baseConfig = JSON.parse(fileContent) as templateSchema;
    // Normalize the configuration keys and outputFormat values
    const normalizedConfig = normalizeKeys(baseConfig);
    return { ...normalizedConfig, sObjects: normalizedConfig.sObjects ?? [] };
  } catch (error: any) {
    throw new Error(`Failed to read or parse the base config file at ${configFilePath}: ${error.message}`);
  }
}

/**
 * Reads and parses the SObject configuration file.
 *
 * @returns {Promise<SObjectConfigFile>} - A promise that resolves to the parsed SObject configuration data.
 */
export async function readSObjectConfigFile(): Promise<SObjectConfigFile> {
  const configPath = path.resolve(process.cwd(), 'data_gen', 'output', fieldsConfigFile);
  const configData = await fs.promises.readFile(configPath, 'utf-8');
  return JSON.parse(configData) as SObjectConfigFile;
}
