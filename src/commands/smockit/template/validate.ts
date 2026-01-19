/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-useless-catch */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable jsdoc/tag-lines */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sf-plugin/flag-case */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { SfCommand, Flags, Spinner } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import chalk from 'chalk';
import {
  TemplateValidateResult,
  sObjectSchemaType,
  templateSchema,
  sObjectMetaType,
  Types,
} from '../../../utils/types.js';

import { connectToSalesforceOrg } from '../../../utils/generic_function.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'template.validate');
dotenv.config();

/**
 * Validates data types of sObject-level properties.
 * Ensures correct types for keys such as count (number), fieldsToExclude (array),
 * fieldsToConsider (object), pickLeftFields (boolean), and relatedSObjects (array).
 * Adds type mismatch errors to the provided errors array.
 *
 * @param {string} objName - Name of the current sObject being validated.
 * @param {any} sObjectData - Data of the sObject from the template JSON.
 * @param {string[]} errors - Array to collect validation error messages.
 * @returns {void}
 */
function validateValueTypes(objName: string, sObjectData: any, errors: string[]): void {
  if (sObjectData.count !== undefined && typeof sObjectData.count !== 'number') {
    errors.push(
      chalk.red(`Invalid type for 'count' in ${objName}: expected a number but got ${typeof sObjectData.count}.`)
    );
  }

  if (sObjectData.fieldsToExclude !== undefined && !Array.isArray(sObjectData.fieldsToExclude)) {
    errors.push(
      chalk.red(`Invalid type for 'fieldsToExclude' in ${objName}: expected an array but got ${typeof sObjectData.fieldsToExclude}.`)
    );
  }

  if (
    sObjectData.fieldsToConsider !== undefined &&
    (typeof sObjectData.fieldsToConsider !== 'object' || Array.isArray(sObjectData.fieldsToConsider) || sObjectData.fieldsToConsider === null)
  ) {
    errors.push(
      chalk.red(`Invalid type for 'fieldsToConsider' in ${objName}: expected a non-null object but got ${Array.isArray(sObjectData.fieldsToConsider) ? 'array' : typeof sObjectData.fieldsToConsider}.`)
    );
  }


  if (sObjectData.pickLeftFields !== undefined && typeof sObjectData.pickLeftFields !== 'boolean') {
    errors.push(
      chalk.red(`Invalid type for 'pickLeftFields' in ${objName}: expected a boolean but got ${typeof sObjectData.pickLeftFields}.`)
    );
  }

  if (sObjectData.relatedSObjects !== undefined && !Array.isArray(sObjectData.relatedSObjects)) {
    errors.push(
      chalk.red(`Invalid type for 'relatedSObjects' in ${objName}: expected an array but got ${typeof sObjectData.relatedSObjects}.`)
    );
  }
}

/**
 * Ensures valid key names and correct value types for each nested child.
 * Normalizes key casing and applies the same validation rules as parent SObjects.
 *
 * @param {any[]} relatedObjects - Array of related SObjects under the parent.
 * @param {string[]} errors - Collector for error messages across all levels.
 * @param {string} parentName - Name of the parent SObject.
 * @param {Record<string, string>} sObjectLevelAllowedKeys - Canonical allowed keys for SObject validation.
 * @returns {void}
 */
function validateRelatedSObjects(
  relatedObjects: any[],
  errors: string[],
  parentName: string,
  sObjectLevelAllowedKeys: Record<string, string>
): void {
  relatedObjects.forEach((relatedEntry, idx) => {
    if (typeof relatedEntry !== 'object' || Object.keys(relatedEntry).length !== 1) {
      errors.push(
        chalk.red(`Invalid entry in relatedSObjects of ${parentName} at index ${idx}. Each must have a single key.`)
      );
      return;
    }

    const relatedName = Object.keys(relatedEntry)[0];
    const relatedData = relatedEntry[relatedName];
    const normalizedChildData: Record<string, any> = {};

    if (typeof relatedData !== 'object' || relatedData === null) {
      errors.push(chalk.red(`Invalid structure for related SObject '${relatedName}' under parent '${parentName}': expected an object.`));
      return;
    }

    for (const key in relatedData) {
      const lowerKey = key.toLowerCase();
      if (sObjectLevelAllowedKeys[lowerKey]) {
        normalizedChildData[sObjectLevelAllowedKeys[lowerKey]] = relatedData[key];
      } else {
        errors.push(
          chalk.red(`Invalid key '${key}' found under related SObject '${relatedName}' of parent '${parentName}'. `) +
          chalk.white('Allowed keys are: ') +
          chalk.green(Object.values(sObjectLevelAllowedKeys).join(', '))
        );
      }

    }
    // Validate data types for child related SObject
    validateValueTypes(`${parentName} -> ${relatedName}`, normalizedChildData, errors);


    // Recursively go deeper if nested relatedSObjects exist
    if (relatedData.relatedSObjects && Array.isArray(relatedData.relatedSObjects)) {
      validateRelatedSObjects(relatedData.relatedSObjects, errors, relatedName, sObjectLevelAllowedKeys);
    }
  });
}


