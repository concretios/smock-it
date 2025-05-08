/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sf-plugin/no-hardcoded-messages-flags */
/* eslint-disable sf-plugin/no-hardcoded-messages-commands */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable camelcase */
import * as fs from 'node:fs';
import { exec, ExecException } from 'node:child_process';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import chalk from 'chalk';
import { OpenAI } from 'openai';

import { askQuestion } from './init.js';

export default class TemplateGenerate extends SfCommand<void> {
  public static readonly summary = 'Generate a Smock-it test data template using plain English prompts.';
  public static readonly examples = [
    "sf template generate --prompt 'Generate 500 accounts with names and emails' --output json,csv",
    "sf template generate --prompt 'Generate 100 opportunities with specific fields excluded' --output di",
    "sf template generate --prompt 'Generate sample Salesforce data excluding namespace namespcae1, with output formats in di, json, and csv. Limit global output to 12 records unless overridden. For Lead, generate 34 records excluding fax, focusing on phone and picking leftmost fields. For Account, generate 36 records excluding phone, focusing on name and also picking leftmost fields.' --output di,json,csv",
    'sf template generate --prompt \'Generate test data using smockit template where I need 200 contact records to be generated with name set to "Sanyam", 200 records for contact to be generated with name set to "Divy"\' --output csv,json,di',
    "sf template generate --prompt 'I want 500 records for sales invoice in which 200 should be marked as paid for field status. 200 records should be marked as underprocess and, 100 records should be marked as unpaid for same object. also include include follwing fields custName, Date, DueDate, total paymentDue, and salesId, modeOfPayment' --output json",
  ];

  public static readonly flags = {
    prompt: Flags.string({
      summary: 'Plain English prompt describing the template to generate.',
      char: 'p',
      required: true,
    }),
    output: Flags.string({
      summary: "Comma-separated output formats (e.g., json,csv,di). Defaults to 'json'.",
      char: 'f',
      required: false,
    }),
  };

