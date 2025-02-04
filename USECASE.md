# Smock-It Use Case Guide

Understand various use cases to effectively leverage Smock-It CLI for test data generation. By following these use cases, learn how to:

* Generate test data for various Salesforce objects.
* Customize field selections using fieldsToConsider and fieldsToExclude.  
* Apply object-specific configurations, such as record count and predefined values.  
* Define output formats including CSV, JSON, and Direct Insertion (DI) into Salesforce.  
* Auto-populate dependent fields and ensure parent-child relationships are correctly assigned.

### Use Case 1: Create 200 records for Account, Contact, and Opportunity with output in DI and JSON formats. 

### Steps to Execute

1. Run the command ```sf template init``` on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): ```accountDataTemplate``` 
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB): `N/A`
   * Select output format \[csv, json, di\]: `di, json`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `200`
   * List Objects(API names) for data creation (default: lead): `account, contact, opportunity`
   * Customize settings for individual sObjects? (Y/n) (default: n): `n`
   * Validate added sObjects and fields from your org?(Y/n) (default: n): `n`

### Template Generated

```json
{
  "templateFileName": "accountDataTemplate_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json"],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {}
    },
    {
      "contact": {}
    },
    {
      "opportunity": {}
    }
  ]
}
```

> Important : ⚠️ Once the schema is configured as per requirements, use the `sf data generate` command with the template name and alias/username: **sf data generate \-t accountDataTemplate\_data\_template \-a alias/username** If validation is skipped, Smock-It automatically performs it during data generation.

### Use Case 2: Create 150 Account, 50 Lead records in English, applying sObject settings

### Steps to Execute

1. Run the command `sf template init` on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account_leadTemplate` 
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB): `N/A`
   * Select output format \[csv, di, json\]: `di, json` 
   * Choose a language for test data: en
   * Specify test data count (e.g, 5\) (default: 1): `200`
   * List Objects(API names) for data creation (default: Lead): `account, lead`
   * Customize settings for individual sObjects? (Y/n) (default: n): `y`
   * Override the global settings for object    `account`
   * \[account \- count\] Set number of records: `150`  
   * \[account \- language\] Specify language: `en`  
   * \[account \- fieldsToExclude\] List fields (API names) to exclude:  `N/A`
   * \[account \- fieldsToConsider\] List fields (API names) to include:  `N/A` 
   * \[account \- pickLeftFields\] Want to generate data for fields neither in 'fields toConsider' nor in 'fieldstoExclude': `true`  
   * Override the global settings for another object (API name):  `y`
   * Override the global settings for object  `lead`
   * \[lead \- count\] Set number of records: `50`  
   * \[lead \- language\] Specify language: `en`  
   * \[lead \- fieldsToExclude\] List fields (API names) to exclude:  `N/A`
   * \[lead \- fieldsToConsider\] List fields (API names) to include: `N/A`
   * \[lead \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`  
   * Override the global settings for another object(default:n): `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "account_leadTemplate_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json"],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {
        "count": 150,
        "language": "en",
        "pickLeftFields": true
      }
    },
    {
      "lead": {
        "count": 50,
        "language": "en",
        "pickLeftFields": true
      }
    }
  ]
```
### Use Case 3: Generate 200 Account and Contact records in CSV, JSON, and DI formats

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account_contact_Template`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `200`
   * List Objects(API names) for data creation (default: Lead): `account, contact`
   * Customize settings for individual sObjects: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "account_contact_Template_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 200,
  "sObjects": [
    {
      "account": {}
    },
    {
      "contact": {}
    }
  ]
}
```

> Important  ⚠️  If Contact has a parent relationship with Account and the account exists in the org, it will be automatically mapped to the Contact. If no matching account is found, a new Account will be created and mapped to the Contact.  

