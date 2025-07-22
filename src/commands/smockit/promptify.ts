/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable guard-for-in */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sf-plugin/no-hardcoded-messages-commands */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable camelcase */

import * as fs from 'node:fs';
import { exec } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { SfCommand } from '@salesforce/sf-plugins-core';
import chalk from 'chalk';
import { Connection, AuthInfo } from '@salesforce/core';
import { OpenAI } from 'openai';
import axios from 'axios';
import Enquirer from 'enquirer';
import { outputChoices } from '../../utils/constants.js';
import { askQuestion } from './template/init.js'

export default class TemplateGenerate extends SfCommand<void> {
  public static readonly summary = 'Generate a Smock-it test data template using plain English prompts.';

  public static readonly examples = [
    "sf template generate --prompt 'Generate 500 accounts with names and emails' --output di",
    "sf template generate --prompt 'Generate 100 opportunities with specific fields excluded' --output di",
    "sf template generate --prompt 'Generate sample Salesforce data excluding namespace namespcae1, with output formats in di. Limit global output to 12 records unless overridden. For Lead, generate 34 records excluding fax, focusing on phone and picking leftmost fields. For Account, generate 36 records excluding phone, focusing on name and also picking leftmost fields.' --output di",
    'sf template generate --prompt \'Generate test data using smockit template where I need 200 contact records to be generated with name set to "Sanyam", 200 records for contact to be generated with name set to "Divy"\' --output di',
    "sf template generate --prompt 'I want 500 records for sales invoice in which 200 should be marked as paid for field status. 200 records should be marked as underprocess and, 100 records should be marked as unpaid for same object. also include include follwing fields custName, Date, DueDate, total paymentDue, and salesId, modeOfPayment' --output di",
  ];

