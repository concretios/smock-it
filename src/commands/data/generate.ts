/* eslint-disable sf-plugin/only-extend-SfCommand */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable class-methods-use-this */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Flags } from '@salesforce/sf-plugins-core';
import { Messages, Connection } from '@salesforce/core';
import { updateOrInitializeConfig, getTemplateJsonData } from '../template/upsert.js';
import { connectToSalesforceOrg ,validateConfigJson} from '../template/validate.js';
import CreateRecord from '../create/record.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('smock-it', 'data.generate');

export type DataGenerateResult = {
  path: string;
};

type FieldRecord = {
  attributes: {
    type: string;
    url: string;
  };
  QualifiedApiName: string;
  IsDependentPicklist: boolean;
  NamespacePrefix: string | null;
  DataType: string;
  ReferenceTo: {
    referenceTo: null | Array<any>;
  };
  RelationshipName: string | null;
  IsNillable: boolean;
};

type Field = {
  type: string;
  values?: string[];
  relationshipType?: string;
  referenceTo?: string;
  'max-length'?: number;
  'child-dependent-field'?: string;
  [key: string]: any;
};

export let conecteOrgCreds: any;

export default class DataGenerate extends CreateRecord {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    ...CreateRecord.flags, // Use spread to include all flags from CreateRecord
    sObject: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObject.summary'),
      required: false,
    }),
    templateName: Flags.string({
      char: 't',
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      required: true,
    }),
    alias: Flags.string({
      char: 'a',
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      required: true,
    }),
  };

  private async getPicklistValues(conn: Connection, object: string, field: string): Promise<string[]> {
    const result = await conn.describe(object);
    const fieldDetails = result.fields.find((f: Record<string, any>) => f.name === field);
    return fieldDetails?.picklistValues?.map((pv: Record<string, any>) => pv.value) ?? [];
  }

  public dependentPicklistResults: Record<
    string,
    Array<{ parentFieldValue: string; childFieldName: string; childValues: string[] }>
  > = {};
  public independentFieldResults: Map<string, string[]> = new Map();

  private async depPicklist(conn: Connection, objectName: string, dependentFieldApiName: string, considerMap: Record<string, any> ) {
    const schema = await conn.sobject(objectName).describe();

    const dependentFieldResult = schema.fields.find((field) => field.name === dependentFieldApiName);
    if (!dependentFieldResult) {
      this.error(`Dependent field ${dependentFieldApiName} not found.`);
      return;
    }

    const controllingFieldName = this.getControllingFieldName(dependentFieldResult);
    if (!controllingFieldName) {
      this.independentFieldResults.set(
        dependentFieldApiName,
        dependentFieldResult.picklistValues?.map((value) => value.value) ?? []
      );
      return;
    }

    const controllerFieldResult = schema.fields.find((field) => field.name === controllingFieldName);
    const controllerValues = controllerFieldResult?.picklistValues ?? [];

    const dependentPicklistValues = new Map<string, string[]>();

    dependentFieldResult.picklistValues?.forEach((entry) => {
      if (entry.validFor) {
        const base64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const validForControllerValues = [];

        const base64chars = entry.validFor.split('');
        for (let i = 0; i < controllerValues.length; i++) {
          const bitIndex = Math.floor(i / 6);
          const bitShift = 5 - (i % 6);
          if ((base64map.indexOf(base64chars[bitIndex]) & (1 << bitShift)) !== 0) {
            validForControllerValues.push(controllerValues[i].label);
          }
        }
        validForControllerValues.forEach((controllerValue) => {
          if (!dependentPicklistValues.has(controllerValue)) {
            dependentPicklistValues.set(controllerValue, []);
          }
          dependentPicklistValues.get(controllerValue)?.push(entry.value);
        });
      }
    });

    // Append to dependentPicklistResults
    dependentPicklistValues.forEach((childValues, parentValue) => {
      if (!this.dependentPicklistResults[controllingFieldName]) {
        this.dependentPicklistResults[controllingFieldName] = [];
      }
      this.dependentPicklistResults[controllingFieldName].push({
        parentFieldValue: parentValue,
        childFieldName: dependentFieldApiName,
        childValues,
      });
    });
    Object.keys(this.dependentPicklistResults).forEach((key) => {
      if (Object.keys(considerMap).includes(key.toLowerCase()) && considerMap[key.toLowerCase()].length > 0) {
        const pickListFieldValues = this.dependentPicklistResults[key];
        const filteredArray = pickListFieldValues.filter(item => item.parentFieldValue === considerMap[key.toLowerCase()][0]);

        if (filteredArray.length > 0) {
          filteredArray[0].childValues = considerMap[filteredArray[0].childFieldName.toLowerCase()];
          this.dependentPicklistResults[key] = filteredArray;

        }
      }
    });
  }
  private getControllingFieldName(dependentField: any): string | null {
    return dependentField.controllerName || null;
  }

  private convertJSON(
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
        output[controllingFieldName]['values'].push(entry.parentFieldValue);
        output[controllingFieldName][childFieldName][entry.parentFieldValue] = {
          values: entry.childValues,
        };

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues);
        if (nestedOutput) {
          Object.assign(output[controllingFieldName][childFieldName][entry.parentFieldValue], nestedOutput);
        }
      });
    }

    return output;
  }

  private buildNestedJSON(
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

        const nestedOutput = this.buildNestedJSON(input, entry.childFieldName, entry.childValues);

        if (nestedOutput) {
          Object.assign(output[childFieldName][parentValue], nestedOutput);
        }
      });
    });

    return output;
  }

  private getRequiredFields(fields: FieldRecord[]): FieldRecord[] {
    return fields.filter((record) => record.IsNillable === false);
  }

  private mergeFieldsToPass(fields: FieldRecord[]): FieldRecord[] {
    return [...new Map(fields.map((field) => [field.QualifiedApiName, field])).values()];
  }
  

  public async run(): Promise<DataGenerateResult> {

    const { flags } = await this.parse(DataGenerate);
    const aliasOrUsername = flags.alias;
    const conn = await connectToSalesforceOrg(aliasOrUsername);

    const objectName = flags.sObject ? flags.sObject.toLowerCase() : undefined;

    const configFilePath = getTemplateJsonData(flags.templateName);
    const isDataValid = await validateConfigJson(conn, configFilePath);
    if(!isDataValid){
      throw new Error('Invalid data in the template');
    }


    if (!fs.existsSync(configFilePath)) {
      this.error(`Config file not found at ${configFilePath}`);
    }

    let baseConfig;
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      baseConfig = JSON.parse(configContent);
      baseConfig.sObjects = baseConfig.sObjects || [];
    } catch (error) {
      this.error(`Failed to read or parse the base config file at ${configFilePath}`);
    }

    let objectsToProcess = baseConfig.sObjects;

    // getting specific object and its configuration if name given
    if (objectName) {
      const existingObjectConfig = baseConfig.sObjects.find((o: any) => {
        const objectKey = Object.keys(o)[0];
        return objectKey.toLowerCase() === objectName;
      });

      if (!existingObjectConfig) {
        this.error(`Object ${objectName} not found in base-config.`);
      }

      // writing the configuration of object level
      else {
        const objectKey = Object.keys(existingObjectConfig)[0];
        updateOrInitializeConfig(
          existingObjectConfig[objectKey],
          flags,
          ['language', 'count', 'fieldsToExclude','pickLeftFields', 'fieldsToConsider'],
          this.log.bind(this)
        );
        objectsToProcess = [existingObjectConfig];
      }
    }


    const outputData: any[] = [];

    for (const objectConfig of objectsToProcess) {
      const objectKey = Object.keys(objectConfig)[0];
      const objectName = objectKey;
      const configForObject = objectConfig[objectKey];

      let fieldsToExclude = configForObject['fieldsToExclude']?.map((field: string) => field.toLowerCase()) || [];
      const fieldsToIgnore = ['jigsaw', 'cleanstatus'];

      fieldsToExclude = fieldsToExclude.filter((field: string) => !fieldsToIgnore.includes(field));
      fieldsToExclude = [...fieldsToIgnore, ...fieldsToExclude];

      const getPickLeftFields = configForObject.pickLeftFields;

      const namespacePrefixToExclude =
        baseConfig['namespaceToExclude']?.map((ns: string) => `'${ns}'`).join(', ') || 'NULL';

      const fieldsToConsiderKeys = Object.keys(configForObject?.['fieldsToConsider'] || {});
      const considerMap: Record<string, any> = {};
      for (const key of fieldsToConsiderKeys) {
        if (key.startsWith('dp-')) {
            considerMap[key.substring(3)] = configForObject['fieldsToConsider'][key];
        } else {
            considerMap[key] = configForObject['fieldsToConsider'][key];
        }
    }
    const fieldsToConsider = Object.keys(considerMap);
      const allFields = await conn.query(
        `SELECT QualifiedApiName, IsDependentPicklist, NamespacePrefix, DataType, ReferenceTo, RelationshipName, IsNillable
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        AND IsCreatable = true
        AND NamespacePrefix NOT IN (${namespacePrefixToExclude})`
      );

      let fieldsToPass: FieldRecord[] = [];

      if (configForObject['fieldsToConsider'] === undefined && configForObject['fieldsToExclude'] === undefined && configForObject['pickLeftFields'] === undefined) {
        fieldsToPass = (allFields.records as FieldRecord[]).filter(
          (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase()));
      }

      if (getPickLeftFields === true && fieldsToIgnore.length > 0) {

        if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
          fieldsToPass = (allFields.records as FieldRecord[]).filter(
            (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase()));
        }
        else if (fieldsToExclude.length > 0 && fieldsToConsider.length === 0)  {
          fieldsToPass = (allFields.records as FieldRecord[]).filter(
            (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase()));
        } 
        else if (fieldsToExclude.length === 0 && fieldsToConsider.length === 0)  {
          fieldsToPass = (allFields.records as FieldRecord[]).filter(
            (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase()));
        }
      } 
      else if (getPickLeftFields === false && fieldsToIgnore.length > 0) {

        if(fieldsToExclude.length === 0 && fieldsToConsider.length === 0){
          this.error('please provide a field or set pick-left field to true')
        }
        else if(fieldsToExclude.length > 0 && fieldsToConsider.length === 0) {
          this.error('Please provide fieldsToConsider or set pickLeftFields to true');
        }
        else if (fieldsToConsider.length > 0 && fieldsToExclude.length > 0) {
          fieldsToPass = (allFields.records as FieldRecord[]).filter(
            (record) => !fieldsToExclude.includes(record.QualifiedApiName.toLowerCase())
          );

          const requiredFields = this.getRequiredFields(fieldsToPass);

          const consideredFields = fieldsToPass.filter((record) =>
            fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
          );
          fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
        }
        else if (fieldsToConsider.length > 0 && fieldsToIgnore.length > 0 && fieldsToExclude.length === 0) {
          fieldsToPass = (allFields.records as FieldRecord[]).filter(
            (record) => !fieldsToIgnore.includes(record.QualifiedApiName.toLowerCase())
          );
          const requiredFields = this.getRequiredFields(fieldsToPass);

          const consideredFields = fieldsToPass.filter((record) =>
            fieldsToConsider.includes(record.QualifiedApiName.toLowerCase())
          );

          fieldsToPass = this.mergeFieldsToPass([...consideredFields, ...requiredFields]);
        }
      }

      const fieldsObject: Record<string, Field> = {};

      // Initialize dependentPicklistResults for each object
      this.dependentPicklistResults = {};

      for (const inputObject of fieldsToPass) {
        let fieldConfig: Field = { type: inputObject.DataType };

        switch (inputObject.DataType) {
          case 'textarea':
          case 'string':
            if (
              inputObject.QualifiedApiName.match(
                /^(Billing|Shipping|Other|Mailing)(Street|City|State|PostalCode|Country)$/i
              )
            ) {
              fieldConfig = {
                type: 'address',
              };
            } else {
              fieldConfig = {
                type: 'text',
                values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()] 
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()] 
                : []
                
              };
            }
            break;

          case 'reference':
            fieldConfig = {
              type: 'reference',
              // referenceTo: inputObject.ReferenceTo?.referenceTo[0],
              referenceTo: inputObject.ReferenceTo?.referenceTo ? inputObject.ReferenceTo.referenceTo[0] : undefined,
              values: [],
              relationshipType: inputObject.RelationshipName
                ? inputObject.IsNillable === false
                  ? 'master-detail'
                  : 'lookup'
                : undefined,
            };
            break;

          case 'picklist':
            if (inputObject.IsDependentPicklist) {
              await this.depPicklist(conn, objectName, inputObject.QualifiedApiName, considerMap);
            } else {
              const picklistValues = await this.getPicklistValues(conn, objectName, inputObject.QualifiedApiName);
              fieldConfig = {
                type: 'picklist',
                // values: considerMap[inputObject.QualifiedApiName.toLowerCase()] || picklistValues,
                values: considerMap?.[inputObject.QualifiedApiName.toLowerCase()] 
                ? considerMap[inputObject.QualifiedApiName.toLowerCase()] 
                : picklistValues
              };
            }
            break;

          default:
            if (considerMap?.[inputObject.QualifiedApiName.toLowerCase()]?.length > 0) {
              fieldConfig = { 
                type: inputObject.DataType, 
                values: considerMap[inputObject.QualifiedApiName.toLowerCase()]
              };
            } else {
              fieldConfig = { 
                type: inputObject.DataType 
              };
            }
            
            break;
        }
        if (!inputObject.IsDependentPicklist) {
          fieldsObject[inputObject.QualifiedApiName] = fieldConfig;
        }
      }

      if (Object.keys(this.dependentPicklistResults).length > 0) {
        const topControllingField = Object.keys(this.dependentPicklistResults)[0];
        const dependentFieldsData = this.convertJSON(this.dependentPicklistResults, topControllingField);

        Object.assign(fieldsObject, dependentFieldsData);
        this.dependentPicklistResults = {};
      }

      const configToWrite: any = {
        sObject: objectName,
        language: configForObject.language || baseConfig.language,
        count: configForObject.count || baseConfig.count,
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
    this.orgConnection = conn;
    await super.run();

    return { path: configFilePath };
  }
}