  private async generateTemplate(userPrompt: string, outputFormats: string[] = ['json']): Promise<string> {
    const allowedFormats = ['json', 'csv', 'di'];
    const invalidFormats = outputFormats.filter((format) => !allowedFormats.includes(format));
    if (invalidFormats.length > 0) {
      throw new Error(
        `Invalid output formats provided: ${invalidFormats.join(', ')}. Allowed values are: ${allowedFormats.join(
          ', '
        )}.`
      );
    }

    const openAiToken = process.env.OPENAI_API_KEY;
    if (!openAiToken) {
      throw new Error('OpenAI API key is not set. Please set it as an environment variable: OPENAI_API_KEY');
    }

    const openai = new OpenAI({ apiKey: openAiToken });

    this.log(chalk.blue('Generating Smock-it template...'));

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `
You are an expert assistant that generates Smock-it test data template JSONs for Salesforce test data generation. Your task is to interpret the user's natural language prompt and produce a valid JSON object that adheres to the following structure:

{
  "namespaceToExclude": [],
  "outputFormat": [],
  "count": 1,
  "sObjects": [
    {
      "objectName": {
        "count": 1,
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "fieldName": ["fieldValue"]
        },
        "pickLeftFields": true
      }
    }
  ]
}

Rules for generating the JSON:
1. Namespace Exclusion:
   - If the prompt mentions excluding namespaces (e.g., "excluding namespace test1, test2, test3"), list them in "namespaceToExclude" as an array of strings.
2. Output Formats:
   - Use the output formats provided by the user (e.g., "csv, json") in "outputFormat".
3. Global Count:
   - Set "count" to the user-specified global count (e.g., "global count set to 50"). If not specified, default to 1.
   - Do not override the user-specified global count with the sum of sObjects counts.
4. SObjects:
   - For each Salesforce object mentioned (e.g., "account", "contact"), create an entry in "sObjects".
   - Use the object name in lowercase as the key (e.g., "account", "contact").
   - If the prompt specifies multiple sets of records for the same object with different field values (e.g., "50 accounts with name Sanyam, 50 accounts with name Divy"), create separate entries in "sObjects" for each set.
   - Set "count" to the number of records specified for each set (e.g., 50 for one set of accounts).
   - List fields to exclude in "fieldsToExclude" if mentioned (e.g., "excluding phone").
   - Include all fields mentioned in the prompt in "fieldsToConsider" (e.g., "name, email").
   - Field Value Assignment:
     - If a specific value is provided for a field (e.g., "name set to Sanyam"), include it in "fieldsToConsider" as an array, e.g., { "accountname": ["Sanyam"] }.
     - If the prompt specifies values for multiple fields with a shared phrase (e.g., "Subject, Priority set to 'High'"), **strictly apply the value only to the last field mentioned** (e.g., "Priority") unless explicitly stated otherwise (e.g., "Subject set to 'Issue' and Priority set to 'High'"). Include other fields with empty arrays (e.g., { "subject": [], "priority": ["High"] }).
     - If the prompt specifies values for multiple fields ambiguously (e.g., "FirstName, LastName set to 'Smith' or 'Jones'"), **apply the values only to the last field** (e.g., "LastName") unless the context clearly indicates both fields should share the values (e.g., "FirstName and LastName both set to 'Smith'"). Include other fields with empty arrays (e.g., { "firstname": [], "lastname": ["Smith", "Jones"] }).
     - **CRITICAL**: Pay close attention to phrases like "Field1, Field2 set to X" and ensure only Field2 receives the value X, with Field1 having an empty array unless the prompt explicitly states otherwise.
   - For fields without specific values, include them with an empty array, e.g., { "email": [] }.
   - Set "pickLeftFields" to true if the prompt mentions "include all other fields", "picking leftmost fields", or if not explicitly mentioned.
   - Set "pickLeftFields" to false if the prompt specifies "excluding all other fields" or "only include mentioned fields".
5. Field Name Handling:
   - Normalize field names by removing spaces and converting to camelCase and lowercase (e.g., "Account Name" to "accountname", "Due Date" to "duedate").
   - If a field name appears ambiguous (e.g., "total paymentDue"), treat it as separate fields ("total" and "paymentdue") unless explicitly stated as one field.
   - Ensure field names are valid Salesforce identifiers.
6. Dependent Picklists:
   - Prefix dependent picklists with "dp-" and use lowercase (e.g., "dp-country", "dp-state").
   - Ensure each dependent picklist array contains only one value.
   - Maintain hierarchical order for dependent picklists (e.g., "dp-country" before "dp-state").
   - If the prompt specifies dependent picklists (e.g., "Country to 'India' and State to 'Rajasthan'"), include them in "fieldsToConsider" as "dp-country" and "dp-state".
   - Do not merge multiple fields into a single key (e.g., avoid dp-leadsource-status); use separate keys like dp-leadsource and dp-status.
   - If a field is identified as a dependent picklist (e.g., "Title" with a value like "Sales Manager" paired with "Department" as "Sales"), include it only as a dependent picklist (e.g., "dp-title") and exclude the non-dependent version (e.g., "title") from "fieldsToConsider".
   - If a field appears both as a regular field and as a dependent picklist in the prompt, always prioritize the dependent picklist version and remove the regular field from "fieldsToConsider" to avoid duplication.
7. Validation:
   - Ensure all object names, field names, and namespaces are valid Salesforce identifiers.
   - Output all field names in camelCase and lowercase (e.g., "accountname", "lastname").
   - Output only a valid JSON object, with no additional text or comments.
   - Ensure each sObject entry corresponds to a unique combination of object and field values as specified in the prompt.

Example Prompts and Outputs:
1. Prompt: "For Case, generate 15 records with Subject, Priority set to 'High'."
Output:
{
  "namespaceToExclude": [],
  "outputFormat": ["json"],
  "count": 1,
  "sObjects": [
    {
      "case": {
        "count": 15,
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "subject": [],
          "priority": ["High"]
        },
        "pickLeftFields": true
      }
    }
  ]
}

2. Prompt: "For Contact, create 30 records with FirstName, LastName set to 'Smith' or 'Jones'."
Output:
{
  "namespaceToExclude": [],
  "outputFormat": ["json"],
  "count": 1,
  "sObjects": [
    {
      "contact": {
        "count": 30,
        "fieldsToExclude": [],
        "fieldsToConsider": {
          "firstname": [],
          "lastname": ["Smith", "Jones"]
        },
        "pickLeftFields": true
      }
    }
  ]
}

3. Prompt: "Generate a Smock-it template for Salesforce data in JSON and DI formats, excluding namespace 'ns1'. Set global count to 25. For Contact, create 30 records with FirstName, LastName set to 'Smith' or 'Jones', and Title, excluding MailingAddress and Email. Use dependent picklist values for Department as 'Sales' and Title as 'Sales Representative'. For Case, generate 15 records with Subject, Priority set to 'High', and Status set to 'New', excluding Description. Include dependent picklist values for Status as 'New' and Type as 'Problem'. Ensure only specified fields are included for Case."
Output:
{
  "namespaceToExclude": ["ns1"],
  "outputFormat": ["json", "di"],
  "count": 25,
  "sObjects": [
    {
      "contact": {
        "count": 30,
        "fieldsToExclude": ["mailingaddress", "email"],
        "fieldsToConsider": {
          "firstname": [],
          "lastname": ["Smith", "Jones"],
          "dp-department": ["Sales"],
          "dp-title": ["Sales Representative"]
        },
        "pickLeftFields": true
      }
    },
    {
      "case": {
        "count": 15,
        "fieldsToExclude": ["description"],
        "fieldsToConsider": {
          "subject": [],
          "priority": ["High"],
          "dp-status": ["New"],
          "dp-type": ["Problem"]
        },
        "pickLeftFields": false
      }
    }
  ]
}

Based on the user prompt, generate the JSON template strictly following these rules. Ensure that fields identified as dependent picklists are included only with the "dp-" prefix and their regular versions are excluded. **Double-check that field values are assigned correctly**, applying values only to the last field in ambiguous phrases (e.g., "Field1, Field2 set to X" means only Field2 gets X) unless specified otherwise.
          `,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 1500,
      temperature: 0.01, // Further lowered for strict adherence
    });

    const templateText = response.choices[0]?.message?.content?.trim();
    console.log('Generated template text:', templateText); // Log for debugging

    if (!templateText) {
      throw new Error('Failed to generate a valid template. Please try again.');
    }

    let templateJson;
    try {
      templateJson = JSON.parse(templateText);
      console.log('Parsed template JSON:', JSON.stringify(templateJson, null, 2)); // Log for debugging
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Generated template is not valid JSON: ${error.message}`);
      } else {
        throw new Error('Generated template is not valid JSON: Unknown error occurred.');
      }
    }

    // Ensure outputFormat is set to user-specified formats
    templateJson.outputFormat = outputFormats;

    // Validate the JSON structure
    if (!templateJson.namespaceToExclude || !Array.isArray(templateJson.namespaceToExclude)) {
      templateJson.namespaceToExclude = [];
    }
    if (!templateJson.sObjects || !Array.isArray(templateJson.sObjects)) {
      throw new Error('Generated template does not contain a valid sObjects array.');
    }
    if (!Number.isInteger(templateJson.count) || templateJson.count < 1) {
      templateJson.count = 1;
    }

    // Validate and correct fieldsToConsider
    for (const sObject of templateJson.sObjects) {
      const objectKey = Object.keys(sObject)[0];
      const sObjectData = sObject[objectKey];
      if (!sObjectData.fieldsToExclude || !Array.isArray(sObjectData.fieldsToExclude)) {
        sObjectData.fieldsToExclude = [];
      }
      if (!sObjectData.fieldsToConsider || typeof sObjectData.fieldsToConsider !== 'object') {
        throw new Error(`Invalid fieldsToConsider for ${objectKey}`);
      }

      const fieldsToConsider = sObjectData.fieldsToConsider;
      const dependentFields = Object.keys(fieldsToConsider).filter((field) => field.startsWith('dp-'));
      const removedFields: string[] = [];

      // Remove regular fields if their dependent picklist versions exist
      for (const depField of dependentFields) {
        const baseField = depField.replace(/^dp-/, '');
        if (baseField in fieldsToConsider) {
          removedFields.push(baseField);
          delete fieldsToConsider[baseField];
        }
      }
      if (removedFields.length > 0) {
        console.log(
          `Removed regular fields for ${objectKey}: ${removedFields.join(
            ', '
          )} due to corresponding dependent picklists`
        );
      }

      // Additional validation: Check for known dependent picklist fields
      const knownDependentFields = ['title', 'status', 'type', 'stage'];
      for (const field of knownDependentFields) {
        if (field in fieldsToConsider && `dp-${field}` in fieldsToConsider) {
          console.log(`Found conflicting field "${field}" and "dp-${field}" in ${objectKey}. Removing "${field}".`);
          delete fieldsToConsider[field];
        }
      }

      // Correct incorrect value assignments (e.g., Subject, Priority set to 'High')
      const fieldKeys = Object.keys(fieldsToConsider);
      for (let i = 0; i < fieldKeys.length - 1; i++) {
        const currentField = fieldKeys[i];
        const nextField = fieldKeys[i + 1];
        if (
          fieldsToConsider[currentField].length > 0 &&
          JSON.stringify(fieldsToConsider[currentField]) === JSON.stringify(fieldsToConsider[nextField]) &&
          !currentField.startsWith('dp-')
        ) {
          console.log(
            `Correcting field "${currentField}" for ${objectKey}: removing values ${JSON.stringify(
              fieldsToConsider[currentField]
            )} as they likely belong to "${nextField}"`
          );
          fieldsToConsider[currentField] = [];
        }
      }

      // Specific correction for known problematic fields
      if (
        objectKey === 'case' &&
        'subject' in fieldsToConsider &&
        fieldsToConsider.subject.length > 0 &&
        'priority' in fieldsToConsider
      ) {
        console.log(
          `Correcting subject field for ${objectKey}: removing values ${JSON.stringify(fieldsToConsider.subject)}`
        );
        fieldsToConsider.subject = [];
      }
      if (
        objectKey === 'contact' &&
        'firstname' in fieldsToConsider &&
        fieldsToConsider.firstname.length > 0 &&
        'lastname' in fieldsToConsider
      ) {
        if (JSON.stringify(fieldsToConsider.firstname) === JSON.stringify(fieldsToConsider.lastname)) {
          console.log(
            `Correcting firstname field for ${objectKey}: removing values ${JSON.stringify(fieldsToConsider.firstname)}`
          );
          fieldsToConsider.firstname = [];
        }
      }

      // Normalize field names to lowercase
      for (const field in fieldsToConsider) {
        if (!Array.isArray(fieldsToConsider[field])) {
          throw new Error(`fieldsToConsider for ${field} in ${objectKey} must be an array.`);
        }
        if (field !== field.toLowerCase()) {
          fieldsToConsider[field.toLowerCase()] = fieldsToConsider[field];
          delete fieldsToConsider[field];
        }
      }

      // Ensure dependent picklists start with "dp-" and are lowercase
      for (const field in fieldsToConsider) {
        if (field.startsWith('dp-') && field !== field.toLowerCase()) {
          fieldsToConsider[field.toLowerCase()] = fieldsToConsider[field];
          delete fieldsToConsider[field];
        }
      }
    }

    // Final validation: Ensure no regular fields exist alongside their dependent picklist versions
    for (const sObject of templateJson.sObjects) {
      const objectKey = Object.keys(sObject)[0];
      const fieldsToConsider = sObject[objectKey].fieldsToConsider;
      const dependentFields = Object.keys(fieldsToConsider).filter((field) => field.startsWith('dp-'));
      for (const depField of dependentFields) {
        const baseField = depField.replace(/^dp-/, '');
        if (baseField in fieldsToConsider) {
          throw new Error(
            `Validation failed: Regular field "${baseField}" exists alongside dependent picklist "${depField}" in ${objectKey}`
          );
        }
      }
    }

    // Save the template
    const templateDir = path.join(process.cwd(), 'data_gen', 'templates');
    console.log('Template directory:', templateDir); // Log for debugging
    const templateName = `GeneratedTemplate-${Date.now()}.json`;
    console.log('Template name:', templateName); // Log for debugging
    const templatePath = path.join(templateDir, templateName);
    console.log('Template path:', templatePath); // Log for debugging

    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    fs.writeFileSync(templatePath, JSON.stringify(templateJson, null, 2));
    this.log(chalk.green(`Template generated and saved at: ${templatePath}`));

    return templatePath;
  }

  private async handleDataGeneration(templatePath: string): Promise<void> {
    const generateNow = await askQuestion('Do you wish to generate the data instantly? (yes/no)');
    if (generateNow.toLowerCase() !== 'yes') {
      return;
    }

    const isAuthorized = await askQuestion('Is your Salesforce org already authorized on the CLI? (yes/no)');

    let usernameOrAlias: string;
    if (isAuthorized.toLowerCase() === 'yes') {
      usernameOrAlias = await askQuestion('Enter the username or alias of the authorized Salesforce org:');
    } else {
      this.log('Please authorize your Salesforce org in another CLI window and provide the username or alias here.');
      usernameOrAlias = await askQuestion('Enter the username or alias of the authorized Salesforce org:');
    }

    this.log(`Running 'sf data generate' for org: ${usernameOrAlias}`);
    exec(
      `sf data generate -t ${templatePath} -a ${usernameOrAlias}`,
      (error: ExecException | null, stdout: string, stderr: string): void => {
        if (error) {
          this.error(`Error generating data: ${stderr}`);
        } else {
          this.log(chalk.green('Data generation completed successfully.'));
          this.log(stdout);
        }
      }
    );
  }

  public async run(): Promise<void> {
    const { flags }: { flags: { prompt: string; output?: string } } = await this.parse(TemplateGenerate);

    try {
      const userPrompt = flags.prompt;
      const outputFormats = flags.output
        ? flags.output.split(',').map((format) => format.trim().toLowerCase())
        : ['json'];
      const templatePath = await this.generateTemplate(userPrompt, outputFormats);
      await this.handleDataGeneration(templatePath);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(`Error: ${error.message}`);
      } else {
        this.error('An unknown error occurred.');
      }
    }
  }
}