  /**
   * Executes the command to generate a Smock-it test data template based on user prompts.
   *
   * This method performs the following steps:
   * 1. Validates the OpenAI key from the environment or prompts the user to provide one.
   * 2. Prompts the user for a data generation prompt and Salesforce org alias.
   * 3. Connects to the specified Salesforce org.
   * 4. Prompts the user to select output formats for the generated template.
   * 5. Generates the template using the provided prompt and output formats.
   * 6. Handles the data generation process using the generated template.
   *
   * @returns {Promise<void>} A promise that resolves when the command execution is complete.
   */
  public async run(): Promise<void> {
    try {
      // 1. Validate OpenAI key first
      let openAiToken = process.env.OPENAI_KEY;
      if (!openAiToken) {
        openAiToken = await this.getOpenAIKeyFromUserEnv();
        if (!openAiToken) {
          openAiToken = await this.promptForOpenAiKey();
        }
        process.env.OPENAI_KEY = openAiToken;
      }
      // Validate the token before any further steps
      await this.validateOpenAIKey(openAiToken);

      const userPrompt = await askQuestion('Enter data generation prompt:');
      const aliasName = await askQuestion('Enter Salesforce org username/alias:');
      await this.connectToSalesforceOrg(aliasName || 'defaultAlias');
      // Prompt for output formats interactively
      const outputFormats = await this.getOutputFormat();
      if (outputFormats.length === 0) {
        throw new Error('No output formats selected. At least one format (CSV, JSON, DI) is required.');
      }

      //  await this.connectToSalesforceOrg(aliasName || 'defaultAlias');
      // 1. Capture both the name and the JSON content from the generator
      const { templateName } = await this.generateTemplate(userPrompt, outputFormats, openAiToken);
      // 2. Get the summary (which might be empty if parsing fails)
      await this.handleDataGeneration(templateName, aliasName || 'defaultAlias');
      // 3. Pass EVERYTHING to the printSummary function
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(`Error: ${error.message}`);
      } else {
        this.error('An unknown error occurred.');
      }
    }
  }

  /**
   * Prompts the user to select output formats using a multiselect prompt.
   *
   * This method uses the Enquirer library to display a multiselect prompt to the user,
   * allowing them to choose one or more output formats for the generated template.
   * The available choices are defined in the `outputChoices` array.
   *
   * If no output formats are selected, the method recursively prompts the user until
   * a valid selection is made. The selected output formats are returned as an array
   * of lowercase strings.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of selected output formats.
   */
  public async getOutputFormat(): Promise<string[]> {
    try {
      type Answers = {
        choices: string[];
      };
      const answers = await Enquirer.prompt<Answers>({
        type: 'multiselect',
        name: 'choices',
        message: `Select output format ${chalk.dim(
          `(use ${chalk.cyanBright('<space>')} to select, ${chalk.cyanBright('↑')} ${chalk.cyanBright('↓')} to navigate)`
        )}:`,
        choices: outputChoices, // Ensure outputChoices is defined in ./utils/constants.js
      });

      const outputFormats = answers.choices.map((format) => format.toLowerCase());
      if (outputFormats.length === 0) {
        console.log(chalk.yellow('No output formats selected. Select at least one format.'));
        return this.getOutputFormat(); // Recursively prompt until valid input is provided
      }
      return outputFormats;
    } catch (error) {
      if (error === '') {
        process.exit(0); // Exit on Ctrl+C
      }
      console.error(chalk.red('Error during output format selection:', error));
      return [];
    }
  }

  /**
   * Validates the provided OpenAI key by making a request to the OpenAI API.
   *
   * This method sends a request to the OpenAI API to verify the validity of the provided API key.
   * If the key is valid, the method returns true. If the key is invalid or unauthorized, it throws an error.
   *
   * @param {string} apiKey - The OpenAI key to validate.
   * @returns {Promise<boolean>} A promise that resolves to true if the API key is valid, otherwise false.
   * @throws {Error} If the API key is invalid or unauthorized.
   */
  private async validateOpenAIKey(apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      // If successful, key is valid
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      if (error instanceof Error && (error as any).response && (error as any).response.status === 401) {
        throw new Error('OpenAI key is invalid. Check and set again.');
      }
      return false;
    }
    return false; // Ensure all code paths return a boolean
  }

  /**
   * Sets a user environment variable based on the operating system.
   *
   * This method validates the provided OpenAI key and sets it as an environment variable
   * based on the user's operating system. It supports Windows, Linux, and macOS platforms.
   * If the operating system is unsupported, an error is thrown.
   *
   * @param {string} name - The name of the environment variable.
   * @param {string} value - The value to set for the environment variable.
   * @returns {Promise<void>} A promise that resolves when the environment variable is set.
   * @throws {Error} If the operating system is unsupported.
   */
  private async setUserEnvironmentVariable(name: string, value: string): Promise<void> {
    await this.validateOpenAIKey(value);
    const platform = os.platform();
    const commandMap: Record<string, () => string | null> = {
      win32: () => `setx ${name} "${value}"`,
      linux: () => `echo 'export ${name}="${value}"' >> ~/.bashrc`,
      darwin: () => `echo 'export ${name}="${value}"' >> ~/.zshrc`,
    };
    const command = commandMap[platform]?.();
    if (!command) {
      throw new Error(`Unsupported operating system: ${platform}`);
    }
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error setting environment variable: ${error.message}`);
          return reject(error);
        }
        if (stderr) {
          console.warn(`stderr while setting environment variable: ${stderr}`);
        }
        resolve();
      });
    });
  }

  /**
   * Connects to a Salesforce organization using the provided username or alias.
   *
   * This method retrieves all authorized Salesforce accounts and attempts to match
   * the provided username or alias with an existing authorization. If a match is found,
   * it creates an AuthInfo object and establishes a connection to the Salesforce org.
   * If no match is found, or if there is an error during the connection process, an
   * error is thrown.
   *
   * @param {string} userNameorAlias - The Salesforce username or alias to connect with.
   * @returns {Promise<Connection>} A promise that resolves to a Connection object for the Salesforce org.
   * @throws {Error} If the username or alias does not match any authenticated account, or if the connection fails.
   */
  private async connectToSalesforceOrg(userNameorAlias: string): Promise<Connection> {
    try {
      const allAuths = await AuthInfo.listAllAuthorizations();
      const matchingAuths = allAuths.filter(
        (auth) => auth.username === userNameorAlias || (auth.aliases && auth.aliases.includes(userNameorAlias))
      );
      const resolvedUsername = matchingAuths[0].username;
      if (matchingAuths.length === 0) {
        throw new Error(`The input "${userNameorAlias}" does not match any authenticated username or alias.`);
      }
      const authInfo = await AuthInfo.create({ username: resolvedUsername });
      const connection = await Connection.create({ authInfo });
      return connection;
    } catch (err) {
      throw new Error(
        chalk.red(
          `Failed: Connect to SF Org: ${chalk.redBright(
            userNameorAlias
          )} \n Either provide valid username/alias or authenticate your org using ${chalk.yellowBright(
            "'sf org login web'"
          )}`
        )
      );
    }
  }

  /**
   * Prompts the user for their OpenAI key and sets it as an environment variable.
   *
   * This method asks the user to input their OpenAI key, validates it, and sets it
   * as an environment variable. If the key is not provided or is invalid, an error
   * is thrown.
   *
   * @returns {Promise<string>} A promise that resolves to the OpenAI key entered by the user.
   * @throws {Error} If the OpenAI key is not provided or is invalid.
   */
  private async promptForOpenAiKey(): Promise<string> {
    const openAiKey = await askQuestion('Set your open AI key:');
    if (!openAiKey || openAiKey.trim() === '') {
      throw new Error('Check and set again');
    }
    await this.setUserEnvironmentVariable('OPENAI_KEY', openAiKey.trim());
    process.env.OPENAI_KEY = openAiKey.trim();
    return openAiKey.trim();
  }

  /**
   * Retrieves the OpenAI key from the user's environment variables.
   *
   * This method determines the operating system and executes the appropriate command
   * to fetch the OpenAI key from the environment variables. It supports Windows, Linux,
   * and macOS platforms. If the key is found, it is returned; otherwise, the method
   * resolves to undefined.
   *
   * @returns {Promise<string | undefined>} A promise that resolves to the OpenAI key if found, otherwise undefined.
   */
  private async getOpenAIKeyFromUserEnv(): Promise<string | undefined> {
    const platform = os.platform();
    const commands: Record<string, string> = {
      win32: 'reg query "HKCU\\Environment" /v OPENAI_KEY',
      linux: 'printenv OPENAI_KEY',
      darwin: 'printenv OPENAI_KEY',
    };

    const command = commands[platform];
    if (!command) {
      console.log(chalk.red('Unsupported operating system for retrieving OpenAI key.'));
      return undefined;
    }
    return new Promise((resolve) => {
      exec(command, (error, stdout) => {

        //  if (error ?? stdout?.trim() === '') but it not check the false and 0 
        if (error || !stdout.trim()) {
          resolve(undefined);
          return;
        }

        const key = platform === 'win32'
          ? stdout.match(/OPENAI_KEY\s+REG_SZ\s+(.+)/)?.[1]?.trim()
          : stdout.trim();

        if (!key || key.length === 0) {
          console.log(chalk.yellow('OpenAI key is empty or invalid.'));
          resolve(undefined);
          return;
        }
        resolve(key);
      });
    });
  }

  /**
   * Generates a Smock-it test data template based on the user's prompt and output formats.
   *
   * This method interacts with the OpenAI API to generate a JSON template for Salesforce test data
   * based on the user's natural language prompt. It validates the output formats, processes the
   * generated JSON to ensure it adheres to the required structure, and saves the template to a file.
   *
   * @param {string} userPrompt - The user's natural language prompt describing the template to generate.
   * @param {string[]} outputFormats - The desired output formats for the template. Defaults to ['di', 'json', 'csv'].
   * @param {string} openAiToken - The OpenAI API key used for authentication.
   * @returns {Promise<{ templateName: string; templateJson: any }>} A promise that resolves to an object containing the generated template name and JSON.
   * @throws {Error} If the generated template is not valid JSON, if invalid output formats are provided, or if there are conflicts in the fields.
   */
  private async generateTemplate(userPrompt: string, outputFormats: string[] = ['di', 'json', 'csv'], openAiToken: string): Promise<{ templateName: string; templateJson: any }> {
    const allowedFormats = ['di', 'json', 'csv'];
    const invalidFormats = outputFormats.filter((format) => !allowedFormats.includes(format));
    if (invalidFormats.length > 0) {
      throw new Error(
        `Invalid output formats provided: ${invalidFormats.join(', ')}. Allowed values are: ${allowedFormats.join(
          ', '
        )}.`
      );
    }
    const openai = new OpenAI({ apiKey: openAiToken });
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
   - Use the output formats provided by the user (e.g., "csv, json, di") in "outputFormat".
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
     - If the prompt specifies values for multiple fields ambiguously (e.g., "FirstName, LastName set to 'Smith' or 'Jones'"), **apply the values only to the last field** (e.g., "LastName") unless the context clearly indicates both fields should share the values (e.g., "FirstName and LastName both set to 'Smith'"). Include other fields with empty_arrays (e.g., { "firstname": [], "lastname": ["Smith", "Jones"] }).
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
      temperature: 0.01,
    });

    const templateText = response.choices[0]?.message?.content?.trim();
    if (!templateText) {
      throw new Error('Failed to generate a valid template. Try again.');
    }

    let templateJson;
    try {
      templateJson = JSON.parse(templateText);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Generated template is not valid JSON: ${error.message}`);
      } else {
        throw new Error('Generated template is not valid JSON: Unknown error occurred.');
      }
    }

    templateJson.outputFormat = outputFormats;

    if (!templateJson.namespaceToExclude || !Array.isArray(templateJson.namespaceToExclude)) {
      templateJson.namespaceToExclude = [];
    }
    if (!templateJson.sObjects || !Array.isArray(templateJson.sObjects)) {
      throw new Error('Generated template does not contain a valid sObjects array.');
    }
    if (!Number.isInteger(templateJson.count) || templateJson.count < 1) {
      templateJson.count = 1;
    }

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

      const knownDependentFields = ['title', 'status', 'type', 'stage'];
      for (const field of knownDependentFields) {
        if (field in fieldsToConsider && `dp-${field}` in fieldsToConsider) {
          console.log(`Found conflicting field "${field}" and "dp-${field}" in ${objectKey}. Removing "${field}".`);
          delete fieldsToConsider[field];
        }
      }

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
      for (const field in fieldsToConsider) {
        if (!Array.isArray(fieldsToConsider[field])) {
          throw new Error(`fieldsToConsider for ${field} in ${objectKey} must be an array.`);
        }
        if (field !== field.toLowerCase()) {
          fieldsToConsider[field.toLowerCase()] = fieldsToConsider[field];
          delete fieldsToConsider[field];
        }
      }
      for (const field in fieldsToConsider) {
        if (field.startsWith('dp-') && field !== field.toLowerCase()) {
          fieldsToConsider[field.toLowerCase()] = fieldsToConsider[field];
          delete fieldsToConsider[field];
        }
      }
    }
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
    const templateDir = path.join(process.cwd(), 'data_gen', 'templates');
    const templateName = `GeneratedTemplate-${Date.now()}.json`;
    const templatePath = path.join(templateDir, templateName);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
    fs.writeFileSync(templatePath, JSON.stringify(templateJson, null, 2));
    return { templateName, templateJson };
  }
  /**
   * Handles the data generation process using the generated template.
   * This method prompts the user to verify the generated template and confirm whether to proceed
   * with data generation. If confirmed, it executes the command to generate data using the template
   * and the specified Salesforce org alias.
   *
   * @param {string} templateName - The name of the generated template file.
   * @param {string} usernameOrAlias - The Salesforce username or alias to use for data generation.
   * @returns {Promise<void>} A promise that resolves when the data generation process is complete.
   */
  private async handleDataGeneration(templateName: string, usernameOrAlias: string): Promise<void> {
    console.log(
      chalk.blueBright('Template Path: ') + chalk.yellowBright(path.join(process.cwd(), 'data_gen', 'templates', templateName))
    );
    console.log(
      chalk.blueBright('You can customize the template located in the data_gen/templates folder prior to generating data.') + '\n'
    );
    const generateNow = await askQuestion(
      'Verify the generated template and confirm. If we can proceed with generating the data now? (y/n)'
    );
    if (generateNow.toLowerCase() !== 'yes' && generateNow.toLowerCase() !== 'y') {
      console.log('\n' +
        chalk.blueBright('Exiting without generating data. You can generate data later using the below command:') +
        `\n${chalk.yellow('sf smockit data generate -t <templateName> -a <usernameOrAlias>')}` +
        '\n'
      );
      return;
    }
    const command = `sf smockit data generate -t ${templateName} -a ${usernameOrAlias}`;
    exec(command, (error, stdout, stderr) => {
      if (stderr) {
        console.error(chalk.red(stderr));
      }
      const keyPhrase = 'No fields are found to generate data';
      const matchingLine = stderr
        .split('\n')
        .find(l => l.includes(keyPhrase));

      if (matchingLine) {
        console.log(matchingLine);
      }
      // Split stdout into lines and filter out success messages
      const filteredStdout = stdout
        .split('\n')
        .filter((line) => !line.includes('Success: Connected to SF Org:') && !line.includes('Successfully validated'))
        .join('\n');
      console.log(chalk.blue(filteredStdout));
      console.log(
        chalk.blue('Important: ') +
        `You can always reuse the template for data generation using: ${chalk.yellow(
          'sf smockit data generate -t <templateName> -a <usernameOrAlias>'
        )} command. \n`
      );
      console.log('Successfully exited \n');
    });
  }
}
