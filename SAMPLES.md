# Test Data Generation Using Smock-It

This guide provides a series of use cases to explore the Init command in Smock-It & familiarize with custom template JSON. Each use case specifies how to generate Salesforce records, including or excluding selecting specific fields, filtering values, and defining the output format i.e. CSV, JSON, DI-Direct Insertion.

## Prerequisites
- Ensure you have `Smock-It` installed and configured on your system.
- Salesforce org connected for data creation.

## Use Cases

##### **Default UseCase:  I want to create 50 Account records in English, excluding the `testGen` namespace and `phone` field, while including `name`, `email`, and other remaining fields. The output should be in all three formats `DI`, `CSV` and `JSON`.**

##### Steps:
1. Run `sf template init` to trigger a CLI questionnaire..
2. Provide Input for the questionnaire
	- Provide descriptive name for the template data file (e.g., validate_Account_creation): `account_data_template`
    - Enter namespace(s) to exclude [Fields from these namespace(s) will be ignored. (comma-separated: "mynamespaceA", "mynamespaceB")]: `testGen`
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported] · `DI,CSV,JSON`
    - In which language would you like to generate test data? · `en`
    - Specify the number of test data records to generate (e.g., 5) (default: 1): `200`
    - Provide Objects(API names) for data creation (comma-separated) (default: Lead): `account`
    - Would you like to customize settings for individual SObjects? (Y/n) (default: n): `y`
    - Which Object(API name) would you like to override the global settings for?: `account`
    - [account - Count] Count for generating records: `50`                                        -[account - Language] Language in which test data should be generated · `en`
    - [account - fieldsToEx********clude] Provide fields(API names) to exclude (comma-separated): `phone`
    - [account - fieldsToConsider] Provide field(API names) to be considered for generating data. (E.g. Phone: [909090, 6788489], Fax ): `name, email`
    - [account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude': `true`
    - Do you wish to overwrite global settings for another Object(API name)? (Y/n) (default: n): `n`
   
#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": ["testGen"],
  "outputFormat": [
    "di",
	"csv",
    "JSON"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
       "account": {
        "count": 50,
        "language": "en",
        "fieldsToExclude": ["phone"],
        "fieldsToConsider": {
          "name": [],
          "email": []
        },
        "pickLeftFields": true
      },
    }
  ]
}

```
---
#### **UseCase 1: I want to generate 200 Account records in English and retrieve the data in both DI and JSON formats.**

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
	- Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `DI, JSON`
	- In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
    - Provide Objects(API names) for data creation (comma-separated) (default: Lead): `account`
   
#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "di",
    "JSON"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {}
    }
  ]
}

```
---
#### **UseCase 2: I want to generate 15 Account and 30 Contact records using a single template, with only `Name` and `Email` for Account, and `LastName` and `Phone` for Contact with random values.** 

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `DI, JSON`
    - In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
    - Provide Objects(API names) for data creation (comma-separated) (default: Lead): `account, contact`
    - Would you like to customize settings for individual SObjects? (Y/n) (default: n): `y`
    - Which Object(API name) would you like to override the global settings for?: `Account`
    - [Account - Count] Count for generating records: `15`
    - [Account - Language] Language in which test data should be generated: `en`
    - [Account - fieldsToConsider] Provide field(API names) to be considered for generating data.  (E.g. Phone: [909090, 6788489], Fax ): `name, email`
    - [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider'  nor in 'fields to exclude'] · `false`
    - Do you wish to overwrite global settings for another Object(API name)? (Y/n) (default: n): `y`
    - Which Object(API name) would you like to override the global settings for?: `Contact`
    - [Contact - Count] Count for generating records: `30`                                       -[Contact - Language] Language in which test data should be generated: `en`
    - [Contact - fieldsToConsider] Provide field(API names) to be considered for generating data. (E.g. Phone: [909090, 6788489], Fax ): `lastname, phone`
    - [Contact - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude']: `false`

#### Template:

```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "di",
    "JSON"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "count": 15,
        "language": "en",
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "name": [],
          "email": []
        },
        "pickLeftFields": false
      },
      "contact": {
        "count": 30,
        "language": "en",
        "fieldsToExclude": [],
        "fieldsToConsider": {
         "lastname": [],
          "phone": []
        },
        "pickLeftFields": false
      }
    }
  ]
}

```
---
#### **UseCase 3: I want to create 200 Account records in Salesforce, excluding the `Phone` and `CleanStatus` fields, with all other fields populated randomly.** 

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
   - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `DI, JSON
   - In which language would you like to generate test data?: `en`
   - Specify the number of test data records to generate: `200`
   - [Account - fieldsToExclude] Provide fields(API names) to exclude (comma-separated): `Phone, CleanStatus`
   - [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude': `true`

#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "di",
    "JSON"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "language": "en",
        "fieldsToExclude": ["CleanStatus", "Phone"],
         "fieldsToInclude": [],
        "pickLeftFields": true
      }
    }
  ]
}

```
---
#### **UseCase 4: I want to create 200 Account records in English, excluding specific namespaces, with the `Name` field to only generate data with `Dickenson plc`, `GenePoint`, and other fields populated randomly.** 

##### ***Note: namespaceToExclude will exclude all the specified namespaces when generating records.

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Enter namespace(s) to exclude [Fields from these namespace(s) will be ignored. (comma-separated: "mynamespaceA", "mynamespaceB")]: zentech, localtime
	- Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: CSV.
	- In which language would you like to generate test data?: en
	- Specify the number of test data records to generate: 200
	- [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: name: [Dickenson plc, GenePoint]
	- [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude' · true


#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": ["zentech", "localtime"],
  "outputFormat": [
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "language": "en",
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "name": ["Dickenson plc", "GenePoint"]
        },
        "pickLeftFields": true
      }
    }
  ]
}

