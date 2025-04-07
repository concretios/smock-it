/* eslint-disable @typescript-eslint/no-explicit-any */


// types for init.ts

export type SetupInitResult = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: Array<{ [key: string]: typeSObjectSettingsMap }>;
};

export type typeSObjectSettingsMap = {
  count?: number;
  language?: string;
  fieldsToExclude?: string[];
  fieldsToConsider?: { [key: string]: string[] | string };
  pickLeftFields?: boolean | string | undefined;
};

// types for upsert.ts file
export type TemplateAddResult = {
  path: string;
};

export type SObjectItem = { [key: string]: typeSObjectSettingsMap };

export type templateSchema = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: SObjectItem[];
};

export type tempAddFlags = {
  sObjects?: string;
  templateName: string;
  language?: string;
  count?: number;
  namespaceToExclude?: string;
  outputFormat?: string;
  fieldsToExclude?: string;
  fieldsToConsider?: string;
  pickLeftFields?: boolean;
};

// types from remove.ts file
export type flagObj = {
  templateName: string;
  namespaceToExclude?: string[];
  outputFormat?: string[];
  language?: boolean;
  count?: boolean;
  sObject?: string;
  fieldsToExclude?: string[];
  pickLeftFields?: boolean;
  fieldsToConsider?: string[];
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

// types for validate.ts results
export type TemplateValidateResult = {
  path: string;
};
export namespace Types {
  export type Field = {
    fullName: string | null | undefined;
  };
}
export type sObjectMetaType = {
  nameField?: { label: string; type: string };
  fields?: Types.Field[];
};

export type sObjectSchemaType = {
  fieldsToExclude?: string[];
  fieldsToConsider?: fieldsToConsiderMap;
  count?: number;
  language?: string;
  pickLeftFields?: boolean;
};
export type fieldsToConsiderMap = {
  [key: string]: string[] | string;
};

// output format table 
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
};

export type RecordId = {
  Id: string;
}

export type QueryResult = {
  records: RecordId[];
}

export type Fields = {
  [key: string]: any;
  type: string;
  values?: string[];
  relationshipType?: string;
  referenceTo?: string;
  'max-length'?: number;
  'child-dependent-field'?: string;
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
};

export type fieldType =
  | 'picklist'
  | 'reference'
  | 'dependent-picklist'



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
  language: string;
  count?: number;
  fields?: { [key: string]: Field };
};

export type SObjectConfigFile = {
  sObjects: SObjectConfig[];
};

export type jsonConfig = {
  outputFormat?: string[];
  sObjects: SObjectConfig[];
}

export type GenericRecord = { [key: string]: any };
export type CreateResult = { id: string; success: boolean; errors: any[] };