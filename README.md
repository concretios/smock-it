
<p align="center">
  <img src="https://images.squarespace-cdn.com/content/637dc346cd653e686a50c1f5/d2ed870c-7705-44fb-906a-4fe28b64f1f4/smockit-logo.png?content-type=image%2Fpng" alt="Smockit Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.0.0-brightgreen" />
  <img src="https://img.shields.io/badge/mock--data-brightgreen" />
  <img src="https://img.shields.io/badge/SF--Plugin--Test%20Data%20Generator-blue" />
</p>




# Smock-it (v2.0.0)
**A Salesforce CLI Plugin to simplify synthetic data generation for Salesforce.**


## Overview
Smock-it is a fast, lightweight, and feature-rich Salesforce CLI plugin built to revolutionize test data generation. Effortlessly create realistic, customizable synthetic data tailored to complex Salesforce schemas and industry-specific needs. Whether you're testing simple configurations or intricate Salesforce setups, Smock-it empowers you with unmatched flexibility, precision, and ease - turning test data creation into a seamless experience. Perfect for developers, QAs and admins alike, smock-it ensures your data is always one step ahead!

---

## What`s New in v2.0.0 🚀

- **Enhanced Template Creation**: Greater customization and flexibility, enabling users to specify fields to include or exclude (`fieldsToConsider`, `fieldsToExclude`) and control data generation behavior (`pickLeftFields`) for precise and reliable test scenarios tailored to specific needs.  
- **Simplified Authentication**: The `-a` (aliasOrUserName) flag replaces the need for environment variables like `SALESFORCE_USERNAME`, `SALESFORCE_SECURITY_TOKEN`, and `SALESFORCE_PASSWORD`. It is required for the `validate` and `data generate` commands and accepts a username or alias from the Salesforce Org List, simplifying authentication.  
- **Generate Records Like Never Before!**: Say goodbye to the 1,000-record limit! Now, you can generate a significantly larger number of records across all output formats - CSV, JSON, and DI, giving you the flexibility to handle more extensive test data requirements with ease.  
- **Automatic Field Inclusion**: If required fields for your object are missing, the system automatically identifies and includes them, ensuring that all necessary fields are present and data generation is seamless.  




---

## Key Challenges solved
Smock-it addresses critical challenges faced by Saleforce Professionals in managing and generating mock data for their environments. Here are the key pain points Smock-it solves:

- **Privacy and Compliance**: Avoids the use of real customer data, ensuring GDPR and CCPA compliance by generating synthetic, privacy-safe test data.
- **Time-Consuming Data Creation**: Automates the generation of complex, relationship-driven Salesforce data, saving time and reducing manual effort.
- **Salesforce Schema Complexity**: Handles Salesforce’s complex schema, including custom objects and relationships, ensuring accurate data generation.
- **Customization and Flexibility**: 
     - **fieldsToConsider** - Enable precise test data customization by configuring specific fields at the object level, ensuring defined values apply exclusively to the targeted object for accurate and reliable scenarios.
     - **fieldsToExclude** - Allow exclusion of specific fields during data creation, ensuring they are omitted from the generated test data for precise control over test scenarios.
     - **pickLeftFields** - If set to true, generates data for all fields except those in FieldsToExclude. If false, generates data only for the fields in FieldsToConsider.

---

# Installation

#### Prerequisites
- **Salesforce CLI**
- **Node.js (v18.0.0 or later)**
- **Mockaroo API Key**
#### Commands
1. **Install**:
   ```bash
   sf plugins install smock-it
   ```
2. **Update**:
   ```bash
   sf plugins update
   ```
3. **Verify successful installation run**
   ```bash
    sf plugins
   ```
### Environment Variables
Smock-it relies on this environment variable:
- **For Windows**
   ```bash
   $env:MOCKAROO_API_KEY="your_mockaroo_api_key"
   ```