/**
 * Normalizes and validates the structure of the template JSON file.
 * - Converts key names to camelCase for consistency.
 * - Checks for unknown or invalid keys at both top and SObject levels.
 * - Validates types for key values (count, outputFormat, namespaceToExclude, etc.).
 * - Invokes recursive validation for relatedSObjects.
 *
 * @param {any} rawConfig - The raw JSON object parsed from the template file.
 * @returns {templateSchema} The normalized and validated configuration object.
 * @throws {Error} When invalid keys, types, or structures are detected in the template.
 */
function normalizeAndValidateTemplate(rawConfig: any): templateSchema {
  // Define allowed keys at each level and their canonical camelCase form.
  const topLevelAllowedKeys: { [key: string]: string } = {
    namespacetoexclude: 'namespaceToExclude',
    outputformat: 'outputFormat',
    count: 'count',
    sobjects: 'sObjects',
  };

  const sObjectLevelAllowedKeys: { [key: string]: string } = {
    count: 'count',
    fieldstoconsider: 'fieldsToConsider',
    fieldstoexclude: 'fieldsToExclude',
    pickleftfields: 'pickLeftFields',
    relatedsobjects: 'relatedSObjects',
  };

  const normalizedConfig: { [key: string]: any } = {};
  const errors: string[] = [];
  const invalidTopLevelKeys: string[] = [];

  if (typeof rawConfig !== 'object' || rawConfig === null) {
    errors.push(chalk.red('Error: Template file content must be a valid JSON object.'));
  } else {
    for (const key in rawConfig) {
      const lowerKey = key.toLowerCase();
      if (topLevelAllowedKeys[lowerKey]) {
        normalizedConfig[topLevelAllowedKeys[lowerKey]] = rawConfig[key];
      } else {
        invalidTopLevelKeys.push(key);
      }
    }

    if (invalidTopLevelKeys.length > 0) {
      errors.push(
        chalk.red('The template contains invalid keys: ') +
        chalk.yellow(`[${invalidTopLevelKeys.map((key) => `'${key}'`).join(', ')}]`) +
        chalk.white('. ') +
        chalk.white('Allowed keys are: ') +
        chalk.green('namespaceToExclude, outputFormat, count, sObjects')
      );
    }

    if (normalizedConfig.outputFormat !== undefined && !Array.isArray(normalizedConfig.outputFormat)) {
      errors.push(chalk.red('Invalid type for \'outputFormat\': expected array.'));
    }
    if (normalizedConfig.namespaceToExclude !== undefined && !Array.isArray(normalizedConfig.namespaceToExclude)) {
      errors.push(chalk.red('Invalid type for \'namespaceToExclude\': expected array.'));
    }

    if (normalizedConfig.count !== undefined && typeof normalizedConfig.count !== 'number') {
      errors.push(chalk.red(`Invalid type for 'count': expected number but got ${typeof normalizedConfig.count}.`));
    }


    const sObjects = normalizedConfig.sObjects;
    if (sObjects === undefined) {
      errors.push(chalk.red("Error: The template must contain an 'sObjects' key."));
    } else if (!Array.isArray(sObjects)) {
      errors.push(chalk.red("Error: The value for 'sObjects' must be an array."));
    } else {
      const invalidKeysPerSObject: Record<string, string[]> = {};

      normalizedConfig.sObjects = sObjects.map((sObjectEntry: any, index: number) => {
        if (typeof sObjectEntry !== 'object' || sObjectEntry === null || Object.keys(sObjectEntry).length !== 1) {
          errors.push(
            chalk.red(`Error: Invalid entry in 'sObjects' array at index ${index}. Each entry must have a single key.`)
          );
          return sObjectEntry;
        }

        const sObjectName = Object.keys(sObjectEntry)[0];
        const sObjectDataRaw = sObjectEntry[sObjectName];

        if (typeof sObjectDataRaw !== 'object' || sObjectDataRaw === null) {
          errors.push(chalk.red(`Error: The value for SObject '${sObjectName}' must be a JSON object.`));
          return sObjectEntry;
        }

        const normalizedSObjectData: { [key: string]: any } = {};

        for (const key in sObjectDataRaw) {
          const lowerKey = key.toLowerCase();
          if (sObjectLevelAllowedKeys[lowerKey]) {
            const canonicalKey = sObjectLevelAllowedKeys[lowerKey];
            normalizedSObjectData[canonicalKey] = sObjectDataRaw[key];
          } else {
            if (!invalidKeysPerSObject[sObjectName]) {
              invalidKeysPerSObject[sObjectName] = [];
            }
            invalidKeysPerSObject[sObjectName].push(key);
          }
        }
        
        // Value type validation for top-level SObject keys
        validateValueTypes(sObjectName, normalizedSObjectData, errors);

        // Recursively validate relatedSObjects keys
        if (normalizedSObjectData.relatedSObjects && Array.isArray(normalizedSObjectData.relatedSObjects)) {
          validateRelatedSObjects(normalizedSObjectData.relatedSObjects, errors, sObjectName, sObjectLevelAllowedKeys);
        }

        return { [sObjectName]: normalizedSObjectData };
      });

      for (const [sObjectName, invalidKeys] of Object.entries(invalidKeysPerSObject)) {
        errors.push(
          chalk.red('Error: Invalid keys ') +
          chalk.yellow(`['${invalidKeys.join("', '")}']`) +
          chalk.red(' for SObject ') + chalk.yellow(`${sObjectName}. `) +
          chalk.white('Valid keys are: ') + chalk.green(Object.values(sObjectLevelAllowedKeys).join(', '))
        );
      }
    }
  }



  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return normalizedConfig as templateSchema;
}