```
---

#### **UseCase 5: I want to create 200 Account records in English, with the `Name` field to only generate data with `Dickenson plc` and `GenePoint`, and Dependent picklist fields `year` as `2000` and `month` as `5`, without populating other fields.** 

##### ***Explore more about dependent picklist handling in fields to consider [here](README.md#field-instructions-for-template)



#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `JSON, CSV`
	- In which language would you like to generate test data?: `en`
	- Specify the number of test data records to generate: `200`
	- [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: `name[Dickenson plc, GenePoint]`, `dp-year: [2000]`, `dp-month: [5]`
	- [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude': `false`

#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "JSON",
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "language": "en",
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "name": ["Dickenson plc", "GenePoint"],
          "dp-year": "2000",
          "dp-month": "5"
        },
        "pickLeftFields": false
      }
    }
  ]
}



```
---
#### **UseCase 6: I want to create 200 Account records including `Dickenson plc`, `GenePoint` values in `Name` and `8239444421` value in `Phone` for each record and other fields populated randomly.** 

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `DI, JSON`
	- In which language would you like to generate test data?: `en`
	- Specify the number of test data records to generate: `200`
	- [Account - fieldsToConsider] Provide field(API names) to be considered for generating data:  `name: [Dickenson plc, GenePoint]`, `phone: [8239444421]`
	- [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider'  nor in 'fields to exclude': `true`
    
    
#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "di",
    "JSON"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "language": "en",
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "name": ["Dickenson plc", "GenePoint"],
          "phone": ["8239444421"]
        },
        "pickLeftFields": true
      }
    }
  ]
}

```
---
#### **UseCase 7: I want to create 200 Account records with random `Name` and `Email` values, while populating all other fields from specified object.** 

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `JSON, CSV`
    - In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
	- [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: `name, email`
	- [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude': `true`


#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    “JSON”,
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
       "language": "en",
       "fieldsToExclude": [],
        "fieldsToConsider": {
            "name": [ ],
            "email": [ ]
        },
        "pickLeftFields": true
      }
    }
  ]
}


```
---
#### **UseCase 8: I want to create 200 Account records with random `Name` and `Email` values excluding all other fields from specified object.**

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `JSON, CSV`
    - In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
	- [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: `name, email`
    - [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude': `false`


#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "JSON",
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
       "language": "en",
       "fieldsToExclude": [],
        "fieldsToConsider": {
            "name": [ ],
            "email": [ ]
        },
        "pickLeftFields": false
      }
    }
  ]
}
```
---
#### **UseCase 9: I want to create 200 Account records with Name as 'ABC Corp', `Email` field's value to be generated randomly, excluding the `Phone` field, and populating all other fields from specified object.**

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `JSON, CSV`
    - In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
	- [Account - fieldsToExclude] Provide fields(API names) to exclude (comma-separated): `phone`
    - [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: `name:[ABC Corp], email`
    - [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider'  nor in 'fields to exclude': `true`

#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    “JSON”,
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
       "language": "en",
       "fieldsToExclude": ["phone"],
        "fieldsToConsider": {
            "name": ["ABC Corp"],
            "email": [ ]
        },
        "pickLeftFields": true
      }
    }
  ]
}

```
---
#### **UseCase 10: I want to create 200 Account records with `Name` set to `ABC Corp` and `Pyramid Construction Inc`, `Email` field's value to be generated randomly, excluding the `Phone` field and, other fields from specified object.** 

#### Steps:
1. Run the command `sf template init` and it will prompted with set of questionnaire on CLI.
2. Provide input via the questionnaire and refer to the default use case for the rest.
    - Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]: `JSON, CSV`
    - In which language would you like to generate test data?: `en`
    - Specify the number of test data records to generate: `200`
    - [Account - fieldsToExclude] Provide fields(API names) to exclude (comma-separated): `phone`
    - [Account - fieldsToConsider] Provide field(API names) to be considered for generating data: `name:[ABC Corp, Pyramid Construction Inc]`, `email`
    - [Account - pickLeftFields] Want to generate data for fields neither in 'fields to consider'  nor in 'fields to exclude': `false`


#### Template:
```bash
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": [
    "JSON",
    "CSV"
  ],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "language": "en",
        "fieldsToExclude": ["phone"],
        "fieldsToConsider": {
          "name": ["ABC Corp", "Pyramid Construction Inc"],
          "email": [ ]
        },
        "pickLeftFields": false
      }
    }
  ]
}

```
---
#### **UseCase 11: In UseCase 2, I have the existing template to generate data for account and contact object. Now I want to generate data for account only.**

##### ***Note: To generate data for a specific object you have to use -s and the object name in generate command and if you want to just generate data for all the sObjects  specified in the template then you can simply use the below command without  -s.

#### Steps:
1. Run the command `sf data generate -t account_data_template  -s account  -a alias`.
---

### Important: 
If you're familiar with our template JSON format, simply copy the existing JSON from UseCases, modify it as needed, and save it in the data_gen > templates folder to generate synthetic test data.





