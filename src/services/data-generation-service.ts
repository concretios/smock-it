/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'node:path';
import * as fs from 'node:fs';

import chalk from 'chalk';
import * as main from 'sf-mock-data';
import { DataGenerateResult, tempAddFlags, GenericRecord,jsonConfig} from '../utils/types.js';
import { getProcessedFields } from '../services/data-generator.js';

import { createTable, createResultEntryTable } from '../utils/output_table.js';
import { loadAndValidateConfig, getConfigPath } from './config-manager.js';
import { SalesforceConnector } from './salesforce-connector.js';

import { processObjectConfiguration, generateFieldsAndWriteConfig, processObjectFieldsForIntitalJsonFile, enhanceDataWithSpecialFields } from './data-generator.js';
import { saveOutputFileOfJsonAndCsv, saveCreatedRecordIds } from './output-formatter.js';

export class DataGenerationService {
  private salesforceConnector: SalesforceConnector;
  private flags: tempAddFlags;

  public constructor(flags: tempAddFlags) {
    this.flags = flags;
    this.salesforceConnector = new SalesforceConnector(flags.alias ?? 'default');
  }

  private static log = (message: string): void => {
    console.log(message);
  };

  public async execute(): Promise<DataGenerateResult> {
    const conn = await this.salesforceConnector.connect();
    const baseConfig = await loadAndValidateConfig(conn, this.flags.templateName);
    const objectsToProcess = processObjectConfiguration(baseConfig, this.flags.sObjects, this.flags, DataGenerationService.log);

    // Generate fields and write generated_output.json config
    await generateFieldsAndWriteConfig(conn, objectsToProcess, baseConfig);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sObjectFieldsMap: Map<string, any[]> = new Map();
    sObjectFieldsMap =  await getProcessedFields();
    console.log('sObjectFieldsMap',sObjectFieldsMap)

    // Process records
    const configPath = path.join(process.cwd(), 'generated_output.json');
    const jsonDataForObjectNames: jsonConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as jsonConfig;
    const outputFormat: string[] = jsonDataForObjectNames.outputFormat ?? [];
    const sObjectNames: string[] = jsonDataForObjectNames.sObjects.map((sObject: { sObject: string }) => sObject.sObject);
    if (!sObjectNames) {
      throw new Error('One or more sObject names are undefined. Please check the configuration file.');
    }
    const outputPathDir = `${path.join(process.cwd())}/data_gen/output/`;

    const table = createTable();
    let failedCount = 0;
    const startTime = Date.now();

    for (const object of sObjectNames) {
      const currentSObject = jsonDataForObjectNames.sObjects.find((sObject: { sObject: string }) => sObject.sObject === object);
      if (!currentSObject) {
        throw new Error(`No configuration found for object: ${object}`);
      }
      const countofRecordsToGenerate: number | undefined = currentSObject.count;
      const fields = sObjectFieldsMap.get(object);

      if (!fields) {
        DataGenerationService.log(`No fields found for object: ${object}`);
        continue;
      }

      const processedFields = await processObjectFieldsForIntitalJsonFile(conn, fields, object);
      if (countofRecordsToGenerate === undefined) {
        throw new Error(`Count for object "${object}" is undefined.`);
      }

      const basicJsonData = await main.main(configPath, object);
      const jsonData = enhanceDataWithSpecialFields(basicJsonData, processedFields, countofRecordsToGenerate);
      saveOutputFileOfJsonAndCsv(jsonData as GenericRecord[], object, outputFormat, this.flags.templateName);

      const { failedCount: failedInsertions } = await SalesforceConnector.handleDirectInsert(conn, outputFormat, object, jsonData as GenericRecord[]);
      failedCount += failedInsertions;

      const resultEntry = createResultEntryTable(object, outputFormat, failedCount);
      table.addRow(resultEntry);
    }

    saveCreatedRecordIds(outputFormat, this.flags.templateName);

    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    DataGenerationService.log(chalk.blue.bold(`\nResults: \x1b]8;;${outputPathDir}\x1b\\${totalTime}(s)\x1b]8;;\x1b\\`));
    table.printTable();

    return { path: getConfigPath(this.flags.templateName) };
  }
  
}