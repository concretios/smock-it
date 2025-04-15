/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as main from 'sf-mock-data';
import { Connection } from '@salesforce/core';
import { updateOrInitializeConfig } from '../commands/template/upsert.js';
import {
  templateSchema,
  sObjectSchemaType,
  tempAddFlags,
  FieldRecord,
  fieldType,
  Fields,
  Field,
  TargetData,
  QueryResult,
  RecordId,
} from '../utils/types.js';

import {SalesforceConnector} from './salesforce-connector.js';
import {readSObjectConfigFile} from './config-manager.js';


const createdRecordsIds = new Map<string, string[]>();
// const fieldsConfigFile = 'generated_output.json';


let dependentPicklistResults: Record<
  string,
  Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>
> = {};
const independentFieldResults: Map<string, string[]> = new Map();
let depthForRecord = 0;

export function processObjectConfiguration(
  baseConfig: templateSchema,
  objectName: string | undefined,
  flags: tempAddFlags,
  log: (message: string) => void
): any[] {
  let objectsToProcess = baseConfig.sObjects;

  if (objectName) {
    const existingObjectConfig = baseConfig.sObjects.find((object: any) => {
      const objectKey = Object.keys(object)[0];
      return objectKey.toLowerCase() === objectName;
    });

    if (!existingObjectConfig) {
      throw new Error(`Object ${objectName} not found in base-config.`);
    } else {
      const objectKey = Object.keys(existingObjectConfig)[0];
      updateOrInitializeConfig(
        existingObjectConfig[objectKey],
        flags,
        ['language', 'count', 'fieldsToExclude', 'pickLeftFields', 'fieldsToConsider'],
        log
      );
      objectsToProcess = [existingObjectConfig];
    }
  }
  return objectsToProcess;
}

