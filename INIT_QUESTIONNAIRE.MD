# Getting Started with the Init Command: 

This guide explains the questions prompted by the init command in Smock-It, helping you configure your data template effectively for a smooth schema setup.

* Create data templates using a guided questionnaire.  
* Specify included, excluded, and pickLeft fields to refine test data generation.  
* Apply filters and constraints to match specific business requirements.  
* Define output formats for test data, including CSV, JSON, and Direct Insertion (DI) into Salesforce.  
* Generate Salesforce records dynamically using custom JSON templates.

## General Questions On Schema

The questions in the below schema serve as the blueprint for how Smock-It creates test records. Go through these questions to better understand various use cases discussed in UseCase.MD (link).

### 1\. Provide a template name (e.g., account\_creation): account\_data\_template

Assign a name to the template data file, e.g., account\_data\_template.json, lead\_data\_template, or account\_lead\_data\_template.json. Locate the template data file later to identify and reuse it for future test data generation.

> Quick Tip 💡 With Smock-It, easily reference or modify a template data file without creating a new template from scratch.


### 2\. Exclude namespace(s) (comma-separated, e.g., mynamespaceA, mynamespaceB): testGen

 If a Salesforce org has managed packages, they may contain unnecessary fields. Excluding their namespaces can help prevent irrelevant fields from being included in test data.