// Simple in-memory describe cache to avoid repeated network calls
const describeCache: Record<string, Record<string, unknown> | null> = {};

/**
 * Performs a safe Salesforce describe() call with caching support.
 * Fetches and returns object metadata while preventing repeated network calls
 * for the same SObject name during the validation run.
 *
 * @param {Connection} connection - Active Salesforce connection instance.
 * @param {string} sObjectName - Name of the SObject to describe.
 * @returns {Promise<Record<string, unknown> | null>} The described metadata or null if the call fails.
 */
async function describeSObjectSafe(
  connection: Connection,
  sObjectName: string
): Promise<Record<string, unknown> | null> {
  const key = String(sObjectName).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(describeCache, key)) {
    return describeCache[key];
  }

  try {
    const described = (await connection.describe(sObjectName)) as Record<string, unknown>;
    describeCache[key] = described;
    return described;
  } catch (err) {
    describeCache[key] = null;
    return null;
  }
}

/**
 * Verifies whether a valid parent-child relationship exists between two SObjects.
 * Checks both sides:
 * - Parent.describe().childRelationships
 * - Child.describe().fields[*].referenceTo
 *
 * Returns detailed metadata about matching relationships and references.
 *
 * @param {Connection} connection - Active Salesforce connection.
 * @param {string} parentName - Parent SObject API name.
 * @param {string} childName - Child SObject API name.
 * @returns {Promise<{
 * valid: boolean;
 * via: string[];
 * details: {
 * parentChildRelationships: Array<Record<string, unknown>>;
 * childReferenceFields: Array<{ field: string; referenceTo?: string[] }>;
 * };
 * }>} Result indicating relationship validity and detailed context.
 */

