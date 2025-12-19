/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// types for init.ts

export type SetupInitResult = {
  namespaceToExclude: string[];
  outputFormat: string[];
  count: number;
  sObjects: Array<{ [key: string]: typeSObjectSettingsMap }>;
};

export type FieldMeta = {
  fullName: string;
  type?: string;
  referenceTo?: string[];
}

export type RelatedSObject = {
  [key: string]: {
    count: number;
    pickLeftFields?: boolean;
    relatedSObjects?: RelatedSObject[];
  };
}

export type typeSObjectSettingsMap = {
  count?: number;
  fieldsToExclude?: string[];
  fieldsToConsider?: { [key: string]: string[] | string };
  pickLeftFields?: boolean | string | undefined;
  relatedSObjects?: Array<{ [key: string]: typeSObjectSettingsMap  }>;
};


export type TemplateAddResult = {
  path: string;
};

export type SObjectItem = { [key: string]: typeSObjectSettingsMap };

export type templateSchema = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  count: number;
  sObjects: SObjectItem[];
};

export type tempAddFlags = {
  alias?: string;
  sObjects?: string;
  templateName: string;
  relatedSObjects?: string;
  count?: number;
  namespaceToExclude?: string;
  outputFormat?: string;
  fieldsToExclude?: string;
  fieldsToConsider?: string;
  pickLeftFields?: boolean;
};

export type tempValidateFlags = {
  alias?: string;
  sObjects?: string;
  templateName: string;
};

export type flagObj = {
  templateName: string;
  namespaceToExclude?: string[];
  outputFormat?: string[];
  count?: boolean;
  sObject?: string;
  fieldsToExclude?: string[];
  pickLeftFields?: boolean;
  fieldsToConsider?: string[];
  relatedSObjects?: string[];
};
export type flagsForInit = {
  default?: boolean;
};
export type namespaceAndOutputSchema = {
  namespaceToExclude: string[];
  outputFormat: string[];
};
export type TemplateRemoveResult = {
  path: string;
};

export type TemplateValidateResult = {
  path: string;
};
export namespace Types {
  export type Field = {
    fullName?: string | null | undefined;
    name?: string | null | undefined;
    type?: string;
    referenceTo?: string[];
    relationshipName?: string;
    dependentPicklist?: boolean;   
    controllerName?: string | null;
  };
}
export type sObjectMetaType = {
  nameField?: { label: string; type: string };
  fields?: Types.Field[];
  fullName: string | null | undefined;
};

export type sObjectSchemaType = {
  fieldsToExclude?: string[];
  fieldsToConsider?: fieldsToConsiderMap;
  count?: number;
  pickLeftFields?: boolean;
  relatedSObjects?: Array<{ [key: string]: sObjectSchemaType }>;
  relatedsobjects?: SObjectItem[];
};
export type fieldsToConsiderMap = {
  [key: string]: string[] | string;
};

export type ResultEntry = {
  'SObject(s)': string;
  JSON: string;
  CSV: string;
  DI: string;
  'Failed(DI)': number;
};

/* --------------------------------------------------------------------------------*/
/* data generation types without mockaroo */
export type DataGenerateResult = {
  path: string;
};

export type DataTemplates = {
  path: string;
};


export type FieldRecord = {
  Label: string;
  attributes: {
    type: string;
    url: string;
  };
  QualifiedApiName: string;
  IsDependentPicklist: boolean;
  NamespacePrefix: string | null;
  DataType: string;
  ReferenceTo: {
    referenceTo: null | any[];
  };
  RelationshipName: string | null;
  IsNillable: boolean;
  Length?: number | null | undefined;
  Precision: number;
  Scale: number;
};

export type RecordId = {
  Id: string;
};

export type QueryResult = {
  records: RecordId[];
};

export type Fields = {
  [key: string]: any;
  type: string;
  values?: string[];
  relationshipType?: string;
  referenceTo?: string;
  'max-length'?: number;
  'child-dependent-field'?: string;
  maxLength?: number;
};

/* ------------------------------------------*/

export type TargetData = {
  name: string;
  type: string;
  min?: number;
  max?: number;
  decimals?: number;
  values?: string[];
  label?: string;
  maxLength?: number;
  length?: number;
};

export type fieldType = 'picklist' | 'reference' | 'dependent-picklist';

export type Field = {
  label?: string;
  type: fieldType;
  values?: string[]; // For picklist or dependent-picklist
  referenceTo?: string; // For reference fields
  relationshipType?: 'lookup' | 'master-detail'; // For reference fields
  'child-dependent-field'?: string; // For dependent picklists
};

export type SObjectConfig = {
  sObject: string;
  // language: string;
  count?: number;
  fields?: { [key: string]: Field };
  relatedSObjects?: Array<{ [key: string]: SObjectConfig }>;
};

export type SObjectConfigFile = {
  sObjects: SObjectConfig[];
};

export type jsonConfig = {
  outputFormat?: string[];
  sObjects: SObjectConfig[];
};

export type GenericRecord = { [key: string]: any };
export type CreateResult = { id: string; success: boolean; errors: any[] };