- **For MacOS**
   ```
   export MOCKAROO_API_KEY="your_mockaroo_api_key"
   ```

 > Obtain your Mockaroo API key from [Mockaroo](https://www.mockaroo.com/sign-up).



---

## Directory Structure
The following directories are created(if doesn't already exist) on current working directory when using Smock-it:

- **data_gen**
  - **templates**: Stores data templates for test data generation.
  - **output**: Contains generated data and record insertion details.
---


## Template Structure
The ```sf template init``` command generates a data template based on the values provided in the questionnaire.
```json
{
  "templateFileName": "default_data_template.json",
  "namespaceToExclude": [],
  "outputFormat": ["csv"],
  "language": "en",
  "count": 1,
  "sObjects": [
    { "account": {} },
    { "contact": {} },
    {
      "lead": {
        "language": "en",
        "count": 5,
        "fieldsToExclude": ["fax", "website"],
        "fieldsToConsider": {
          "country": ["India", "USA"], 
          "dp-year__c": ["2024"], 
          "dp-month__c": ["March"],
          "email": []
        },
        "pickLeftFields": true
      }
    }
  ]
}
```
> For more on Template Use Cases, Please refer - **[SAMPLES.md](SAMPLES.md)**

#### Field Instructions (for Template)

- **Fax & Website**: These fields are excluded from data generation in this template, so no data will be created for them.
- **Country**: Data will only be generated for the specified countries, `India` and `USA`. No other country values will be included in the data generation process for this field.
- **Email**: As no specific values are provided for the Email field, random email values will be generated automatically during the data creation process.
- **dp-Year__c**: This is a controlling field (parent field) for a dependent picklist. It will always have the fixed value `2024` during data generation.
- **dp-Month__c**: This is a dependent field linked to `dp-Year__c`. It will generate data using the specified value `March`, and only this value will be used for this field.

     - **Dependent Picklists**: The order of dependent picklists matters. The controlling field (`dp-Year__c`) must come before the dependent field (`dp-Month__c`) in the template.
     - **Field Prefix**: All fields that are part of a dependent picklist must start with the prefix `dp-`. 
     - **dp- Fields**: Fields with the `dp-` prefix must have either no value assigned or a single predefined value. Multiple values for these fields will not be considered.



---


## Commands

1. **Initialize Template**: This command initializes a new data generation template. It sets up the required directory structure, prompts for a valid template file name, and collects configuration details for Salesforce objects (such as fields to exclude and record counts). The configuration is validated against org before it is saved to a JSON file.

   ```bash
   sf template init [--default]
   ```
 

2. **Upsert Configurations**: This command allows users to add or update configuration settings in an existing data template. Users can specify options like the Salesforce object, language, record count, fields to exclude, and other settings. 
If the object is not already present, the command will prompt users to add it.

   ```bash
   sf template upsert -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
   ```
   
3. **Remove Configurations**: This command allows users to remove specific configurations from an existing data template. It can remove settings like record count, language, namespaces, output format, and fields to exclude.However record count and language cannot be removed globally, and at least one output format is required.
   ```bash
   sf template remove -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
   ```
   
4. **Validate Template**: This command validates a data generation template file, ensuring that it is correctly configured for Salesforce. It checks the template for correctness, connects to Salesforce (using environment variables for credentials), and logs any warnings or errors found in the template's configuration. This step ensures that all objects, fields, and settings are properly defined before use. It requires the alias name or username of the Salesforce Org to execute the command and only accepts org listed in the Salesforce Org list.

   ```bash
   sf template validate -t <templateFileName> -a <aliasorUsername>
   ```

   
5. **Generate Data**: The generate command reads a Salesforce data generation template and generates data based on the objects and settings defined within it. It also excludes the  fields from the data template file that have been specified, ensuring that unwanted fields are omitted from the generated records. This command is designed to facilitate the creation of tailored datasets for Salesforce objects. It requires the alias name or username of the Salesforce Org to execute the command and only accepts org listed in the Salesforce Org list.

   ```bash
   sf data generate -t <templateFileName> -a <aliasorUsername>
   ```
6. **Print Template**: This command retrieves and displays the contents of a specified Salesforce data generation template. It is useful for reviewing the configuration before using it to generate data.

   ```bash
   sf template print -t <templateFileName>
   ```
---

## Flags

| Flag                 | Short Hand | Flag Name             | Description                                                                                                                                 |
|----------------------|------------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `--default`          |            | Default Template      | Creates a default template.                                                                                                                 |
| `--templateName`     | `-t`       | Template Name         | Specify the name of the data template to be utilized. The template must exist in the `data_gen/templates` directory.                        |
| `--count`            | `-c`       | Count                | Set the number of records to generate. If `--sObject` or `-s` is provided, this will only update or remove the count for that object.       |
| `--namespaceToExclude` | `-x`    | Namespace to Exclude | Exclude specific namespaces from generating record data for namespace fields. Multiple namespaces can be separated by commas.              |
| `--language`         | `-l`       | Language             | Select the language (`en` or `jp`). When `--sObject` or `-s` is specified, this updates or removes the language setting for that object.    |
| `--outputFormat`     | `-f`       | Output Format        | Define the output format(s) for generated data (e.g., CSV, JSON, DI). Multiple formats can be specified, separated by commas.               |
| `--sObject`          | `-s`       | Specific Object      | Target a specific object and override its existing settings. If not found in the template, an "add object" prompt will appear.             |
| `--fieldsToExclude`  | `-e`       | Fields to Exclude    | Exclude specific fields from test data generation for a given object. Applies only at the object level.                                    |
| `--fieldsToConsider`  | `-i`       | Fields to Consider    | Include specific fields from test data generation for a given object. This applies only at the object level, with the specified values                                    |
| `--pickLeftFields`  | `-p`       | Pick Left Fields    |     If true, generates data for all fields except those listed in FieldsToExclude. If false, generates data only for the fields specified in FieldsToConsider.
| `--aliasOrUserName`  | `-a`       | Alias Or UserName    |    This flag is required when using the validate and data generate commands. It accepts a username or alias name and only supports orgs listed in the Salesforce Org List.

---

## Command Help
To access command help:
```bash
sf <template/data> <command> --help
```
---



## References
- [Mockaroo API Documentation](https://www.mockaroo.com/docs)
- [Salesforce CLI Setup Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
- [Salesforce Plugin Installation Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_plugin.htm)