async function verifyParentChildRelationship(
  connection: Connection,
  parentName: string,
  childName: string
): Promise<{
  valid: boolean;
  via: string[];
  details: {
    parentChildRelationships: Array<Record<string, unknown>>;
    childReferenceFields: Array<{ field: string; referenceTo?: string[] }>;
  };
}> {
  const via: string[] = [];

  const details = {
    parentChildRelationships: [] as Array<Record<string, unknown>>,
    childReferenceFields: [] as Array<{ field: string; referenceTo?: string[] }>,
  };

  const parentDescribe = await describeSObjectSafe(connection, parentName);
  const childDescribe = await describeSObjectSafe(connection, childName);
  

  // Collect all related SObjects from parent.describe().childRelationships
  const parentRelatedSet = new Set<string>();
  if (parentDescribe && Array.isArray((parentDescribe as any).childRelationships)) {
    for (const cr of (parentDescribe as any).childRelationships as any[]) {
      const relChild = String(cr.childSObject ?? '').toLowerCase();
      if (relChild) parentRelatedSet.add(relChild);
      details.parentChildRelationships.push(cr);
    }
  }

  // Collect all referenced SObjects from child.describe().fields[*].referenceTo
  const childReferencedSet = new Set<string>();
  if (childDescribe && Array.isArray((childDescribe as any).fields)) {
    for (const f of (childDescribe as any).fields as any[]) {
      const refTo = Array.isArray(f.referenceTo)
        ? f.referenceTo.map((r: string) => String(r).toLowerCase())
        : [];
      for (const r of refTo) childReferencedSet.add(r);

      details.childReferenceFields.push({
        field: String(f.name ?? '[unknown]'),
        referenceTo: Array.isArray(f.referenceTo)
          ? f.referenceTo.map((x: string) => String(x))
          : [],
      });
    }
  }

  // Filter only valid relationship types those pointing to parent
  const validChildRelationships =
    (parentDescribe as any)?.childRelationships?.filter(
      (cr: any) =>
        cr.relationshipName &&
        cr.field &&
        String(cr.childSObject ?? '').toLowerCase() === childName.toLowerCase()
    ) || [];

  // Filter only valid lookup fields that actually point to parent
  const validLookupFields =
    (childDescribe as any)?.fields?.filter(
      (f: any) =>
        Array.isArray(f.referenceTo) &&
        f.referenceTo.some(
          (ref: string) => ref.toLowerCase() === parentName.toLowerCase()
        ) &&
        f.type === 'reference' &&
        !f.name.toLowerCase().includes('converted') && // exclude conversion references
        !f.name.toLowerCase().includes('masterrecord') // exclude self references
    ) || [];

  const parentHasChild = validChildRelationships.length > 0;
  const childHasParent = validLookupFields.length > 0;
  const isValid = parentHasChild || childHasParent;


  if (parentHasChild) via.push(`parent.childRelationships:${childName}`);
  if (childHasParent) via.push(`child.fields.referenceTo:${parentName}`);

  return { valid: isValid, via, details };
}

/**
 * Identifies and validates picklist fields against Salesforce dependent picklist metadata.
 * It checks fields listed in the template against the metadata to confirm dependency status,
 * ensuring controllers are not excluded and are present if pickLeftFields is false.
 *
 * @param {sObjectMetaType} sObjectMeta - The described metadata for the SObject.
 * @param {string} sObjectName - The API name of the SObject.
 * @param {Record<string, unknown>} fieldsToConsider - The fieldsToConsider object from the template.
 * @param {string[]} fieldsToExclude - The fieldsToExclude array from the template (lowercase).
 * @param {boolean} pickLeftFields - Value of pickLeftFields from the template.
 * @returns {{ fieldErrors: string[]; structuralErrors: string[] }} Object containing field existence errors and structural validation errors.
 */
