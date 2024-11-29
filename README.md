
# Smocker (v1.0.0)

**A Salesforce CLI Plugin to Simplify Synthetic Data Generation**

## Overview
Smocker is a lightweight yet powerful Salesforce CLI plugin that allows users to generate synthetic data quickly and easily. This tool is specifically designed to streamline the creation of realistic, customizable test data while ensuring compatibility with complex Salesforce schemas and industry-specific requirements.

---
## Key Challenges solved
Smocker addresses critical challenges faced by Saleforce Professionals in managing and generating mock data for their environments. Here are the key pain points Smocker solves:

- **Privacy and Compliance**: Avoids the use of real customer data, ensuring GDPR and CCPA compliance by generating synthetic, privacy-safe test data.
- **Time-Consuming Data Creation**: Automates the generation of complex, relationship-driven Salesforce data, saving time and reducing manual effort.
- **Salesforce Schema Complexity**: Handles Salesforce’s complex schema, including custom objects and relationships, ensuring accurate data generation.
- **Customization and Flexibility**: Provides advanced customization options for field exclusions, record counts, and language preferences, tailored to specific business needs.
---

## Installation

#### Prerequisites
- **Salesforce CLI**
- **Node.js (v18.0.0 or later)**
- **Mockaroo API Key**

#### Commands
1. **Install**:
   ```bash
   sf plugins install smocker-concretio
   ```
2. **Update**:
   ```bash
   sf plugins update
   ```

---

## Directory Structure
The following directories are created(if doesn't already exist) on current working directory when using Smocker:

- **data_gen**
  - **templates**: Stores data templates for test data generation.
  - **output**: Contains generated data and record insertion details.
---

## Environment Variables
Smocker relies on these environment variables:

```bash
SALESFORCE_USERNAME="username@domain.com"
SALESFORCE_SECURITY_TOKEN="your_security_token"
SALESFORCE_PASSWORD="your_password"
MOCKAROO_API_KEY="your_mockaroo_api_key"
```
> Obtain your Mockaroo API key from [Mockaroo](https://www.mockaroo.com/sign-up).

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
        "fieldsToExclude": ["fax", "website"],
        "language": "en",
        "count": 5
      }
    }
  ]
}
```
---

## See Smocker in Action!
Take a look at how Smocker simplifies the complex task of generating Salesforce test data.

[![Smocker Demo Video](https://img.youtube.com/vi/your-video-id/0.jpg)](https://www.youtube.com/watch?v=your-video-id)

## Commands

1. **Initialize Template**: This command initializes a new data generation template. It sets up the required directory structure, prompts for a valid template file name, and collects configuration details for Salesforce objects (such as fields to exclude and record counts). The configuration is validated against org before it is saved to a JSON file.

   ```bash
   sf template init [--default]
   ```
   Watch [this video](https://www.loom.com/share/0b6d8c5285ab4478ae665e8f2f25036e?sid=622e9418-4fe3-4759-ae81-72661339f318) for more detail.

2. **Upsert Configurations**: This command allows users to add or update configuration settings in an existing data template. Users can specify options like the Salesforce object, language, record count, fields to exclude, and other settings. 
If the object is not already present, the command will prompt users to add it.

   ```bash
   sf template upsert -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>]
   ```
   Watch [this video](https://www.loom.com/share/10d70e5e98d84114bb7edea89c80061e?sid=b4719982-4da1-4cd1-b546-50441b8d8117) for more detail.
   
3. **Remove Configurations**: This command allows users to remove specific configurations from an existing data template. It can remove settings like record count, language, namespaces, output format, and fields to exclude.However record count and language cannot be removed globally, and at least one output format is required.
   ```bash
   sf template remove -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>]
   ```
   Watch [this video](https://drive.google.com/file/d/11XvgL7W02JZ89V9TGeAKR39EMVpjqMmB/view) for more detail.
   
4. **Validate Template**: This command validates a data generation template file, ensuring that it is correctly configured for Salesforce. It checks the template for correctness, connects to Salesforce (using environment variables for credentials), and logs any warnings or errors found in the template's configuration. This step ensures that all objects, fields, and settings are properly defined before use.

   ```bash
   sf template validate -t <templateFileName>
   ```
   Watch [this video](https://www.loom.com/share/091b281cd024498dbe3dc56757aae9a2?sid=902eb7ce-87f7-4a6a-ade7-1291715a7aa5) for more detail.
   
5. **Generate Data**: The generate command reads a Salesforce data generation template and generates data based on the objects and settings defined within it. It also excludes the  fields from the data template file that have been specified, ensuring that unwanted fields are omitted from the generated records. This command is designed to facilitate the creation of tailored datasets for Salesforce objects.

   ```bash
   sf data generate -t <templateFileName>
   ```
   Watch [this video](https://www.loom.com/share/e40f8ed647c9495d9c00814189b44c5f?sid=d4982dd9-552b-4284-808e-a924fb36ad89) for more detail.

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
| `--count`            | `-c`       | Count                | Set the number of records to generate. If `--sObject` or `-o` is provided, this will only update or remove the count for that object.       |
| `--namespaceToExclude` | `-x`    | Namespace to Exclude | Exclude specific namespaces from generating record data for namespace fields. Multiple namespaces can be separated by commas.              |
| `--language`         | `-l`       | Language             | Select the language (`en` or `jp`). When `--sObject` or `-o` is specified, this updates or removes the language setting for that object.    |
| `--outputFormat`     | `-f`       | Output Format        | Define the output format(s) for generated data (e.g., CSV, JSON, DI). Multiple formats can be specified, separated by commas.               |
| `--sObject`          | `-s`       | Specific Object      | Target a specific object and override its existing settings. If not found in the template, an "add object" prompt will appear.             |
| `--fieldsToExclude`  | `-e`       | Fields to Exclude    | Exclude specific fields from test data generation for a given object. Applies only at the object level.                                    |

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