export async function generateFieldsAndWriteConfig(conn: Connection,objectsToProcess: any[],baseConfig: templateSchema): Promise<void> {
    const outputData: any[] = [];

  for (const objectConfig of objectsToProcess) {
    const objectName = Object.keys(objectConfig as Record<string, any>)[0];
    const configForObject: sObjectSchemaType = (objectConfig as Record<string, any>)[objectName] as sObjectSchemaType;

    const namespacePrefixToExclude = baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';
    
    const allFields = await conn.query(
      `SELECT QualifiedApiName, IsDependentPicklist, Label, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable
       FROM EntityParticle
       WHERE EntityDefinition.QualifiedApiName = '${objectName}'
       AND IsCreatable = true
       AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
    );

    const requiredFields = getRequiredFields(allFields.records as FieldRecord[]);
    const requiredFieldNames = requiredFields.map((field) => field.QualifiedApiName.toLowerCase());

    let fieldsToExclude = configForObject['fieldsToExclude']?.map((field: string) => field.toLowerCase()) ?? [];
    const fieldsToIgnore = ['jigsaw', 'cleanstatus'];
    fieldsToExclude = fieldsToExclude.filter(
      (field: string) => !fieldsToIgnore.includes(field) && !requiredFieldNames.includes(field.toLowerCase())
    );
    fieldsToExclude = [...fieldsToIgnore, ...fieldsToExclude];

    const getPickLeftFields = configForObject.pickLeftFields;
    const considerMap = processFieldsToConsider(configForObject);
    const fieldsToConsider = Object.keys(considerMap);

    const fieldsToPass = filterFieldsByPickLeftConfig(getPickLeftFields,configForObject,fieldsToConsider,fieldsToExclude,fieldsToIgnore,allFields);

    const fieldsObject = await processFieldsWithFieldsValues(conn, fieldsToPass, objectName, considerMap);

    const configToWrite: any = {
      sObject: objectName,
      language: configForObject.language ?? baseConfig.language,
      count: configForObject.count ?? baseConfig.count,
    };

    if (Object.keys(fieldsObject).length > 0) {
      configToWrite.fields = fieldsObject;
    }

    outputData.push(configToWrite);
  }

  const outputFile = path.resolve('./generated_output.json');
  fs.writeFileSync(
    outputFile,
    JSON.stringify({ outputFormat: baseConfig.outputFormat, sObjects: outputData }, null, 2),
    'utf8'
  );
}

function processFieldsToConsider(configForObject: sObjectSchemaType): Record<string, string[]> {
  const considerMap: Record<string, any> = {};
  const fieldsToConsiderKeys = Object.keys(configForObject?.['fieldsToConsider'] ?? {});

  for (const key of fieldsToConsiderKeys) {
    if (configForObject['fieldsToConsider']) {
      if (key.startsWith('dp-')) {
        considerMap[key.substring(3)] = configForObject['fieldsToConsider'][key];
      } else {
        considerMap[key] = configForObject['fieldsToConsider'][key];
      }
    }
  }

  return considerMap;
}

function getFieldType(item: Record<string, any>, isParentObject: boolean = false): string {
  const itemType = isParentObject ? item.DataType : item.type;

  if (itemType === 'reference') return 'reference';
  if (itemType === 'string' || itemType === 'textarea') return 'text';
  return itemType;
}

function getDefaultFieldsToPass(configForObject: sObjectSchemaType, allFields: any, fieldsToIgnore: string[]): FieldRecord[] {
  let fieldsToPass: FieldRecord[] = [];

  if (
    configForObject['fieldsToConsider'] === undefined &&
    configForObject['fieldsToExclude'] === undefined &&
    configForObject['pickLeftFields'] === undefined
  ) {
    fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
      (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
    );
  }
  return fieldsToPass;
}

function filterFieldsByPickLeftConfig(
  getPickLeftFields: boolean | undefined,
  configForObject: sObjectSchemaType,
  fieldsToConsider: string[],
  fieldsToExclude: string[],
  fieldsToIgnore: string[],
  allFields: any
): FieldRecord[] {
  let fieldsToPass: FieldRecord[] = getDefaultFieldsToPass(configForObject, allFields, fieldsToIgnore);

  if (getPickLeftFields === true && fieldsToIgnore.length > 0) {
    if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );
    } else if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
      );
    }
  } else if (getPickLeftFields === false && fieldsToIgnore.length > 0) {
    if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide a field or set pick-left field to true');
    } else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
      throw new Error('Please provide fieldsToConsider or set pickLeftFields to true');
    } else if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
      );

      const requiredFields = getRequiredFields(fieldsToPass);
      const consideredFields = fieldsToPass.filter((record) =>
        fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
      );

      fieldsToPass = mergeFieldsToPass([...consideredFields, ...requiredFields]);
    } else if (fieldsToConsider.length > 0 && fieldsToIgnore.length > 0 && fieldsToExclude.length === 0) {
      fieldsToPass = ((allFields as { records: FieldRecord[] }).records).filter(
        (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
      );

      const requiredFields = getRequiredFields(fieldsToPass);
      const consideredFields = fieldsToPass.filter((record) =>
        fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
      );

      fieldsToPass = mergeFieldsToPass([...consideredFields, ...requiredFields]);
    }
  }

  return fieldsToPass;
}

async function processFieldsWithFieldsValues(
  conn: Connection,
  fieldsToPass: FieldRecord[],
  objectName: string,
  considerMap: Record<string, string[]>
): Promise<Record<string, Fields>> {
  const fieldsObject: Record<string, Fields> = {};
  dependentPicklistResults = {};

  for (const inputObject of fieldsToPass) {
    let fieldConfig: Fields = { type: inputObject.DataType, label: inputObject.Label };

    switch (inputObject.DataType) {
      case 'textarea':
      case 'string':
        if (
          inputObject.QualifiedApiName.match(
            /^(Billing|Shipping|Other|Mailing)(Street|City|State|PostalCode|Country)$/i
          )
        ) {
          fieldConfig = { type: 'address', label: inputObject.Label };
        } else {
          fieldConfig = {
            type: 'text',
            values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
              ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
              : [],
            label: inputObject.Label,
          };
        }
        break;

      case 'reference':
        fieldConfig = {
          type: 'reference',
          referenceTo: inputObject.ReferenceTo?.referenceTo ? (inputObject.ReferenceTo.referenceTo[0] as string) : undefined,
          values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
            ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
            : [],
          relationshipType: inputObject.RelationshipName ? 'master-detail' : 'lookup',
          label: inputObject.Label,
        };
        break;

      case 'picklist':
        if (inputObject.IsDependentPicklist) {
          await depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
        } else {
          const picklistValues = await getPicklistValues(conn, objectName, inputObject.QualifiedApiName, considerMap);
          fieldConfig = {
            type: 'picklist',
            values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()]
              ? considerMap[inputObject.QualifiedApiName.toLowerCase()]
              : picklistValues,
            label: inputObject.Label,
          };
        }
        break;

      default:
        if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
          fieldConfig = {
            type: inputObject.DataType,
            values: considerMap[inputObject.QualifiedApiName.toLowerCase()],
            label: inputObject.Label,
          };
        } else {
          fieldConfig = { type: inputObject.DataType, label: inputObject.Label };
        }
        break;
    }

    if (!inputObject.IsDependentPicklist) {
      fieldsObject[inputObject.QualifiedApiName] = fieldConfig;
    }
  }

  if (Object.keys(dependentPicklistResults).length > 0) {
    const topControllingField = Object.keys(dependentPicklistResults)[0];
    const dependentFieldsData = convertJSON(dependentPicklistResults, topControllingField) as Record<string, Fields>;
    Object.assign(fieldsObject, dependentFieldsData);
    dependentPicklistResults = {};
  }

  return fieldsObject;
}

async function getPicklistValues(
  conn: Connection,
  object: string,
  field: string,
  considerMap: Record<string, any>
): Promise<string[]> {
  const result = await conn.describe(object);
  const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
  const pickListValues: string[] = fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value as string) ?? [];

  Object.keys(considerMap).forEach((key) => {
    if (
      Object.keys(considerMap).includes(key.toLowerCase()) &&
      considerMap[key.toLowerCase()].length > 0 &&
      key.toLowerCase() === field.toLowerCase()
    ) {
      const fieldConsiderationValues: string[] = considerMap[field.toLowerCase()] as string[];
      const pickListSet = new Set(pickListValues);
      const missingValues = fieldConsiderationValues?.filter((value: string) => !pickListSet.has(value));

      if (missingValues && missingValues.length > 0) {
        throw new Error(
          `Value(s) '${missingValues.join(', ')}' not found in the picklist value set for '${field}' field.`
        );
      }
    }
  });

  return pickListValues;
}

async function depPicklist(
  conn: Connection,
  objectName: string,
  dependentFieldApiName: string,
  considerMap: Record<string, string[]>
): Promise<void> {
  const schema = await conn.sobject(objectName).describe();
  const dependentFieldResult = schema.fields.find((field) => field.name === dependentFieldApiName);
  if (!dependentFieldResult) {
    throw new Error(`Dependent field ${dependentFieldApiName} not found.`);
  }

  const controllingFieldName = getControllingFieldName(dependentFieldResult);
  if (!controllingFieldName) {
    independentFieldResults.set(
      dependentFieldApiName,
      dependentFieldResult.picklistValues?.map((value: { value: string }) => value.value) ?? []
    );
    return;
  }

  const controllerFieldResult = schema.fields.find((field) => field.name === controllingFieldName);
  const controllerValues = controllerFieldResult?.picklistValues ?? [];
  const dependentPicklistValues = new Map<string, string[]>();

  dependentFieldResult.picklistValues?.forEach((entry) => {
    if (entry && typeof entry === 'object' && 'validFor' in entry) {
      const base64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const validForControllerValues = [];

      const base64chars: string[] = (entry.validFor as string).split('');
      for (let i = 0; i < controllerValues.length; i++) {
        const bitIndex = Math.floor(i / 6);
        const bitShift = 5 - (i % 6);
        if ((base64map.indexOf(base64chars[bitIndex]) & (1 << bitShift)) !== 0) {
          validForControllerValues.push(controllerValues[i].label);
        }
      }
      validForControllerValues.forEach((controllerValue) => {
        if (typeof controllerValue === 'string' && !dependentPicklistValues.has(controllerValue)) {
          dependentPicklistValues.set(controllerValue, []);
        }
        dependentPicklistValues.get(controllerValue as string)?.push(entry.value as string);
      });
    }
  });

  dependentPicklistValues.forEach((childValues, parentValue) => {
    if (!dependentPicklistResults[controllingFieldName]) {
      dependentPicklistResults[controllingFieldName] = [];
    }
    dependentPicklistResults[controllingFieldName].push({
      parentFieldValue: parentValue,
      childFieldName: dependentFieldApiName,
      childValues,
    });
  });

  Object.keys(dependentPicklistResults).forEach((key) => {
    if (Object.keys(considerMap).includes(key.toLowerCase()) && considerMap[key.toLowerCase()].length > 0) {
      const pickListFieldValues = dependentPicklistResults[key];
      if (!pickListFieldValues.some((item) => item.parentFieldValue === considerMap[key.toLowerCase()][0])) {
        throw new Error(
          `Parent value '${considerMap[key.toLowerCase()][0]}' not found in the picklist values for '${key}'`
        );
      }
      const filteredArray = pickListFieldValues.filter(
        (item) => item.parentFieldValue === considerMap[key.toLowerCase()][0]
      );

      if (filteredArray.length > 0) {
        const childValues = considerMap[filteredArray[0].childFieldName.toLowerCase()];
        if (Array.isArray(childValues)) {
          filteredArray[0].childValues = childValues;
        }
        dependentPicklistResults[key] = filteredArray;
      }
    }
  });
}

function getControllingFieldName(dependentField: any): string | null {
  const controllerName: string | undefined = dependentField.controllerName as string | undefined;
  return controllerName ?? null;
}

function convertJSON(
  input: Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>,
  controllingFieldName: string
): any {
  const output: any = {};

  if (input[controllingFieldName]) {
    const entries = input[controllingFieldName];
    const childFieldName = entries[0]?.childFieldName;

    output[controllingFieldName] = {
      type: 'dependent-picklist',
      values: [],
      'child-dependent-field': childFieldName,
      [childFieldName]: {},
    };

    entries.forEach((entry) => {
      (output[controllingFieldName]['values'] as string[]).push(entry.parentFieldValue);
      output[controllingFieldName][childFieldName][entry.parentFieldValue] = {
        values: entry.childValues,
      };

      const nestedOutput = buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<string, Fields>;
      if (nestedOutput) {
        Object.assign(output[controllingFieldName][childFieldName][entry.parentFieldValue], nestedOutput);
      }
    });
  }

  return output;
}

function buildNestedJSON(
  input: Record<string, Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>>,
  parentFieldName: string,
  parentValues: string[]
): any {
  if (!input[parentFieldName]) {
    return null;
  }

  const entries = input[parentFieldName];
  const childFieldName = entries[0]?.childFieldName;

  const output: any = {
    'child-dependent-field': childFieldName,
    [childFieldName]: {},
  };

  parentValues.forEach((parentValue) => {
    const matchingEntries = entries.filter((entry) => entry.parentFieldValue === parentValue);
    matchingEntries.forEach((entry) => {
      output[childFieldName][parentValue] = {
        values: entry.childValues,
      };

      const nestedOutput = buildNestedJSON(input, entry.childFieldName, entry.childValues) as Record<string, Fields> | null;
      if (nestedOutput) {
        Object.assign(output[childFieldName][parentValue], nestedOutput);
      }
    });
  });

  return output;
}

function getRequiredFields(fields: FieldRecord[]): FieldRecord[] {
  return fields.filter((record) => record.IsNillable === false);
}

function mergeFieldsToPass(fields: FieldRecord[]): FieldRecord[] {
  return [...new Map(fields.map((field) => [field.QualifiedApiName, field])).values()];
}

export async function processObjectFieldsForIntitalJsonFile(conn: Connection, config: any[], object: string): Promise<Array<Partial<TargetData>>> {
  const processedFields =   await handleFieldProcessingForIntitalJsonFile(conn, object, config);
  return processedFields
}

 async function handleFieldProcessingForIntitalJsonFile(
  conn: Connection,
  object: string,
  file: any[]
): Promise<Array<Partial<TargetData>>> {
  return processFieldsForInitialJsonFile(file, conn, object);
}

async function handleFieldProcessingForParentObjects(
  conn: Connection,
  query: string,
  object: string
): Promise<Array<Partial<TargetData>>> {
  const result = await conn.query(query);
  const nameFieldResult = await conn.query(
    `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true AND IsNillable = true AND IsNameField = true`
  );
  const combinedResults = [...result.records, ...nameFieldResult.records];
  return processFieldsForParentObjects(combinedResults, conn, object);
}

async function processFields(
  records: Array<Record<string, any>>,
  conn: Connection,
  object: string,
  isParentObject: boolean = false
): Promise<Array<Partial<TargetData>>> {
  const processedFields: Array<Partial<TargetData>> = [];
  for (const item of records) {
    const fieldName = isParentObject ? item.QualifiedApiName : item.name;
    const dataType = isParentObject ? item.DataType : item.type;
    const isReference = dataType === 'reference';
    const isPicklist = dataType === 'picklist' || dataType === 'multipicklist';

    const excludeFieldsSet = new Set<string>(); // Assuming this is managed elsewhere if needed
    if (excludeFieldsSet.has(fieldName)) continue;

   const details: Partial<TargetData> = { name: fieldName };
  
        if (isReference && !['OwnerId', 'CreatedById', 'ParentId'].includes(fieldName)) {
          details.type = 'Custom List';
          const isMasterDetail = !isParentObject ? item.relationshipType !== 'lookup' : !item.IsNillable;
  
          if (item.values?.length) {
            details.values = item.values;
          } else {
            details.values = isMasterDetail
              ? await fetchRelatedMasterRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo)
              : await fetchRelatedRecordIds(conn, item.referenceTo || item.ReferenceTo?.referenceTo);
          }
  
          if (isMasterDetail) {
            depthForRecord++;
          }
          processedFields.push(details);
        } else if (isPicklist || item.values?.length > 0) {
          details.type = 'Custom List'; // random value pick
          details.values = await getPicklistValuesWithDependentValues(conn, object, fieldName, item);
          processedFields.push(details);
        } else {
           // details value contains item .value contain
          details.type = getFieldType(item, isParentObject);
          if (details.type) processedFields.push(details);
        }
      }
      return processedFields;
    }

async function processFieldsForInitialJsonFile(
  records: Array<Record<string, any>>,
  conn: Connection,
  object: string
): Promise<Array<Partial<TargetData>>> {
  return  processFields(records, conn, object);
}

async function processFieldsForParentObjects(
  records: Array<Record<string, any>>,
  conn: Connection,
  object: string
): Promise<Array<Partial<TargetData>>> {
  return processFields(records, conn, object, true);
}

async function fetchRelatedRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
  if (createdRecordsIds.has(referenceTo + '')) {
    return Array.from(createdRecordsIds.get(referenceTo + '') ?? []);
  }

  const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);
  return relatedRecords.records.map((record: RecordId) => record.Id);
}

async function fetchRelatedMasterRecordIds(conn: Connection, referenceTo: string): Promise<string[]> {
  const existingIds = createdRecordsIds.get(referenceTo) ?? [];
  if (existingIds.length > 0) {
    return Array.from(existingIds);
  }

  const relatedRecords: QueryResult = await conn.query(`SELECT Id FROM ${referenceTo} LIMIT 100`);

  if (relatedRecords.records.length === 0) {
    if (depthForRecord === 3) {
      throw new Error(`Max Depth Reached! Please create ${referenceTo} records first.`);
    }

    const processParentFields = await processObjectFieldsForParentObjects(conn, referenceTo, true);

    const fieldMap = processParentFields.reduce<Record<string, any>>((acc, field) => {
      if (field.name) {
        return {
          ...acc,
          [field.name]: {
            type: field.type,
            values: field.values ?? [],
            label: field.label ?? field.name,
          },
        };
      }
      return acc;
    }, {});

    const initialJsonData = await main.getFieldsData(fieldMap, 1);

    if (!initialJsonData || (Array.isArray(initialJsonData) && initialJsonData.length === 0)) {
      throw new Error(`Failed to generate valid data for ${referenceTo}`);
    }
    const enhancedJsonData = getDataForParentFields(initialJsonData, fieldMap);

    const insertResult = await SalesforceConnector.insertRecords(conn, referenceTo, enhancedJsonData);

    SalesforceConnector.updateCreatedRecordIds(referenceTo, insertResult);


    const validIds = insertResult.filter((result) => result.success).map((result) => result.id);
    if (validIds.length === 0) {
      throw new Error(`Failed to insert records for ${referenceTo}`);
    }

    return validIds;
  }

  return relatedRecords.records.map((record: RecordId) => record.Id);
}

async function processObjectFieldsForParentObjects(
  conn: Connection,
  object: string,
  onlyRequiredFields: boolean
): Promise<Array<Partial<TargetData>>> {
  const query = buildFieldQuery(object, onlyRequiredFields);
  return handleFieldProcessingForParentObjects(conn, query, object);
}

function buildFieldQuery(object: string, onlyRequiredFields: boolean): string {
  let query = `SELECT QualifiedApiName, DataType, IsNillable, ReferenceTo FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${object}' AND IsCreatable = true`;
  if (onlyRequiredFields) query += ' AND IsNillable = false';
  return query;
}

async function getPicklistValuesWithDependentValues(
  conn: Connection,
  object: string,
  field: string,
  item: Record<string, any>
): Promise<string[]> {
  if (item.values != null && item.values.length > 0) {
    return item.values as string[];
  } else if (item.value != null && item.value.length > 0) {
    return [item.value] as string[];
  }
  const result = await conn.describe(object);
  const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
  const picklistValues: string[] = fieldDetails?.picklistValues?.map((pv: { value: string }) => pv.value) ?? [];
  return picklistValues;
}

export async function getProcessedFields(): Promise<Map<string, any[]>> {
  const config = await readSObjectConfigFile();
  const sObjectFieldsMap: Map<string, any[]> = new Map();
  config.sObjects.forEach((sObject) => {
    if (sObject.fields) {
      
      const fieldsArray: any[] = []; // Temporary array to accumulate fields for each SObject
      for (const [fieldName, fieldDetails] of Object.entries(sObject.fields)) {
        if (fieldDetails.type === 'dependent-picklist') {
          processDependentPicklists(fieldName, fieldDetails, fieldsArray);
          continue;
        }
        let fieldObject: any = {
          name: fieldName,
          type: mapFieldType(fieldDetails.type),
        };

        if (fieldDetails.values?.length && fieldDetails.values?.length > 0) {
              fieldObject = {
                name: fieldName,
                values: fieldDetails.values,
              };
        } 

        if (fieldDetails.type === 'picklist' || fieldDetails.type === 'reference') {
          fieldObject.values = fieldDetails.values ?? [];
          fieldObject.referenceTo = fieldDetails.referenceTo;
          fieldObject.relationshipType = fieldDetails.relationshipType;
        }

        fieldsArray.push(fieldObject);
      }

      if (fieldsArray.length > 0) {
        sObjectFieldsMap.set(sObject.sObject, fieldsArray);
      }
    }
  });
  return sObjectFieldsMap;
}


function mapFieldType(fieldTypes: fieldType): string {
  const typeMapping: { [key in fieldType]: string } = {
    picklist: 'picklist',
    reference: 'reference',
    'dependent-picklist': 'picklist'
  };

  return typeMapping[fieldTypes] || 'Unknown';
}

function getDataForParentFields(jsonData: any[],fieldMap: Record<string, { type: string; values: any[]; label: string }>): any[] {
  if (!jsonData || jsonData.length === 0) {
    console.error('No JSON data provided to enhance');
    return jsonData;
  }

  let enhancedData = jsonData.map((record) => ({ ...record }));

  for (const [fieldName, fieldDetails] of Object.entries(fieldMap)) {
    const { type, values } = fieldDetails;

    if (values.length === 0 || enhancedData.every((record) => fieldName in record)) {
      continue;
    }

    if (type === 'Custom List' || type === 'reference') {
      enhancedData = enhancedData.map((record) => {
        if (!(fieldName in record)) {
          return { ...record, [fieldName]: getRandomElement(values) };
        }
        return record;
      });
    }
  }

  return enhancedData;
}

export function enhanceDataWithSpecialFields(basicData: any[], processedFields: Array<Partial<TargetData>>, count: number): any[] {
  const enhancedData = basicData.map((item) => ({ ...item }));


  const getRandomElements = <T>(array: T[]): T | undefined => {
    const element = array[Math.floor(Math.random() * array.length)];
    return Array.isArray(element) ? element[0] : element;
  };

  for (const field of processedFields) {
    if (field.type === 'Custom List' && field.values) {
      const values = Array.from({ length: count }, () => getRandomElements(field.values ?? []));
      values.forEach((value, index) => {
        if (field.name) {
          enhancedData[index][field.name] = value;
        }
      });
    }
  }
  return enhancedData;
}

function getRandomElement<T>(array: T[]): T | undefined {
  return array[Math.floor(Math.random() * array.length)];
}

function processDependentPicklists(fieldName: string, fieldDetails: any, fieldsArray: any[]): void {
  const parentField = fieldName;
  const childField = fieldDetails['child-dependent-field'] as string;

  const fieldObjectDepParent: any = {
    name: parentField,
    type: mapFieldType(fieldDetails.type as fieldType),
  };

  const fieldObjectChildParent: any = {
    name: childField,
    type: 'picklist',
  };

  const parentToChildFieldMap: Map<string, { values: string[]; childDependentField?: string }> = new Map();

  for (const [parentValue, childValuesObj] of Object.entries(
    fieldDetails[childField] as Record<string, { values: string[]; 'child-dependent-field'?: string }>
  )) {
    if (childValuesObj?.values) {
      parentToChildFieldMap.set(parentValue, {
        values: childValuesObj.values,
        childDependentField: childValuesObj['child-dependent-field'],
      });
    }
  }

  // Check if there are parent values
  if (parentToChildFieldMap.size > 0) {
    // Get a random parent value
    const parentValues = Array.from(parentToChildFieldMap.keys());
    const randomParentValue = getRandomElement(parentValues);

    if (randomParentValue) {
      const childDetails = parentToChildFieldMap.get(randomParentValue);

      if (childDetails) {
        const childValues = childDetails.values;
        const childDependentField = childDetails.childDependentField;
        const randomChildValue = getRandomElement(childValues);

        if (randomChildValue) {
          fieldObjectDepParent.value = randomParentValue;
          fieldObjectChildParent.value = [randomChildValue];

          // Add field objects to fieldsArray
          fieldsArray.push(fieldObjectDepParent);
          fieldsArray.push(fieldObjectChildParent);

          // Check for further dependencies on the selected child value
          if (childDependentField) {
            const childFieldDetails = fieldDetails[childField][randomParentValue] as Record<string, Field>;
            if (childFieldDetails?.[childDependentField]) {
              const grandChildFieldDetails = (childFieldDetails[childDependentField] as Record<string, any>)[randomChildValue] as Record<string, Field>;

              // Updated: handle nested values inside the `values` key
              if (grandChildFieldDetails?.['values']) {
                const grandChildValues = grandChildFieldDetails['values'];
                if (grandChildValues) {
                  const grandChildFieldObject: any = {
                    name: childDependentField,
                    type: 'picklist',
                    value: Array.isArray(grandChildValues) ? getRandomElement(grandChildValues) as string : undefined,
                  };
                  fieldsArray.push(grandChildFieldObject);
                }
              }
            }
          }
        }
      }
    }
  }
}