function validateDependentPicklists(
    sObjectMeta: sObjectMetaType,
    sObjectName: string,
    fieldsToConsider: Record<string, unknown>,
    fieldsToExclude: string[], 
    pickLeftFields: boolean 
): { fieldErrors: string[]; structuralErrors: string[] } {    

    const structuralErrors: string[] = [];
    // Stores only the clean API names of fields explicitly listed in fieldsToConsider
    const templateConsideredFields: string[] = Object.keys(fieldsToConsider).map(key => key.toLowerCase());
    const allFieldsMeta = sObjectMeta.fields ?? [];
    
    // Identify Actual Dependent Fields from Metadata ---

    const metadataDependentFields = new Map<string, string>(); 
    const allMetadataFields = new Map<string, Types.Field>();

    for (const field of allFieldsMeta) {
        const fieldName = String(field.fullName ?? field.name ?? '').toLowerCase();
        
        if (!fieldName) {
            continue; 
        }
        
        allMetadataFields.set(fieldName, field); // Store all metadata fields
        
        if (field.dependentPicklist === true && field.controllerName) {
            const controllingName = String(field.controllerName).toLowerCase();
            metadataDependentFields.set(fieldName, controllingName);
        }
    }
    // Cross-Validate Template Fields Against Metadata 
    const invalidTemplateDependentFields: string[] = [];
    const fieldsToRequireControllers = new Set<string>();
    const templateFieldsToCheck = new Set([...templateConsideredFields]); 

    for (const fieldName of templateFieldsToCheck) {
        const metadata = allMetadataFields.get(fieldName);
        // This field should have been caught by the general invalidConsider check, but we skip it here if it's not in metadata.
        if (!metadata) continue; 

        // Check if the field is an actual dependent picklist based on metadata
        if (metadataDependentFields.has(fieldName)) {
            const controller = metadataDependentFields.get(fieldName)!;
            fieldsToRequireControllers.add(controller);
            // Validation 1: Controller must NOT be in fieldsToExclude
            if (fieldsToExclude.includes(controller)) {
              if (fieldsToExclude.includes(fieldName)) { 
                  continue; 
              }
                structuralErrors.push(
                    chalk.yellow(`⚠️ Warning: Dependent field '${fieldName}' requires controller '${controller}', but '${controller}' is in 'fieldsToExclude'. This may lead to data generation failure.`)
                );
            }
        }
    }

    //  Validation 2 (Controller Existence Check)
    if (!pickLeftFields && fieldsToRequireControllers.size > 0) {
        const consideredFields = new Set(templateConsideredFields);
        const missingControllers = Array.from(fieldsToRequireControllers).filter(controller => 
            // Check if the controller is in the fieldsToConsider list
            !consideredFields.has(controller)
        );

        if (missingControllers.length > 0) {
            structuralErrors.push(
                chalk.red(`Error: 'pickLeftFields' is false and required controller fields are missing from fieldsToConsider: ${missingControllers.join(', ')}.`)
            );
            
        }
    }   
    return {
        fieldErrors: invalidTemplateDependentFields, 
        structuralErrors 
    };
}

/**
 * Performs full validation of a template JSON file against Salesforce metadata.
 * - Loads and normalizes the JSON template.
 * - Validates SObject and field existence.
 * - Checks for correct relationships, data types, and key validity.
 * - Validates all nested relatedSObjects recursively.
 * - Provides detailed console output for success and error states.
 *
 * @param {Connection} connection - Active Salesforce connection.
 * @param {string} configPath - Absolute file path of the template JSON to validate.
 * @returns {Promise<boolean>} True if the template is fully valid, false if warnings or errors are found.
 * @throws {Error} When major parsing or validation failures occur.
 */