For instance, in the below schema, we`ve excluded the ‘testgen’ namespace for exclusion. Based on our selection, Smock-It will identify and ignore any fields prefixed with testGen\_\_, focusing only on standard and custom objects without third-party fields. 

>  Quick Tip 💡 To exclude multiple namespaces, use comma-separated values such as: mynamespaceA, mynamespaceB 

### 

### 3\. Select output format \[CSV, JSON, DI\]: DI, CSV, JSON

 Specify the format in which generated test records should be outputted. Currently, Smock-It can generate output in CSV, JSON, and DI (Direct Insertion) formats, where:

* **DI** → Directly inserts records into Salesforce Org.  
* **CSV** → Exports test data in spreadsheet format.  
* **JSON** → Stores structured data for further processing.

> Quick Tip 💡 To select multiple output formats, use the ‘spacebar’ button. Use the up and down arrow keys for navigating output formats. 

### 4\. Choose a language for test data (en): en

Specify the language in which Smock-It should generate test data. Currently, Smock-It only supports the English language ( denoted by en).

> Note: While English is the default language for record generation, future versions of Smock-It will generate records in Japanese (ja) and other languages.

### 5\. Specify test data count (e.g. 5\) (default: 1): 200

Enter the number of records to generate. Since this number can significantly impact testing scenarios, requirements should be considered carefully.
For example, if the required count is 200 records, enter: 200\. 

>  Quick Tip 💡 If no number is selected, Smock-It will generate 1 record which is the default value. 

### 6\. List Objects(API names) for data creation (default: Lead): account

List the Salesforce objects (API names) for test data creation. Once the required objects (API names) are provided, Smock-It will determine the types of records to generate for the specified objects.

For instance, here we’ve selected an account object for data creation. As a result, Smock-It will generate 50 records for the account object.

**Note**: If no SObject (Salesforce Object) is selected, by default Smock-It will take the lead as an SObject.

>  Quick Tip 💡 Select multiple objects for test data in Smock-It by separating them with commas, such as account, lead.

### 7\. Customize settings for individual SObjects? (y/n): y

Decide whether to customize settings for specific SObjects instead of applying global settings. This option provides greater flexibility in tailoring data generation according to the unique requirements of different objects.

To customize settings, respond with: y

> Note: As a result, the list of provided SObjects will be returned.

### 8\. Override global settings for another Object(API name)? (Y/n) (default: n): n

Finished customizing one object but wish to make adjustments for another object as well? Simply select: Y

If no additional customizations are needed, respond with: n

## Object Customization Questionnaire

Below schema also contains questions related to object customization, as discussed below.

### 1\. Override global settings for which object? (default: Lead): account

When generating test data in Smock-It, global settings apply to all objects by default. However, some objects may require different configurations, such as varying field selections, exclusions, or record counts. 

For such scenarios, Smock-It can override global settings for specific objects as shown in below schema, where:

* Global count: 200 (applies to all objects).  
* Account-specific override: count = 50 → Only 50 records will be generated for the Account object.  
* Excluded fields: phone is excluded as defined under fieldsToExclude.  
* Included/considered fields: name and email are explicitly included.  
* If pickLeftFields = true, all fields except excluded ones will also be populated.  
* If pickLeftFields = false, only the explicitly included fields (name and email) would be considered.

### 2\. \[account \- count\] Set number of records: 50

List the number of records to generate for an object. Note that this count can differ from the global record count, giving a more granular control over data generation. 

For this scenario:

* \[Account \- Count\] → Defines the Salesforce object ( account here) and the number of records to be created for it.  
* Count for generating records: 50 → The system will generate 50 records for the specified object, regardless of the global record count.

>  Quick Tip 💡  If no count is explicitly declared, the default behavior generates 1 record per object. 

### 3\. \[account \- Language\] Specify language: en

Define the language in which Smock-It should generate test data for a specific Salesforce object. Since Smock-It currently supports only the English language, the test data will also be generated in it. 

In below schema:

* \[Account \- Language\] en → Smock-It will generate Account records in English.

### Additional points:

* If another object requires a different language, you can specify it separately ( not applicable currently).  
* If no language is defined, the global language setting applies by default ( English).

### 4\. \[account \- fieldsToExclude\] List fields (API names) to exclude: fax

List all the fields that should be excluded from test data generation for a specific Salesforce object. In below schema:

* \[Account \- fieldsToExclude\] phone → The phone field will be excluded from all generated Account records.

### Additional points:

* Multiple fields can be excluded by separating them with commas.  
* Mandatory fields cannot be excluded, but if listed, Smock-It will handle them appropriately.

>  Important ⚠️ How to Input Values for fieldstoExclude?  Let’s say the name and phone fields need to be excluded. However, since name is required in the Account object, Smock-It will handle this by generating records for the name field while excluding the phone field.  

### 5\. \[account \- fieldsToConsider\] List fields (API names) to include: name, email

List the account fields that should be explicitly included in test data generation. In this scenario, we’ve taken the name and email fields for the account object.

* \[Account \- fieldsToConsider\] name, email → Only the Name and Email fields will be populated in Account records.  
* Fields not listed here will be excluded unless pickLeftFields \= true, in which case Smock-It will auto-generate values for them.

**Important ⚠️**

1️⃣ Adding custom values to User-Defined fields For a scenario where custom values need to be added to user-defined fields, use the following CLI command:
- \[Account \- fieldsToConsider\] Provide fields (API names) to be considered for generating data: name: \[Mark, John\], email: \[marketing@concret.io\]

Here: The name field has predefined values (Mark, John), meaning name fields will have either of these two values. The email field will have [marketing@concret.io](mailto:marketing@concret.io) as the predefined value. 

2️⃣ Input format for randomly generated values  Besides custom-generated values, there might be a need to generate large data. For such a scenario, Smock-It can generate random values. Consider this CLI command:
-   \[Account \- fieldsToConsider\] Provide fields (API names) to be considered for generating data: name, email 

Here: The name field does not have any specific value, hence it will take unique values generated randomly by Smock-It. Similar to the name field, the email field will also generate random and unique values. 

3️⃣ Input Format for Dependent Picklist Fields If using a dependent picklist, field order should be maintained.

  For instance, in our use case: dp-country\_\_c is the controlling field with the value USA. dp-state\_\_c is the child field, so Smock-It assigns California only when USA is set. 

4️⃣ Combining Custom and Random Values in One Input Combining all combinations of the above in one user input is also possible with Smock-It. Consider this scenario:
- \[Account \- fieldsToConsider\] Provide fields (API names) to be considered for generating data: name:\[Mark, John\], email:\[\], dp-country\_\_c:\[USA\], dp-state\_\_c:\[California\], Phone:\[\] 

Here, The name field will take predefined values (Mark, John). The email field will take randomly generated values. dependent picklist (dp-country\_\_c) will have the USA as a fixed value whereas dependent picklist (dp-state\_\_c) will have California as a child field since it is dependent on the country field. The phone field will also have randomly generated values. 

> Quick Tip 💡 Use custom values for critical fields and random values for unique large scale record generation.

### 6\. \[account \- pickLeftFields\] Generate Data for Unspecified Fields? (true/false): true

The pickLeftFields setting controls whether Smock-It should auto-generate values for fields that are neither explicitly included in fieldsToConsider nor excluded in fieldsToExclude.

#### If pickLeftFields = true:

* Smock-It automatically populates all remaining fields, except those explicitly listed in fieldsToExclude (e.g., phone).  
* If a required field is mistakenly included in fieldsToExclude, Smock-It still generates data for it to maintain data integrity.  
* Fields from excluded namespaces will not be generated, even if they fall under pickLeftFields.

#### If pickLeftFields = false:

* Only the fields explicitly listed in fieldsToConsider are generated.  
  All other fields remain empty unless required, in which case Smock-It ensures necessary values are provided.



## Template Generated

This template is automatically generated based on the above selections. It can be reused and modified as needed, eliminating the need to build a new template from scratch.

```json
{  
  "templateFileName": "account_data_template.json",  
  "namespaceToExclude": ["testGen"],  
  "outputFormat": [  
    "di",  
    "csv",  
    "json"  
  ],  
  "language": "en",  
  "count": 200,  
  "sObjects": [  
    {  
       "account": {  
        "count": 50,  
        "language": "en",  
        "fieldsToExclude": ["fax"],  
        "fieldsToConsider": {  
          "name": [],  
          "email": [],  
		      "phone":[],
          "dp-country__c": ["USA"],  
          "dp-state__c": ["California"]  
        },  
        "pickLeftFields": true  
      }  
    }  
  ]  
}
```

## Smock-It Use Case Documentation 

In addition to the default use case, which provides a detailed walkthrough of the `init` questionnaire, we have 11 well-documented use cases available in `UseCases.md` (link).

📌 Refer to Smock-It Use Case Documentation for a deeper understanding of Smock-It CLI and its capabilities. 

Need help? Write to us at support@smock-It

