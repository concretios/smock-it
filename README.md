<p align="center">
  <img src="https://images.squarespace-cdn.com/content/637dc346cd653e686a50c1f5/d2ed870c-7705-44fb-906a-4fe28b64f1f4/smockit-logo.png?content-type=image%2Fpng" alt="Smockit Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v4.0.1-brightgreen" />
  <img src="https://img.shields.io/badge/mock--data-brightgreen" />
  <img src="https://img.shields.io/badge/SF--Plugin--Test%20Data%20Generator-blue" />
</p>

# Smock-it (v4.0.1)

Smock-it is a powerful CLI plugin for generating mock data for Salesforce testing. It simplifies the creation of compliant, relationship-aware test data, allowing developers, QA teams, and admins to quickly generate and manage realistic datasets directly within their Salesforce orgs.

Want to get started with Smock-it?  [**Quick Start Guide**](https://github.com/concretios/smock-it/wiki/Quick-Start-Guide).

---

## What’s New in v4?

Smock-it v4 introduces advanced relationship handling, default Salesforce process templates, and major enhancements that make data generation more scalable, structured, and enterprise-ready.

### 1. relatedSObjects: Parent-to-Child Data Generation
Smock-it v4 introduces the new **relatedSObjects** key, enabling true parent-to-child data generation.

This enhancement ensures proper hierarchy handling when child sObjects depend on parent records. It supports multi-level relationships such as **Account → Contact → Opportunity → …**, and allows defining any number of related sObjects within a single template. Org-level validations ensure relationship integrity during generation.

---

### 2. Data Generation Using Default Templates
Smock-it now supports predefined **default templates** for common Salesforce processes, enabling faster and more standardized data generation.

Available default templates include:
- **Sales Process** 
- **Taskray**   
- **CPQ**   
- **Health Cloud**   

These templates reduce setup effort and align generated data with real Salesforce business workflows.

---

### 3. Command Enhancements for Related sObjects
Smock-it v4 introduces enhanced command support for managing related sObjects using the new **-k flag**.

- **Upsert related sObjects**
``` 
   sf smockit template upsert -t <templateName> -s Account/Contact -k Opportunity
```
- **Remove related sObjects**
``` 
   sf smockit template remove -t <templateName> -s Account/Contact -k Opportunity
```
   These commands support upsert and remove operations using “/” notation for relatedSObjects, making template management more flexible and intuitive.

---

### 4\. Template Initialization Improvements

Smock-it v4 enhances the template init command to support default and guided template creation.
  - **Initialize specific default templates:**
  ``` 
   sf smockit template init [--default] [--salesprocess] [--taskray] [--cpq] [--healthcloud]
  ```
   - **Initialize all default templates:**
  ```
   sf smockit template init --all
  ```
   - **Initialize a custom template interactively by answering questions:**
  ``` 
   sf smockit template init
  ```

---

### 5\. Enhanced Picklist & Validation Handling

Smock-it v4 improves handling of multi-select picklists and dependent picklists.

Dependent picklist validation is now automatic, removing the need for the earlier  ``` dp- ``` prefix.

---

### 6\. Structured Output for Related Data

Generated data now includes:
   - **Structured output JSON**
   - **Organized output tables for related sObjects**

This makes it easier to validate, debug, and reuse generated datasets across environments.

---

## Key Challenges Solved

Smock-it v4 removes major Salesforce test-data challenges while scaling for complex enterprise data models.

### 1\. Relationship-Aware Data Reuse Across Orgs

Smock-it allows consistent generation and reuse of hierarchical datasets across multiple orgs, ensuring relationship integrity and repeatability in every environment.

### 2\. Process-Aligned, Realistic Data Generation
With default templates and enhanced validation, Smock-it generates data that mirrors real Salesforce business processes, making it highly suitable for QA, UAT, and automation testing.

### 3\. Faster, Scalable Data Generation

Smock-it v4 continues to deliver high-speed data generation with no external API dependencies, supporting large-scale datasets while maintaining structure, accuracy, and reliability.

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

While creating the template through template init, you will be prompted with questions to fully customize your template based on your test data needs. Alternatively, this can now also be done using the promptify command, where you simply provide your requirements in natural language, and after a few quick checks, a template will be generated automatically.

For a complete guide on template creation using `template init`, please refer to [Template Init Questionnaire](https://github.com/concretios/smock-it/wiki/Template-Init-Questionnaire).<br>

For template creation using promptify, visit the [Promptify Guide](https://github.com/concretios/smock-it/wiki/Promptify).

Below is an example template:

```json  
{
  "namespaceToExclude": [],
  "outputFormat": ["di", "json"],
  "count": 1,
  "sObjects": [
    {
      "Account": {
        "count": 1,
        "fieldsToConsider": {
        "name": ["John"]
        },
        "fieldsToExclude": ["fax"],
        "pickLeftFields": true,
        "relatedSObjects": [
          {
            "Contact": {
              "count": 1,
              "fieldsToConsider": {
               "LastName": ["Smith"],    
               "email": ["smith@gmail.com"]
               },
              "fieldsToExclude": [],
              "pickLeftFields": true
            }
          }
        ]
      }
    },
    {
      "Lead": {
        "count": 1,
        "fieldsToConsider": {},
        "fieldsToExclude": [],
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

> **📌 Important Migration Notice**  
> All `sf template` and `sf data` commands are being deprecated in favor of the new `sf smockit` namespace.  
> See the [Legacy Command Migration](#legacy-command-migration) section below for a complete mapping.


#### 1\. Create Template 

Create fresh template for data generation. [Read more](https://github.com/concretios/smock-it/wiki/Template-Init-Command)

``` 
sf smockit template init [--default] [--salesprocess] [--taskray] [--cpq] [--healthcloud]
```

#### 2. Generate Template and Data via Prompt

Generate template and data using natural language. [Read more](https://github.com/concretios/smock-it/wiki/Promptify)

```bash
sf smockit promptify
```
>Note: This command combines both template creation and data generation into a single step—no need to run multiple commands. Based on your requirements, you can choose to generate data immediately by answering “yes,” or save the template for future use.

#### 3\. Validate Template

Check data generation template for correctness. [Read more](https://github.com/concretios/smock-it/wiki/Template-Validate-Command)

``` 
sf smockit template validate -t <templateFileName> -a <aliasorUsername>
```

#### 4\. Generate Data

Generate and/or insert data based on the objects and settings defined within the template. [Read more](https://github.com/concretios/smock-it/wiki/Data-Generate-Command)

``` 
sf smockit data generate -t <templateFileName> -a <aliasorUsername>
```

**Note:** The alias name or username of the Salesforce Org is required.

#### 5\. Data Upload

Upload generated data (CSV, JSON) to multiple orgs. [Read more](https://github.com/concretios/smock-it/wiki/Data-Upload-Command)

``` 
sf smockit data upload -u <filename.json> -a <alias_or_username> -s <sObject>
```

**Note**: Make sure to append the filename with .json or .csv to upload the data.

#### 6\. Print Template

Review the template configuration before using it to generate data in read-only. [Read more](https://github.com/concretios/smock-it/wiki/Template-Print-Command)

``` 
sf smockit template print -t <templateFileName>
```

#### 7\. Upsert Configurations

Modify or add configuration to an existing template. [Read more](https://github.com/concretios/smock-it/wiki/Template-Upsert-Command)

``` 
sf smockit template upsert -t <templateFileName> [-s <sObject>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>] [-k <relatedSObjects>]
```

#### 8\. Remove Configurations

Remove specific configurations from an existing data generation template. [Read more](https://github.com/concretios/smock-it/wiki/Template-Remove-Command)


``` 
sf smockit template remove -t <templateFileName> [-s <sObject>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>] [-k <relatedSObjects>]
```

## Flags

| Flag | Short Hand | Flag Name | Description |
| ----- | ----- | ----- | ----- |
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
| `--recordType` | `-r` | recordType | Generate data for a specific Record Type for specified object by passing its name with the -r flag. |
| `--relatedSObjects` | `-k` | relatedSObjects | This flag ensures proper generation hierarchy when child sObjects are related to a parent. |
| `--default` |  | Default Template | Creates a default template. |
| `--salesprocess` |  | Default Template | Creates a sales process template. |
| `--taskray` |  | Default Template | Creates a taskray template. |
| `--cpq` |  | Default Template | Creates a CPQ template. |
| `--healthcloud` |  | Default Template | Creates a health cloud template. |
| `--all` |  | Default Template | Creates all default templates. |

## Legacy Command Migration

> **⚠️ Deprecated Commands**  
> The following commands are deprecated and will be removed in a future version. Please update your scripts to use the new `sf smockit` commands.

| Legacy Command | New Command |
| :------------ | :---------- |
| `sf template init` | `sf smockit template init` |
| `sf template validate` | `sf smockit template validate` |
| `sf template generate` | `sf smockit data generate` |
| `sf data upload` | `sf smockit data upload` |
| `sf template print` | `sf smockit template print` |
| `sf template upsert` | `sf smockit template upsert` |
| `sf template remove` | `sf smockit template remove` |


## Smock-it GitHub Action

Integrate Smock-it within the DevOps pipeline. [Read more](https://github.com/concretios/smock-it/wiki/Smock%E2%80%90It-GitHub-Action)

## Command Help

To access command help:
 
``` 
sf <template/data> <command> --help
```