### Use Case 4: Generate 50 Account data with phone, email, fax, and city fields only. 

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account_limited`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   
   * Select output format \[csv, di, json\]: `di, json ` 
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `50`
   * List Objects(API names) for data creation (default: lead): `account`
   * Customize settings for individual sObjects: `y`  
   * Override the global settings for sObjects:  `account`
   * \[account \- count\] Set number of records:`N/A`  
   * \[account \- language\] Specify language: `en`  
   * \[account \- fieldsToExclude\] List fields (API names) to exclude:  `N/A`
   * \[account \- fieldsToConsider\] List fields (API names) to include: `phone, email, fax, city`  
   * \[account \- pickLeftFields\] Want to generate data for fields neither in       'fieldsToConsider' nor in 'fieldsToExclude': `false`  
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `y`  
   * Enter the alias name or username for the Salesforce org you wish to connect: `username/alias`

### Template Generated

```json
{
  "templateFileName": "account_limited_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json"],
  "language": "en",
  "count": 50,
  "sObjects": [
    {
      "account": {
        "fieldsToConsider": {
          "name": [],
          "email": [],
          "fax": [],
          "city": []
        },
        "pickLeftFields": false
      }
    }
  ]
}
```
### Use Case 5: Generate 10 ‘closed-won’ opportunities records & pick all left fields(for which data will be generated randomly).

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `closedwon_opportunity`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   `N/A`
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `10`
   * List Objects(API names) for data creation (default: lead): `opportunity`
   * Customize settings for individual sObjects: `y`  
   * Override the global settings for sObjects: `opportunity`
   * \[opporunity \- count\] Set number of records: `N/A`
   * \[opportunity \- language\] Specify language: `en`
   * \[opportunity \- fieldsToExclude\] List fields (API names) to exclude: `N/A`
   * \[opportunity \- fieldsToConsider\] List fields (API names) to include: `stage: [closed-won]`
   * \[opportunity \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldstoExclude': `true`  
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `y ` 
   * Enter the alias name or username for the Salesforce org you wish to connect: `username/alias`

### Template Generated

```json{   
  "templateFileName": "closedwon_opportunity_data_template.json",  
  "namespaceToExclude": [],  
  "outputFormat": ["di", "json", "csv"],  
  "language": "en",  
  "count": 10,  
  "sObjects": [  
    {  
      "opportunity": {  
        "fieldsToConsider": {  
          "stage": ["closed-won"]  
        },  
        "pickLeftFields": true  
      }  
    }  
  ]  
}
```
### Use Case 6: Generate 10 ‘closed-won’ opportunities with Amount of $10000 along with other fields.

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `opportunity_annualrevenue`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):`N/A`   
   * Select output format \[csv, di, json\]:` di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `10`
   * List Objects(API names) for data creation (default: Lead): opportunity
   * Customize settings for individual sObjects: `y`  
   * Override the global settings for object: ` opportunity`
   * \[opportunity \- count\] Set number of records:
   * \[opportunity \- Language\] Specify language: en
   * \[opportunity \- fieldsToExclude\] List fields (API names) to exclude:
   * \[opportunity \- fieldsToConsider\] List fields (API names) to include: `stage: [closed-won], amount: [10000]`
   * \[opportunity \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`  
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "opportunity_annualrevenue_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 10,
  "sObjects": [
    {
      "opportunity": {
        "fieldsToConsider": {
          "stage": ["closed-won"],
          "amount": ["10000"]
        },
        "pickLeftFields": true
      }
    }
  ]
}
```
### Use Case 7: Generate 5 Account records with all fields randomly populated except for accountsource, which should be excluded from data generation.

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account_exclude_accountsource`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):`N/A`   
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `5`
   * List Objects(API names) for data creation (default: lead): `account`
   * Customize settings for individual sObjects: `n`
   * \[account \- count\] Set number of records:`N/A`
   * \[account \- language\] Specify language: `en`
   * \[account \- fieldsToExclude\] List fields (API names) to exclude: accountsource: `N/A`
   * \[account \- fieldsToConsider\] List fields (API names) to include:`N/A`
   * \[ account \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "account_exclude_billing_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 5,
  "sObjects": [
    {
      "account": {
        "fieldsToExclude": ["billing_address"],
        "pickLeftFields": true
      }
    }
  ]
}
``` 

### Use Case 8: Generate 5 Account records with all fields randomized, excluding industry, and setting phone to predefined values.

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `5`
   * List Objects(API names) for data creation (default: lead): `account`
   * Customize settings for individual sObjects: `n`
   * \[account \- count\] Set number of records:`N/A`
   * \[account \- language\] Specify language: `en`
   * \[account \- fieldsToExclude\] List fields (API names) to exclude: `industry`
   * \[account \- fieldsToConsider\] List fields (API names) to include: `phone: [9090909090]`
   * \[ account \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`
     
### Template Generated

```json
{
  "templateFileName": "account_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 5,
  "sObjects": [
    {
      "account": {
        "fieldsToConsider": {
          "phone": ["9090909090"]
        },
        "fieldsToExclude": ["industry"],
        "pickLeftFields": true
      }
    }
  ]
}
```
### Use Case 9: Generate 5 Contact records with Account ID as a mandatory field. Auto-populate all remaining fields.

> Important ⚠️  Smock-It automatically picks and associates the parent record from the org if it exists. If no matching parent is found, it creates a new parent record (up to 2 levels) and links it to the 5 newly generated Contacts. Note: Mapping up to 2 levels requires the Grandparent field to be a mandatory field. 

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `contact_with_parent`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `5`
   * List Objects(API names) for data creation (default: lead): `contact`
   * Customize settings for individual sObjects: `y`
   * \[contact \- count\] Set number of records: `N/A`
   * \[contact \- language\] Specify language: `en`
   * \[contact \- fieldsToExclude\] List fields (API names) to exclude: `N/A`
   * \[contact \- fieldsToConsider\] List fields (API names) to include: `N/A`
   * \[ contact \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

###  Template Generated 

```json
{
  "templateFileName": "contact_with_parent_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 5,
  "sObjects": [
    {
      "contact": {
        "pickLeftFields": true
      }
    }
  ]
}
```

### Use Case 10: Generate 5 Contact records without last name.

>  Important ⚠️  If any required fields are excluded, Smock-It generates them  It handles the required field if given to generate data hassle free.

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `contact_with_parent`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):   
   * Select output format \[csv, di, json\]: `di, json, csv`  
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): `5`
   * List Objects(API names) for data creation (default: lead): `contact`
   * Customize settings for individual sObjects: `y`
   * \[contact \- count\] Set number of records: `N/A`
   * \[contact \- language\] Specify language: `en`
   * \[contact \- fieldsToExclude\] List fields (API names) to exclude: `lastname`
   * \[contact \- fieldsToConsider\] List fields (API names) to include: `N/A`
   * \[ contact- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`
   * Override global settings for another object: `n`  
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "contact_with_parent_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 5,
  "sObjects": [
    {
      "contact": {
        "fieldsToExclude": ["lastname"]
      }
    }
  ]
}
```

> Important ⚠️ Records for Account which is a parent to Contact field, will be created first automatically in the org if not created already.  

### Use Case 11: Generate 10 Account, 15 Contact & 5 Opportunity with the below info:

#### Account

* Account Name should always contain any of 3 values: “Concretio”, “ABC corporation”, Ursa Major”  
* Fax should be excluded while generating data  
* Rest all field values should be generated randomly

#### Contact

* Any account from the org should be associated with this contact automatically while   generating data  
* Data should only be generated for given fields: lastname, fax, email, city, phone  
* Lastname should always contain either “John”, “Sam”,or “Mark”

#### Opportunity

*  Data for the opportunity should be generated for all fields.

### Steps to Execute

1. Run the command sf template init on the CLI, and it will prompt you with a questionnaire.
2. Provide Input for the questionnaire
   * Provide a template name (e.g., account\_creation): `account_contact_opportunity`  
   * Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB):`N/A`   
   * Select output format \[csv, di, json\]:` di, json, csv  `
   * Choose a language for test data: `en`
   * Specify test data count (e.g, 5\) (default: 1): 
   * List Objects(API names) for data creation (default: lead): account, contact, opportunity
   * Customize settings for individual sObjects: `y`  
   * Override the global settings for object  ` account `
   * \[account \- count\] Set number of records: `10`
   * \[account \- language\] Specify language: `en`
   * \[account \- fieldsToExclude\] List fields (API names) to exclude: `fax`
   * \[account \- fieldsToConsider\] List fields (API names) to include: name: `[concretio, ABC Corporation, Ursa Major\]` 
   * \[ account \- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true`
   * Override global settings for another object: y
   * Override the global settings for Object: `contact`
   * \[contact \- count\] Set number of records: `15`  
   * \[contact \- language\] Specify language: `en`  
   * \[contact \- fieldsToExclude\] List fields (API names) to exclude: `fax`  
   * \[contact \- fieldsToConsider\] List fields (API names) to include: lastname: \[John,Sam,Mark\],fax,email,city,phone  
   * \[ contact- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': false
   * Override the global settings for object: `opportunity`
   * \[opportunity \- count\] Set number of records:` 5`  
   * \[opportunity \- language\] Specify language: `en  `
   * \[opportunity \- fieldsToExclude\] List fields (API names) to exclude:  `N/A` 
   * \[opportunity \- fieldsToConsider\] List fields (API names) to include:`N/A`  
   * \[ opportunity- pickLeftFields\] Want to generate data for fields neither in 'fieldsToConsider' nor in 'fieldsToExclude': `true ` 
   * Override global settings for another object: `n`
   * Validate the added sObjects and their fields from your org (y/n) (default:n): `n`

### Template Generated

```json
{
  "templateFileName": "account_contact_opportunity_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["di", "json", "csv"],
  "language": "en",
  "count": 10,
  "sObjects": [
    {
      "account": {
        "count": 10,
        "fieldsToConsider": {
          "name": ["Concretio", "ABC Corporation", "Ursa Major"]
        },
        "fieldsToExclude": ["fax"],
        "pickLeftFields": true
      }
    },
    {
      "contact": {
        "count": 15,
        "language": "en",
        "fieldsToConsider": {
          "lastname": ["John", "Sam", "Mark"],
          "fax": [],
          "email": [],
          "city": [],
          "phone": []
        },
        "pickLeftFields": false
      }
    },
    {
      "opportunity": {
        "count": 5,
        "language": "en",
        "pickLeftFields": true
      }
    }
  ]
}
```

