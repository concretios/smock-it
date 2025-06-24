
<p align="center">
  <img src="https://images.squarespace-cdn.com/content/637dc346cd653e686a50c1f5/d2ed870c-7705-44fb-906a-4fe28b64f1f4/smockit-logo.png?content-type=image%2Fpng" alt="Smockit Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v3.0.2-brightgreen" />
  <img src="https://img.shields.io/badge/mock--data-brightgreen" />
  <img src="https://img.shields.io/badge/SF--Plugin--Test%20Data%20Generator-blue" />
</p>

# Smock-it (v3.0.2)

Smock-it is a powerful CLI plugin, a tool for generating mock data for Salesforce testing. It simplifies the creation of compliant, relationship-aware test data, allowing developers, QA teams, and admins to quickly generate and use unique datasets directly within their Salesforce orgs.

Want to get started with Smock-it?  [**Quick Start Guide**](https://github.com/concretios/smock-it/wiki/Quick-Start-Guide).

## What\`s New in v3?

Smock-it v3 brings smarter, faster test data generation for Salesforce, with:

### 1\. Exclude Specific Objects from Data Generation
Smock-it v3.0.2 introduces the `excludeSObjects` flag (`-z`), allowing you to skip specific SObjects from data generation — even if they're defined in your saved template. This is helpful when you have a large template with multiple objects but want to generate data for only a few at a time, without modifying the original template.

### 2\. Record Type-Specific Data Generation 
Now you can generate data for specific record types using the new `--recordType` (`-r`) flag. This is especially useful when an object like Account has multiple record types but you only want to include a few relevant fields tied to a particular type. Define the record type directly in your data generation command.

>Note: Only users with the `System Administrator` profile are allowed to generate data for specific record types.

### 3\. Advanced Conditional Data Handling 
With v3.0.2, Smock-it adds greater flexibility to how data is distributed across fields. Suppose you're generating 20 records for an object like **Opportunity** — you can now apply conditional logic to split records across specific field values. For example, generate 15 records where `StageName` is set to **Closed Won** and another 5 where it's **Closed Lost**. This level of control can be applied directly at the object level within your template.

### 4\. Native Data Library

Smock-it has removed its dependency on Mockaroo and now includes its own data library **(v0.0.3)**, enabling the generation of 100% unique data — up to 300K records — while complying with Salesforce standard duplicate rules.

### 5\. Realistic Address Mapping

When generating location-based data, Smock-it intelligently associates countries with their respective states and cities, ensuring the data is both logical and realistic.

### 6\. Text & Number Generation

Using advanced, context-aware algorithms, it generates realistic names, industries, emails, currencies, and other text-based data. This ensures that your test data closely mirrors real-world scenarios, enhancing its authenticity and reliability.

### 7\. Upload Generated Data to Multiple Orgs

The new data upload feature allows users to upload generated datasets to different orgs using the username or alias. This makes it seamless for teams to test across environments with the exact same dataset.

## Key Challenges Solved

Smock-it removes the biggest roadblocks Salesforce professionals face when managing and generating test data. 

### 1\. Reuse Data Across Multiple Orgs

Smock-It lets you easily upload and reuse generated data across different orgs, making it seamless for teams to test with the same dataset. This ensures consistency and accuracy across environments.

### 2\. Realistic data generation

QAs need test data that looks realistic, and Smock-It delivers just that. The data it generates isn’t just random numbers or text; it’s context-aware, logically correct, and closely resembles real-world scenarios. This ensures that the data is not only realistic but also meaningful.

### 3\. Data Generation Speed & Usage Limit

With no API dependencies, data generation time has drastically reduced, from approximately 15 minutes for 200,000 records to just 2 minutes. It also removes previous limitations, allowing unlimited data generation per day.

## Installation

### Prerequisites

Before installing Smock-it, ensure you have the following:

* Salesforce CLI  
* Node.js (v18.0.0 or later)

### Install Smock-it

Run the following command in your terminal to install Smock-it as a Salesforce CLI plugin:

   ``` 
   sf plugins install smock-it
   ```

### Verify the Installation

To confirm that Smock-it was installed successfully, run the below command. This will list all installed plugins, including Smock-it.

``` 
sf plugins
```

### Update Smock-it

Keep Smock-it up to date with the latest enhancements by running:

``` 
sf plugins update
```

## Directory Structure

When running template init command, the following directories are automatically created in your current working directory (if they don’t already exist). These directories help to organize your output test data and template configurations, making it easier to manage and reuse:

```html
PROJECT_BASE/ 
├── data_gen/
│   ├── templates/ 			 	  #refer to template structure
│   │   ├ createAccount.json
│   ├── output/ 				  #refer to Output
│   │   ├ CreateAccount_DI_Ouput.json
│   │   ├ CreateAccount_CSV_Ouput.csv
│   │   ├ CreateAccount_JSON_Ouput.json
```

## Template Structure

While creating the template (template init), you will be prompted with questions to fully customize your template based on your test data needs.  For a complete guide, please refer to [Template Init Questionnaire](https://github.com/concretios/smock-it/wiki/Template-Init-Questionnaire)..

Below is an example template:

```json  
{      
  "namespaceToExclude": ["testGen"],    
  "outputFormat": [    
    "di",    
    "csv",    
    "json"    
  ],    
  "count": 200,    
  "sObjects": [    
    {    
       "account": {    
        "count": 50,    
        "fieldsToExclude": ["fax"],    
        "fieldsToConsider": {    
          "name": [],    
          "email": [],    
          "dp-country__c": ["USA"],    
          "dp-state__c": ["California"]    
        },    
        "pickLeftFields": true    
      }    
    }    
  ]    
}

```  
 For more on Template Use Cases, Please refer [Common Template Use Cases](https://github.com/concretios/smock-it/wiki/Common-Template-Use-Cases).

## Output

Smock-it generates output based on the format provided in the template configuration file. Currently it supports csv, json and DI format where DI means Direct Insert into your Salesforce org.

## Smock-it Commands 

#### 1\. Create Template 

Create fresh template for data generation. [Read more](https://github.com/concretios/smock-it/wiki/Template-Init-Command)

⚠️ Warning: The template create command 'sf template init [--default]' will be deprecated soon. Use

``` 
sf smockit template init [--default]
```

#### 2\. Validate Template

Check data generation template for correctness. [Read more](https://github.com/concretios/smock-it/wiki/Template-Validate-Command)

⚠️ Warning: The template validate command 'sf template validate' will be deprecated soon. Use

``` 
sf smockit template validate -t <templateFileName> -a <aliasorUsername>
```

#### 3\. Generate Data

Generate and/or insert data based on the objects and settings defined within the template. [Read more](https://github.com/concretios/smock-it/wiki/Data-Generate-Command)

⚠️ Warning: The template generate command 'sf template generate' will be deprecated soon. Use

``` 
sf smockit data generate -t <templateFileName> -a <aliasorUsername>
```

**Note:** The alias name or username of the Salesforce Org is required.

#### 4\. Data Upload

Upload generated data (CSV, JSON) to multiple orgs. [Read more](https://github.com/concretios/smock-it/wiki/Data-Upload-Command)

⚠️ Warning: The template upload command 'sf data upload' will be deprecated soon. Use

``` 
sf smockit data upload -u <filename.json|filename.csv> -a <alias_or_username> -s <sObject>
```

**Note**: Make sure to append the filename with .json or .csv to upload the data.

#### 5\. Print Template

Review the template configuration before using it to generate data in read-only. [Read more](https://github.com/concretios/smock-it/wiki/Template-Print-Command)

⚠️ Warning: The template print command 'sf template print' will be deprecated soon. Use

``` 
sf smockit template print -t <templateFileName>
```

#### 6\. Upsert Configurations

Modify or add configuration to an existing template. [Read more](https://github.com/concretios/smock-it/wiki/Template-Upsert-Command)

⚠️ Warning: The template upsert command 'sf template upsert' will be deprecated soon. Use

``` 
sf smockit template upsert -t <templateFileName> [-s <sObject>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
```

#### 7\. Remove Configurations

Remove specific configurations from an existing data generation template. [Read more](https://github.com/concretios/smock-it/wiki/Template-Remove-Command)

⚠️ Warning: The template remove command 'sf template remove' will be deprecated soon. Use

``` 
sf smockit template remove -t <templateFileName> [-s <sObject>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
```

## Flags

| Flag | Short Hand | Flag Name | Description |
| ----- | ----- | ----- | ----- |
| `--default` |  | Default Template | Creates a default template. |
| `--templateName` | `-t` | Template Name | Specify the name of the data template to be utilized. The template must exist in the `data_gen/templates` directory. |
| `--count` | `-c` | Count | Set the number of records to generate. If `--sObject` or `-s` is provided, this will only update or remove the count for that object. |
| `--namespaceToExclude` | `-x` | Namespace to Exclude | Exclude specific namespaces from generating record data for namespace fields. Multiple namespaces can be separated by commas. |
| `--outputFormat` | `-f` | Output Format | Define the output format(s) for generated data (e.g., CSV, JSON, DI). Multiple formats can be specified, separated by commas. |
| `--sObject` | `-s` | Specific Object | Target a specific object and override its existing settings. If not found in the template, an "add object" prompt will appear. |
| `--upload` | `-u` | Upload |The -u command is used to upload the generated JSON or CSV data into the target Salesforce org. |
| `--fieldsToExclude` | `-e` | Fields to Exclude | Exclude specific fields from test data generation for a given object. Applies only at the object level. |
| `--fieldsToConsider` | `-i` | Fields to Consider | Include specific fields from test data generation for a given object. This applies only at the object level, with the specified values. |
| `--pickLeftFields` | `-p` | Pick Left Fields | If true, generates data for all fields except those listed in `FieldsToExclude`. If false, generates data only for the fields specified in `FieldsToConsider`. |
| `--aliasOrUserName` | `-a` | Alias Or UserName | This flag is required when using the validate and data generate commands. It accepts a username or alias name and only supports orgs listed in the Salesforce Org List. |
| `--excludeSObjects` | `-z` | ExcludesObjects |This flag skips a specific SObject during data generation, even if it's included in the template file. |
| `--recordType` | `-r` | recordType | Generate data for a specific Record Type of for specified object by passing its name with the -r flag. |


## Smock-it GitHub Action

Integrate Smock-it within the DevOps pipeline. [Read more](https://github.com/concretios/smock-it/wiki/Smock%E2%80%90It-GitHub-Action)

## Command Help

To access command help:
 
``` 
sf <template/data> <command> --help
```

