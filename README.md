<p align="center">
  <img src="https://images.squarespace-cdn.com/content/637dc346cd653e686a50c1f5/d2ed870c-7705-44fb-906a-4fe28b64f1f4/smockit-logo.png?content-type=image%2Fpng" alt="Smockit Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.2.0-brightgreen" />
  <img src="https://img.shields.io/badge/mock--data-brightgreen" />
  <img src="https://img.shields.io/badge/SF--Plugin--Test%20Data%20Generator-blue" />
</p>





# Smock-it (v2.2.0)

A Salesforce CLI Plugin to simplify synthetic data generation for Salesforce.

Smock-It is a fast, lightweight SF CLI plugin that simplifies Salesforce test data generation, overcoming the limitations of standard Salesforce and third-party tools. With its ability to create synthetic, highly customizable datasets, it`s perfect for anyone working with complex Salesforce schemas.

Whether you`re a developer, QA engineer, or admin, Smock-It adapts to your unique testing requirements, ensuring efficiency, compliance, and scalability. With its ability to generate accurate, diverse test data in less time, you can focus on what truly matters—building, testing, and delivering great solutions.

## **What`s New in v2.2.0?** 

Smock-It v2.2.0 brings smarter, faster test data generation for Salesforce, with:

### **1\. More Customization, Less Effort**

Take full control of your test data with enhanced template creation. Now, include or exclude specific fields (fieldsToConsider, fieldsToExclude) or control data behavior using pickLeftFields, for precise scenario-specific results.

### **2\. Easier Authentication**

No more hassle with environment variables\! Use the new \-a flag to authenticate with a username or alias from your Salesforce Org List, simplifying setup for the validate and data generate commands.

### **3\.  Bulk Data Creation**

Say goodbye to the 1,000-record cap\! Now, you can generate significantly larger datasets across CSV, JSON, and DI formats, making it easier to handle large-scale test data requirements with zero restrictions.

### **4\. Automatic Field Inclusion**

No more missing fields\! Smock-It now automatically detects and includes required fields, ensuring that every dataset is complete, compliant, and ready for testing—without manual intervention.

## **Key Challenges Solved**

Smock-It removes the biggest roadblocks Salesforce professionals face when managing and generating test data. 

### **1\. Privacy & Compliance Made Easy**

Stop worrying about using real customer data. Smock-It creates synthetic, privacy-safe test data, keeping you fully compliant with GDPR and CCPA while protecting both your business and customers.

### **2\. Saves Time by Automating Data Creation**

Manually generating complex Salesforce test data is resource-intensive and a slow grind. Smock-It automates the process, significantly cutting down the time and effort required to generate accurate test data. 

### **3\. Handles Complex Salesforce Schemas with Ease**

Salesforce custom objects and relationships can make test data creation tricky. Smock-It understands and processes complex schemas, ensuring your test data is always structured and accurate.

### **4\. Full Control with Customization Options**

Smock-It lets you complete control over your test data with features like:

* fieldsToConsider – Choose specific fields to include at the object level for precise, scenario-specific test data.  
* fieldsToExclude – Remove unnecessary fields for cleaner, more focused datasets.  
* pickLeftFields – Set to true to generate all fields except the excluded ones, or false to generate only the selected ones.

## How to Use Smock-it in GitHub Actions⚡
We've made it simple to get started! A GitHub Actions has been created to integrate Smock-it effortlessly into your workflows.

>Demonstration below on how to call smock-it in any project.
  