export async function validateConfigJson(connection: Connection, configPath: string): Promise<boolean> {
  let isDataValid: boolean = true;
  const spinner = new Spinner(true);
  let isObjFieldsMissing: boolean = false;
  const objectFieldsMissing: string[] = [];

  console.log(chalk.magenta('Please wait!! while we validate Objects and Fields'));
  spinner.start('');

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const config = normalizeAndValidateTemplate(rawConfig);

    const invalidObjects: string[] = [];
    const invalidFieldsMap: { [key: string]: string[] } = {};
    const relationshipErrors: Record<string, string[]> = {};
    const collectAllSObjectNames = (sObjects: any[]): string[] => {
      const names: string[] = [];

      for (const entry of sObjects) {
        const [name, data] = Object.entries(entry)[0] as [string, any]; // <- cast to any
        names.push(name);
        if (data?.relatedSObjects && Array.isArray(data.relatedSObjects)) {
          names.push(...collectAllSObjectNames(data.relatedSObjects));
        }
      }

      return names;
    };

    const sObjectNames: string[] = collectAllSObjectNames(config.sObjects);

    if (sObjectNames.length === 0) {
      console.log(chalk.yellow('⚠️  No SObjects found in the template configuration file.'));
      return true;
    }

    const BATCH_SIZE = 10; // Set the safe batch size
    let batchedMetadata: any[] = [];
    
    // FIX: Loop through sObjectNames in batches of 10
    for (let i = 0; i < sObjectNames.length; i += BATCH_SIZE) {
        const batch = sObjectNames.slice(i, i + BATCH_SIZE);
        
        // Call the restricted API for the small batch
        const batchResult = await connection.metadata.read('CustomObject', batch);

        // Ensure result is an array and flatten it into the main array
        const resultAsArray = Array.isArray(batchResult) ? batchResult : [batchResult];
        batchedMetadata.push(...resultAsArray);
    }
    const metadataArray = batchedMetadata;

    // Recursive validator for related SObjects 
    const validateRelatedObjects = async (
        relatedObjects: any[],
        parentName: string,
        depth: number = 1,
        lineage: string | undefined = undefined     // details of parent to child in every iteration
      ): Promise<void> => {
      const errors = new Set<string>();
      for (const relatedEntry of relatedObjects) {
        const [childName, childData] = Object.entries(relatedEntry)[0] as [string, sObjectSchemaType];
        const childMeta = await describeSObjectSafe(connection, childName) as sObjectMetaType;
        // skip if child metadata is missing or fields are missing
        if (!childMeta) {
          invalidObjects.push(`${parentName} -> ${childName}`);
          continue;
        }

        // Skip if child metadata has no fields
        if (!childMeta?.fields) {
          continue;
        }

        // Validate relationship on child metadata
        const childMetaObj = metadataArray.find((meta) => meta.fullName === childName) as sObjectMetaType | undefined;

        if (!childMetaObj?.fields?.length) {
          continue;
        }
   
        const relationResult = await verifyParentChildRelationship(connection, parentName, childName);
        
        if (!relationResult.valid) {
          errors.add(`Invalid relationship: ${parentName} -> ${childName}`);
        }

        // Skip field validation if relation is invalid
        if (!relationResult.valid) {
          continue;
        }

        const fieldsToExclude = (childData.fieldsToExclude ?? []).map((f) => f.toLowerCase());
        const fieldsToConsider = childData.fieldsToConsider ?? {};
        const pickLeftFields = childData.pickLeftFields ?? true;

        if (!pickLeftFields && fieldsToConsider !== undefined && Object.keys(fieldsToConsider).length === 0
        ) {
          isObjFieldsMissing = true;
          objectFieldsMissing.push(childName);
        }
        
        // Call the revised validation function
        const dependentValidationResult = validateDependentPicklists(
            childMeta, 
            childName, 
            fieldsToConsider,
            fieldsToExclude, 
            pickLeftFields
        );

        const invalidDependentFields = dependentValidationResult.fieldErrors;
        if (dependentValidationResult.structuralErrors.length > 0) {
            // the (Rules) suffix for structural errors on child objects.
            const structuralErrorKey = `${parentName} -> ${childName} (Rules)`; 
            
            if (!invalidFieldsMap[structuralErrorKey]) {
                invalidFieldsMap[structuralErrorKey] = [];
            }
            invalidFieldsMap[structuralErrorKey].push(...dependentValidationResult.structuralErrors);
            isDataValid = false; 
        }
        const getAllFields = (childMeta.fields ?? [])
          .filter((f: Types.Field) => f.fullName ?? f.name)
          .map((f: Types.Field) => (f.fullName ?? f.name)!.toLowerCase());
        if (childMeta.fullName?.toLowerCase()) getAllFields.push('name');
        if (childMeta.fullName?.toLowerCase() === 'contact') getAllFields.push('lastname', 'firstname', 'salutation');

        const considerKeys = Object.keys(fieldsToConsider).map(f => f.toLowerCase());
        const common = considerKeys.filter(f => fieldsToExclude.includes(f));
        if (common.length > 0) {
          throw new Error(
            chalk.red(
              `Error: Fields appear in both 'fieldsToConsider' and 'fieldsToExclude' for ${childName}: ${common.join(', ')}`
            )
          );
        }

        const invalidConsider = Object.keys(fieldsToConsider).filter((field) => {
          const clean = field;
          return !getAllFields.includes(clean.toLowerCase());
        });
        const invalidExclude = fieldsToExclude.filter((f) => !getAllFields.includes(f.toLowerCase()));
        const allInvalid = [...invalidConsider, ...invalidExclude, ...invalidDependentFields];      
        if (allInvalid.length > 0) {
          const fieldExistenceKey = `${parentName} -> ${childName}`; 

            if (!invalidFieldsMap[fieldExistenceKey]) {
                invalidFieldsMap[fieldExistenceKey] = [];
            }
            invalidFieldsMap[fieldExistenceKey] = Array.from(new Set([
                ...invalidFieldsMap[fieldExistenceKey], 
                ...allInvalid
            ]));
        } 

        // Recurse deeper if nested relatedSObjects exist
        if (Array.isArray(childData.relatedSObjects) && childData.relatedSObjects.length > 0) {
          await validateRelatedObjects(childData.relatedSObjects, childName, depth + 1, lineage ? `${lineage} -> ${childName}` : `${parentName} -> ${childName}`);
        }
      }

      // Collect errors once after processing all children
      if (errors.size > 0) {
        if (!relationshipErrors[parentName]) relationshipErrors[parentName] = [];
        relationshipErrors[parentName].push(...Array.from(errors));
      }

    };

    // Main loop
    for (const sObjectEntry of config.sObjects) {
      const [sObjectName, sObjectData] = Object.entries(sObjectEntry)[0] as [string, sObjectSchemaType];
      const sObjectMeta = await describeSObjectSafe(connection, sObjectName) as sObjectMetaType;
      if (!sObjectMeta) {
        invalidObjects.push(sObjectName);
        continue;
      }

      const fieldsToExclude = (sObjectData.fieldsToExclude ?? []).map((f) => String(f).toLowerCase());
      const fieldsToConsider = sObjectData.fieldsToConsider ?? {};

      const fieldsToConsiderArray = Object.keys(fieldsToConsider).map((f) => f); 
      const commonFields = fieldsToConsiderArray.filter((f) => fieldsToExclude.includes(f.toLowerCase()));
      if (commonFields.length > 0) {
        throw new Error(
          chalk.red(
            `Error: Fields appear in both 'fieldsToConsider' and 'fieldsToExclude' for ${sObjectName}: ${commonFields.join(', ')}`
          )
        );
      }
      if (
        (sObjectData.pickLeftFields === false || sObjectData.pickLeftFields === undefined) &&
        sObjectData.fieldsToConsider !== undefined &&
        Object.keys(fieldsToConsider).length === 0
      ) {
        isObjFieldsMissing = true;
        objectFieldsMissing.push(sObjectName);
      }

      const getAllFields = (sObjectMeta.fields ?? [])
        .filter((f: Types.Field) => f.fullName ?? f.name)
        .map((f: Types.Field) => (f.fullName  ?? f.name)!.toLowerCase());

      if (sObjectMeta.nameField) getAllFields.push('name');
      if (sObjectName.toLowerCase() === 'contact') getAllFields.push('lastname', 'firstname', 'salutation');

      const invalidConsider = Object.keys(fieldsToConsider).filter((field) =>  !getAllFields.includes(field.toLowerCase()));
      const invalidExclude = fieldsToExclude.filter((f) => !getAllFields.includes(f));
      const pickLeftFields = sObjectData.pickLeftFields ?? false;
      const dependentValidationResult = validateDependentPicklists(
        sObjectMeta,
        sObjectName,
        fieldsToConsider,
        fieldsToExclude, 
        pickLeftFields
      );
      const invalidDependentFields = dependentValidationResult.fieldErrors;
      const structuralErrors = dependentValidationResult.structuralErrors;

      //  HANDLE STRUCTURAL ERRORS (Unique Key)
      if (structuralErrors.length > 0) {
          const structuralErrorKey = `${sObjectName} (Rules)`; 
          // Assign structural errors to the unique key.
          invalidFieldsMap[structuralErrorKey] = structuralErrors;
          isDataValid = false;
      }
      const allInvalidFields = [...invalidConsider, ...invalidExclude, ...invalidDependentFields]; 

      if (allInvalidFields.length > 0) {
          const uniqueAllInvalid = Array.from(new Set(allInvalidFields)); 
          // Assign ONLY the clean field names to the standard SObject key
          invalidFieldsMap[sObjectName] = uniqueAllInvalid;
          isDataValid = false;
      }

      if (Array.isArray(sObjectData.relatedSObjects) && sObjectData.relatedSObjects.length > 0) {
        await validateRelatedObjects(sObjectData.relatedSObjects, sObjectName, 1);
      }
    }

    spinner.stop('');
    // Check if any SObjects have missing fields
    if (isObjFieldsMissing && objectFieldsMissing.length > 0) {
      console.log();
      console.warn(
        chalk.yellow(
          `⚠️ Warning: [${objectFieldsMissing.join(
            ', '
          )}] No fields found to generate data. Set 'pickLeftFields' to true or add fields to 'fieldsToConsider'.`
        )
      );
      isDataValid = false;
    }

    // Check missing SObjects
    if (invalidObjects.length > 0) {
      console.log();
      console.warn(chalk.red(`Error: SObjects not found or inaccessible:\n • ${invalidObjects.join(', ')}`));
      isDataValid = false;
    }

    // Check invalid fields
    if (Object.keys(invalidFieldsMap).length > 0) {
        console.log();
        
        //  PRINT CRITICAL LOGIC/STRUCTURAL ERRORS 
        const structuralErrors = Object.entries(invalidFieldsMap)
            .filter(([key]) => key.endsWith(' (Rules)'));

        if (structuralErrors.length > 0) {
            console.warn(chalk.red.bold('CRITICAL LOGIC/STRUCTURAL ERRORS FOUND:'));
            for (const [objKey, errors] of structuralErrors) {
                // Clean up the key name for presentation
                const sObjectName = objKey.replace(' (Rules)', '');
                console.warn(chalk.red(` • ${sObjectName}:`));
                errors.forEach(err => console.warn(chalk.red(`   - ${err}`)));
            }
        }
        
        //  PRINT SIMPLE FIELD EXISTENCE ERRORS (Typos) 
        const fieldExistenceErrors = Object.entries(invalidFieldsMap)
            .filter(([key]) => !key.endsWith(' (Rules)'));

        if (fieldExistenceErrors.length > 0) {
            console.warn(chalk.magenta('Invalid fields found (Typos/Missing Fields):'));
            for (const [obj, fields] of fieldExistenceErrors) {
                console.warn(chalk.magenta(` • ${obj}: ${fields.join(', ')}`));
            }
        }
        isDataValid = false;
    }
    // Check relationship errors
    if (Object.keys(relationshipErrors).length > 0) {
      console.log();
      console.warn(chalk.red('Invalid relationships found:'));
      Object.values(relationshipErrors).forEach((errs) => {
        errs.forEach((err) => console.log(chalk.red(` • ${err}`)));
      });
      isDataValid = false;
    }

    // Final summary
    if (isDataValid) {
      console.log(
        chalk.green(`✅ Successfully validated '${path.basename(configPath)}' — all SObjects and fields are valid!`)
      );
    } else {
      throw new Error(chalk.yellow.bold('\n⚠️ Validation completed with errors or warnings above.'));
    }

    return isDataValid;

  } catch (error: any) {
    throw error.name === 'Error' ? error : new Error(chalk.red(`${error.message}`));
  }
}


