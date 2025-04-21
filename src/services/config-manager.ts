import * as fs from 'node:fs';
import * as path from 'node:path';
import { Connection } from '@salesforce/core';
import { validateConfigJson } from '../commands/template/validate.js';
import { getTemplateJsonPath } from '../utils/generic_function.js';
import { templateSchema, SObjectConfigFile } from '../utils/types.js';

const fieldsConfigFile = 'generated_output.json';

export async function loadAndValidateConfig(conn: Connection, templateName: string): Promise<templateSchema> {
  const configFilePath = getTemplateJsonPath(templateName);
  await validateConfigJson(conn, configFilePath);

  try {
    const fileContent = await fs.promises.readFile(configFilePath, 'utf-8');
    const baseConfig = JSON.parse(fileContent) as templateSchema;
    return { ...baseConfig, sObjects: baseConfig.sObjects ?? [] };
  } catch (error) {
    throw new Error(`Failed to read or parse the base config file at ${configFilePath}`);
  }
}

export async function readSObjectConfigFile(): Promise<SObjectConfigFile> {
  const configPath = path.resolve(process.cwd(), fieldsConfigFile);
  const configData = await fs.promises.readFile(configPath, 'utf-8');
  return JSON.parse(configData) as SObjectConfigFile;
}

export function getConfigPath(templateName: string): string {
  return getTemplateJsonPath(templateName);
}