```yml
name: Smock-it - synthetic Data Generation

on:
  workflow_dispatch:
    inputs:
      templates:
        description: "Provide comma-separated templates name (e.g lead_creation.json, account_creation.json)"
        required: true
        type: string
      org-alias:
        description: "Provide alias for authorizing salesforce org"
        required: true
        type: string
        default: "smockit"

jobs:
  generate-test-data:
    runs-on: ubuntu-latest
    steps:
    - name: checkout repository
      uses: actions/checkout@v4
    - name: setup node
      uses: actions/setup-node@v4
      with:
        node-version: 18
    - name: install Salesforce CLI
      run: |
        npm install -g @salesforce/cli
        echo "SF CLI Installed."
    - name: create server-key file from stored secrets
      run: |
        echo "${{ secrets.JWT_TOKEN }}" > server.key 
    - name: connect your org using jwt
      run: |
        sf org login jwt --client-id ${{ secrets.CLIENT_ID }} --jwt-key-file server.key --username ${{ secrets.username }} -r instance_url --alias ${{ inputs.org-alias }}
    - name: generate data using smock-it
      uses: concretios/smock-it@main
      with:
        templates: ${{ inputs.templates }}
        org-alias: ${{ inputs.org-alias }}
        mockaroo-api-key: ${{ secrets.MOCKAROO_API_KEY }}
    - name: upload artifacts
      uses: actions/upload-artifact@v4
      with: 
        name: SmockItOutputFiles
        path: data_gen/output/
        retention-days: 15
        if-no-files-found: warn 

# Important: 
# You must have `data_gen` directory present on your repo with subdirectories - templates, output.
# You must have template present on your repository/ branch to generate test data.
```
  
## Installation

### Prerequisites

Before installing Smock-It, ensure you have the following:

* **Salesforce CLI** – Required for executing Smock-It commands within your Salesforce environment. Install it from [here](https://www.npmjs.com/package/smock-it).  
* **Node.js (v18.0.0 or later)** – Smock-It requires Node.js to run. Download the latest version from [Node.js](https://nodejs.org/).  
* **Mockaroo API Key** – Smock-It integrates with Mockaroo for generating realistic test data. Obtain your API key from [Mockaroo](https://www.mockaroo.com/).

### Commands

#### **Install Smock-It**

Run the following command in your terminal to install Smock-It as a Salesforce CLI plugin:

 ``
   sf plugins install smock-it
   ``

#### **Update Smock-It**

Keep Smock-It up to date with the latest enhancements by running:

  ``
   sf plugins update
   ``
#### **Verify successful installation run**

To confirm that Smock-It was installed successfully, run the below command. This will list all installed plugins, including Smock-It.

 ``
    sf plugins
   ``
### Environment Variables

Smock-It relies on Mockaroo to generate realistic, structured test data. To enable this integration, you need to set up a Mockaroo API key as an environment variable. 

#### **For Windows:**

`$env:MOCKAROO_API_KEY="your_mockaroo_api_key"`

#### **For macOS/Linux:**

`export MOCKAROO_API_KEY="your_mockaroo_api_key"`

📌 **Note:** You can obtain your Mockaroo API key by signing up at [Mockaroo](https://www.mockaroo.com/).

## **Directory Structure**

When using Smock-It, the following directories are automatically created in your current working directory (if they don’t already exist). These directories help organize your test data, making it easier to manage and reuse:

* **`data_gen/`** – The root directory where all Smock-It generated test data is stored. It acts as the primary workspace for data generation.  
  * **`templates/`** – Contains data templates that define field structures, relationships, and constraints, ensuring test data aligns with Salesforce schema requirements.

  * **`output/`** – The output directory stores generated test data files and record insertion details, making it easy to track or reuse datasets later.

## Template structure

The ```sf template init``` command generates a data template based on the values provided in the questionnaire.
> Please refer [INIT_QUESTIONNAIRE_GUIDE.MD](https://github.com/concretios/smock-it/blob/main/INIT_QUESTIONNAIRE.MD) for more detail.

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
> For more on Template Use Cases, Please refer - **[USECASE.md](https://github.com/concretios/smock-it/blob/main/USECASE.md)**

### Field Instructions (for Template)

* Fax & Website: These fields are excluded from data generation, meaning no values will be created for them.

* Country: Data will be generated only for India and the USA. No other country values will be included.

* Email: Since no specific values are provided, random email addresses will be automatically generated.

* dp-Year\_\_c: This serves as a controlling field (parent) for a dependent picklist. It will always have a fixed value of 2024 during data generation.

* dp-Month\_\_c: A dependent field linked to `dp-Year__c`. It will always generate the value "March", with no variations.

* Dependent Picklists: The order of dependent picklists is important. The controlling field (`dp-Year__c`) must be listed before the dependent field (`dp-Month__c`) in the template.

* Field Prefix: Fields that are part of a dependent picklist must begin with the prefix `dp-`.

* `dp-` Fields: Fields with the `dp-` prefix must either be left empty or have a single predefined value. Multiple values are not supported.

## Commands 



#### **  Initialize Template**

 This command initializes a new data generation template. It sets up the required directory structure, prompts for a valid template file name, and collects configuration details for Salesforce objects (such as fields to exclude and record counts). Once all necessary inputs are gathered, the configuration undergoes validation against the org before being saved to a JSON file.

```
sf template init [--default]
```

#### ** 2.Upsert Configurations**

The Upsert command allows users to modify or add configurations to an existing data generation template. Users can specify details such as Salesforce object, language, record count, excluded fields, and output format. If the specified object does not already exist in the template, the command will prompt users to add it.

```
sf template upsert -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
```

#### **Remove Configurations**

Remove specific configurations from an existing data generation template using the remove command. Users can remove record count, language, namespaces, output format, and excluded fields. 

>**Note**: While these options offer flexibility, record count and language cannot be removed globally, and at least one output format must remain to ensure proper functionality

```
sf template remove -t <templateFileName> [-s <sObject>] [-l <languageCode>] [-c <recordCount>] [-x <namespaceToExclude>] [-f <outputFormat>] [-e <fieldsToExclude>] [-i <fieldsToConsider>] [-p <pickLeftFields>]
```

#### **Validate Template**

The validate command validates a data generation template file, ensuring that it is correctly configured for Salesforce. It checks the template for correctness, connects to Salesforce (using environment variables for credentials), and logs any warnings or errors found in the template's configuration. This step ensures that all objects, fields, and settings are properly defined before use. 

>**Note**: To execute this command, the user will need to mention the alias name or username of the Salesforce Org.

```
sf template validate -t <templateFileName> -a <aliasorUsername>
```

#### **Generate Data**

The generate command reads a Salesforce data generation template and generates data based on the objects and settings defined within it. It also excludes the fields from the data template file that have been specified, ensuring that unwanted fields are omitted from the generated records. This command is designed to facilitate the creation of tailored datasets for Salesforce objects. 

>**Note**: To execute this command, the user will need to mention the alias name or username of the Salesforce Org.

```
sf data generate -t <templateFileName> -a <aliasorUsername>
```

#### **Print Template**

The print command retrieves and displays the contents of a specified Salesforce data generation template. It is useful for reviewing the configuration before using it to generate data.

```
sf template print -t <templateFileName>
```

## Flags
| Flag                 | Short Hand | Flag Name             | Description                                                                                                                                 |
|----------------------|------------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `--default`          |            | Default Template      | Creates a default template.                                                                                                                 |
| `--templateName`     | `-t`       | Template Name         | Specify the name of the data template to be utilized. The template must exist in the `data_gen/templates` directory.                        |
| `--count`            | `-c`       | Count                | Set the number of records to generate. If `--sObject` or `-s` is provided, this will only update or remove the count for that object.       |
| `--namespaceToExclude` | `-x`    | Namespace to Exclude | Exclude specific namespaces from generating record data for namespace fields. Multiple namespaces can be separated by commas.              |
| `--language`         | `-l`       | Language             | Select the language (`en`). When `--sObject` or `-s` is specified, this updates or removes the language setting for that object.    |
| `--outputFormat`     | `-f`       | Output Format        | Define the output format(s) for generated data (e.g., CSV, JSON, DI). Multiple formats can be specified, separated by commas.               |
| `--sObject`          | `-s`       | Specific Object      | Target a specific object and override its existing settings. If not found in the template, an "add object" prompt will appear.             |
| `--fieldsToExclude`  | `-e`       | Fields to Exclude    | Exclude specific fields from test data generation for a given object. Applies only at the object level.                                    |
| `--fieldsToConsider `   | `-i`       | Fields to Consider    | Include specific fields from test data generation for a given object. This applies only at the object level, with the specified values                                    |
| `--pickLeftFields`  | `-p`       | Pick Left Fields    |     If true, generates data for all fields except those listed in FieldsToExclude. If false, generates data only for the fields specified in FieldsToConsider.
| `--aliasOrUserName`  | `-a`       | Alias Or UserName    |    This flag is required when using the validate and data generate commands. It accepts a username or alias name and only supports orgs listed in the Salesforce Org List.

---
## Command Help
To access command help:
```bash
sf <template/data> <command> --help
```
---