export default class TemplateValidate extends SfCommand<TemplateValidateResult> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      char: 't',
      required: true,
    }),
    sObjects: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObjects.summary'),
      required: false,
    }),
    alias: Flags.string({
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      char: 'a',
      required: true,
    }),
  };

  /**
   * Executes the Salesforce CLI command `smockit template validate`.
   * Establishes a Salesforce connection, loads the specified template file,
   * and runs validation using `validateConfigJson()`.
   *
   * @returns {Promise<TemplateValidateResult>} Result object containing validation file path.
   * @throws {Error} If the specified template file is not found or validation fails.
   */
  public async run(): Promise<TemplateValidateResult> {
    const { flags } = await this.parse(TemplateValidate);

    const currWorkingDir = process.cwd();
    const sanitizeFilename = flags['templateName'].endsWith('.json')
      ? flags['templateName']
      : flags['templateName'] + '.json';
    const templateDirPath = path.join(currWorkingDir, `data_gen/templates/${sanitizeFilename}`);
    const userNameOrAlias = flags.alias;
    if (fs.existsSync(templateDirPath)) {
      const connection = await connectToSalesforceOrg(userNameOrAlias);
      console.log(chalk.cyan('Success: SF Connection established.'));
      await validateConfigJson(connection, templateDirPath);
    } else {
      throw new Error(`File: ${flags['templateName']} is not present at this path: ${templateDirPath}`);
    }

    return {
      path: 'src/commands/template/validate.ts',
    };
  }
}
