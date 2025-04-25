
/* eslint-disable no-constant-condition */
/* eslint-disable sf-plugin/no-hardcoded-messages-flags */
/* eslint-disable sf-plugin/read-only-properties */
/* eslint-disable sf-plugin/no-hardcoded-messages-commands */

/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import Enquirer from 'enquirer';
import { SetupInitResult, typeSObjectSettingsMap, flagsForInit, fieldsToConsiderMap } from '../../utils/types.js';
import {outputChoices} from '../../utils/constants.js'



/* ------------------- Functions ---------------------- */

/*
 Create data_gen structure on current CLI path.
*/

function handleDirStruct(): string {
  const cwd = process.cwd();
  const dataGenDirPath = path.join(cwd, 'data_gen');
  const templateDirPath = path.join(dataGenDirPath, 'templates');
  const outputDirPath = path.join(dataGenDirPath, 'output');
  try {
    if (!fs.existsSync(dataGenDirPath)) {
      fs.mkdirSync(dataGenDirPath, { recursive: true });
      console.log(chalk.green(`Success: data-gen structure created: ${dataGenDirPath}`));
    }
    if (!fs.existsSync(templateDirPath)) fs.mkdirSync(templateDirPath, { recursive: true });
    if (!fs.existsSync(outputDirPath)) fs.mkdirSync(outputDirPath, { recursive: true });
    return dataGenDirPath;
  } catch (err) {
    throw new Error(`Failed to create 'data_gen' directory structure on path ${cwd}`);
  }
}

let sigintListenerAdded = false;

  function attachSigintHandlerOnce(): void {
  if (!sigintListenerAdded) {
    process.on('SIGINT', () => process.exit(0));
    sigintListenerAdded = true;
  }
}

async function runMultiSelectPrompt(): Promise<string[]> {
  try {
    type Answers = {
      choices: string[];
    };
    // Listen for Ctrl+C and terminate the CLI
    attachSigintHandlerOnce();
    const answers = await Enquirer.prompt<Answers>({
      type: 'multiselect',
      name: 'choices',
        message: `Select output format [CSV, JSON, DI] ${chalk.dim(`(use ${chalk.cyanBright('<space>')} to select, ${chalk.cyanBright('↑')} ${chalk.cyanBright('↓')} to navigate)`)}:`,
      choices: outputChoices,
    });

    return answers.choices;
  } catch (error) {
    if (error === '') {
      process.exit(0);
    }
    console.error('Error:', error);
    return [];
  }
}

async function runSelectPrompt(
  question: string,
  myChoices: Array<{ name: string; message: string; value: string; hint?: string }>
): Promise<string> {
  try {
    type Answers = {
      choices: string;
    };
    // Listen for Ctrl+C and terminate the CLI
    attachSigintHandlerOnce();

    const answers = await Enquirer.prompt<Answers>({
      type: 'select',
      name: 'choices',
      message: question,
      choices: myChoices,
    });

    return answers.choices;
  } catch (error) {
    if (error === '') {
      process.exit(0);
    }
    console.error('Error:', error);
    return '';
  }
}

/*
  This function validate the template name and checks the suffix.
*/
async function validateTemplateName(fileNameParam: string, templatePath: string): Promise<string> {
   let fileName = fileNameParam.toLowerCase();
    if (!fileName.endsWith('.json')) {
      fileName += '.json';
    } 
    
  const validateFile = path.join(templatePath, fileName);

  if (!fs.existsSync(validateFile)) {
    return fileName;
  } else {
    const fileNameExists = await askQuestion(
      chalk.yellow('Warning: Template name already exists! Do you want to overwrite? (Y/n)'),
      'n'
    );
    if (fileNameExists.toLowerCase() === 'yes' || fileNameExists.toLowerCase() === 'y') {
      return fileName;
    } else {
      const newFileName = await askQuestion('Enter new template file name', `one_${fileName}`);
return validateTemplateName(newFileName, templatePath);
    }
  }
}
function createDefaultTemplate(flags: flagsForInit, templatePath: string): void {
  if (flags.default !== undefined) {
    let defaultTemplatePath = path.join(templatePath, 'default_data_template.json');
    let defaultTemplateNumber: number = 0;

    while (fs.existsSync(defaultTemplatePath)) {
      defaultTemplateNumber++;
      defaultTemplatePath = path.join(templatePath, `default_data_template_${defaultTemplateNumber}.json`);
    }

    const defaultTemplate = `
{
  "namespaceToExclude": [],
  "outputFormat": ["csv", "json"],
  "count": 1,
  "sObjects": [
    {"account": {}},
    {"contact": {}},
    {
      "lead": {
        "count": 5,
        "fieldsToExclude": ["fax", "website"],
        "fieldsToConsider": {
          "email": ["smockit@gmail.com"],
          "phone": ["9090909090","6788899990"]
        },
        "pickLeftFields": true
      }
    }
  ]
}
    `;
    // Write the JSON object to the file with custom formatting
    fs.writeFileSync(defaultTemplatePath, defaultTemplate, 'utf8');
    console.log(chalk.green(`Success: default data template created at ${defaultTemplatePath}`));
  }
}
async function getJSONFileName(templatePath: string): Promise<string> {
  let fileName: string;

  while (true) {
    fileName = await askQuestion('Provide a template name', 'account_creation');
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(fileName)) {
      break;
    } else {
      console.error('Invalid Template name! It must start with an alphabet (A-Z, a-z) and can contain  alphanumeric characters (A-Z, a-z, 0-9). Try again.\n');

    }
  }
  const templateFileName = await validateTemplateName(fileName, templatePath);
  return templateFileName;
}
async function getNamespaceToExclude(): Promise<string[]> {
  const namespaceExcludeValue = await askQuestion(
    'Exclude namespace(s)' +
      chalk.dim('(comma-separated)'),
    ''
  );
  const namespaceToExclude = namespaceExcludeValue
    ? namespaceExcludeValue
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    : [];
  return namespaceToExclude;
}
async function getOutputFormat(): Promise<string[]> {
  let outputFormat: string[] = [];
  while (!(outputFormat.length > 0)) {
    const outputFormatValue = await runMultiSelectPrompt();
    outputFormat = outputFormatValue.map((format) => format.toLowerCase());
    if (!(outputFormat.length > 0)) {
      console.log(chalk.yellow('Invalid input. Please enter only CSV, JSON, or DI.'));
    }
  }
  return outputFormat;
}
function handleFieldsToConsider(fieldsToConsiderInput: string): fieldsToConsiderMap {
  const fieldsToConsider: fieldsToConsiderMap = {};
  const regex = /([\w-]+):\s*(\[[^\]]*\])|([\w-]+)/g;

  let match;
  while ((match = regex.exec(fieldsToConsiderInput)) !== null) {
    const key = (match[1] || match[3]).toLowerCase();
    const value = match[2];
    if (key && value) {
      const fieldValues = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));
      fieldsToConsider[key] = fieldValues;
    } else {
      fieldsToConsider[key] = [];
    }

    if (key.startsWith('dp-')) {
      if (value) {
        const dpFieldValue = value.slice(1, -1).trim();
        fieldsToConsider[key] = [dpFieldValue];
      } else {
        fieldsToConsider[key] = [];
      }
    }
  }
  return fieldsToConsider;
}
async function handleSObjectSettingsMap(
  sObjectSettingsMapInput: { [key: string]: typeSObjectSettingsMap },
  sObjectName: string
): Promise<{ [key: string]: typeSObjectSettingsMap }> {
  const sObjectSettingsMap: { [key: string]: typeSObjectSettingsMap } = sObjectSettingsMapInput;
  let overrideCount = null;
  while (overrideCount === null) {
    const customCountInput = await askQuestion(
      chalk.white.bold(`[${sObjectName} - Count]`) + ' Set number of records' , '1'
    );
    if (!customCountInput) {
      break;
    }
    overrideCount = parseInt(customCountInput, 10);

    if (overrideCount > 0 && !isNaN(overrideCount)) {
      sObjectSettingsMap[sObjectName].count = overrideCount;
      break;
    } else {
      console.log(chalk.yellow('Invalid input. Please enter a valid number'));
      overrideCount = null;
    }
  }
  return sObjectSettingsMap;
}
async function showConditionalCommand(
  overWriteGlobalSettingsInput: string,
  objectsToConfigure: string[],
  sObjectSettingsMapInput: { [key: string]: typeSObjectSettingsMap }
): Promise<void> {
  let sObjectSettingsMap: { [key: string]: typeSObjectSettingsMap } = sObjectSettingsMapInput;
  let overWriteGlobalSettings: string = overWriteGlobalSettingsInput;

  let remainingObjects = objectsToConfigure.filter(
    (obj) => !sObjectSettingsMapInput[obj] // Exclude objects that are already customized
  );

  while ((overWriteGlobalSettings.toLowerCase() === 'yes' || overWriteGlobalSettings.toLowerCase() === 'y') &&  remainingObjects.length > 0 ) {
    const objInTemplateChoices = remainingObjects.map((obj) => ({
      name: obj,
      message: obj,
      value: obj,
    }));
   
    const sObjectName = await runSelectPrompt(
      'Override the global settings for Object',
      objInTemplateChoices
    );
  
    if (!sObjectName) {
      overWriteGlobalSettings = await askQuestion(
        'Would you like to customize settings for individual SObject? (Y/n)',
        'n'
      );
      if (overWriteGlobalSettings.toLowerCase() !== 'yes' || overWriteGlobalSettings.toLowerCase() !== 'y') {
        break;
      }
      continue;
    }

    if (!objectsToConfigure.includes(sObjectName)) {
      const addObjectIfProvidedIsMissingFromArray = await askQuestion(
        chalk.yellow(`Warning: '${sObjectName}' is missing from the data template.`) +
          chalk.white('\nDo you want to add? (Y/n)'),
        'n'
      );
      const addObject = addObjectIfProvidedIsMissingFromArray.toLowerCase();
      if (addObject === 'yes' || addObject === 'y') {
        objectsToConfigure.push(sObjectName);
        console.log(chalk.green(`Success: '${sObjectName}' is added to data template.`));
      } else {
        console.log(chalk.red(`Discarded: '${sObjectName}'`));
        overWriteGlobalSettings = await askQuestion(
          'Customize settings for individual SObjects? (Y/n)',
          'n'
        );  
        continue;
      }
    }
    sObjectSettingsMap[sObjectName] = {};
    sObjectSettingsMap = await handleSObjectSettingsMap(sObjectSettingsMap, sObjectName);
    remainingObjects = remainingObjects.filter((obj) => obj !== sObjectName);
    
       
    // object record count

    const fieldsToExcludeInput = await askQuestion(
      chalk.white.bold(`[${sObjectName} - fieldsToExclude]`) +
        ' List fields (API names) to exclude' +
        chalk.dim('(comma-separated)'),
      ''
    );
    const fieldsToExclude: string[] = fieldsToExcludeInput
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);

    if (fieldsToExclude.length > 0) {
      sObjectSettingsMap[sObjectName]['fieldsToExclude'] = fieldsToExclude;
    }

    /* ---------------------New features added------------------------------*/

    console.log(
      chalk.blue.bold(
        'Note: For dependent picklists, define values in order (e.g., dp-Country: [India], dp-State: [Goa]).'
      )
    );

    const fieldsToConsiderInput = await askQuestion(
      chalk.white.bold(`[${sObjectName} - fieldsToConsider]`) +
        ' List fields (API names) to include. (E.g. Phone: [909090, 6788489], Fax )',
      ''
    );

    const fieldsToConsider: fieldsToConsiderMap = handleFieldsToConsider(fieldsToConsiderInput);
    const conflictingFields = Object.keys(fieldsToConsider).filter((field) =>
      fieldsToExclude.includes(field.toLowerCase())
    );
    if (conflictingFields.length > 0) {
      console.log(
        chalk.yellow(
          `Warning: Common fields found in 'fields-to-exclude' and 'fields-to-consider' in sObject '${sObjectName}' is '${conflictingFields.join(
            ','
          )}' . You must remove them!`
        )
      );
    }

    if (Object.keys(fieldsToConsider).length > 0) {
      sObjectSettingsMap[sObjectName]['fieldsToConsider'] = fieldsToConsider;
    }
    const pickLeftFields = [
      { name: 'true', message: 'true', value: 'true', hint: '' },
      { name: 'false', message: 'false', value: 'false', hint: '' },
    ];
    const pickLeftFieldsInput = await runSelectPrompt(
      `[${sObjectName} - pickLeftFields] Want to generate data for fields neither in 'fields to consider' nor in 'fields to exclude'`,
      pickLeftFields
    );
    if (pickLeftFieldsInput) {
      sObjectSettingsMap[sObjectName]['pickLeftFields'] = pickLeftFieldsInput === 'true';
    }

    if (Object.keys(fieldsToConsider).length === 0 && pickLeftFieldsInput === 'false') {
      console.log(
        chalk.red.bold(
         "No fields found to generate data. Set 'pick-left-fields' to true or add fields to 'fields-to-consider'."
        )
      );
      continue;
    }
    /* -------------------------------------------- */
     
    if(remainingObjects.length !== 0 ){
      overWriteGlobalSettings = await askQuestion(
        'Override global settings for another Object(API name)? (Y/n)',
        'n'
      );
    }
    
  }
}

/*
 Ask question on the CLI
*/
export const askQuestion = async (query: string, defaultValue?: string): Promise<string> => {
  const response = await Enquirer.prompt({
    type: 'input',
    name: 'answer',
    message: query,
    initial: defaultValue, 
    result: (value) => value ?? defaultValue ?? '',
  });

  return (response as unknown as { answer: string }).answer;
};



export  default class SetupInit extends SfCommand<SetupInitResult> {
 
  public static summary = 'Creates a default template that can be used for initial json adaption.';
  public static examples = ['sf template init --default'];

  public static readonly flags = {
    default: Flags.boolean({
      summary: 'Configure templates for data generation.',
      description: "Creates a default template that can be used for initial 'json' adaption.",
      char: 't',
      required: false,
    }),
  };


    

 
  public async run(): Promise<SetupInitResult> {
   

    this.log(SetupInit.summary);
   
    const dirname = handleDirStruct();
    const templatePath = path.join(dirname, 'templates');

    this.log(chalk.bold('====================================='));
    this.log(chalk.bold('🚀 Creating Data Template File 🚀'));
    this.log( '🔗 '+ chalk.gray('For more template creation info, visit: ') + chalk.underline('https://github.com/concretios/smock-it/wiki/Template-Init-Questionnaire'));
    this.log(chalk.bold('====================================='));
    const { flags } =  await this.parse(SetupInit);
    if(flags.default){
      createDefaultTemplate(flags, templatePath);
      process.exit(0);
    }
    const templateFileName = await getJSONFileName(templatePath);
    const filePath = path.join(templatePath, templateFileName);
    const namespaceToExclude = await getNamespaceToExclude();
    const outputFormat = await getOutputFormat();
   
    
    
   
    /* record count */

    let count = 0;
    while (count === 0) {
      const preSanitizedCount = parseInt(
        await askQuestion('Specify test data count', '1'),
        10
      );
      if (preSanitizedCount > 0 && !isNaN(preSanitizedCount)) {
        count = preSanitizedCount;
        break;
      } else if (isNaN(preSanitizedCount)) {
        count = 1;
        break;
      } else {
        console.log(chalk.yellow('Invalid input. Please enter a valid number'));
      }
    }

    const objectsToConfigureInput = await askQuestion(
      'List Objects(API names) for data creation' + chalk.dim(' (comma-separated)'),
      'Lead'
    );
    const tempObjectsToConfigure = objectsToConfigureInput
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);

    // dedupe sobjects
    const objectsToConfigure = tempObjectsToConfigure.filter(
      (obj, index) => tempObjectsToConfigure.indexOf(obj) === index
    );

    if (objectsToConfigure.length === 0) {
      objectsToConfigure.push('lead');
    }

    const overWriteGlobalSettings = await askQuestion(
      'Customize settings for individual SObjects? (Y/n)',
      'n'
    );
    const sObjectSettingsMap: { [key: string]: typeSObjectSettingsMap } = {};

    let remainingObjectsToConfigure = [...objectsToConfigure];
    await showConditionalCommand(overWriteGlobalSettings, objectsToConfigure, sObjectSettingsMap);
    
    
    

    const configuredObjects = Object.keys(sObjectSettingsMap);
    remainingObjectsToConfigure = remainingObjectsToConfigure.filter( 
        (obj) => !configuredObjects.includes(obj)
    );

    

    while (remainingObjectsToConfigure.length > 0) {
      const nextObject = remainingObjectsToConfigure[0];  // Get the next object to configure
     
    remainingObjectsToConfigure = remainingObjectsToConfigure.filter((obj) => obj !== nextObject);
  }
    const sObjects: Array<{ [key: string]: typeSObjectSettingsMap }> = objectsToConfigure.map((obj) => {
      const temp = sObjectSettingsMap[obj];
      if (temp !== undefined) {
        return { [obj]: temp };
      } else {
        return { [obj]: {} };
      }
    });
    const config: SetupInitResult = {
      
      namespaceToExclude,
      outputFormat,
      count,
      sObjects,
    };

    // Write the values of the config to the file template
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    const wantToValidate = await askQuestion(
      chalk.bold('Validate the added sObjects and their fields from your org?(Y/n)'),
      'n'
    );
    if (wantToValidate.toLowerCase() === 'yes' || wantToValidate.toLowerCase() === 'y') {
      const userAliasorUsernName = await askQuestion(
        chalk.bold('Enter the alias or username for the Salesforce org you wish to connect to (case-sensetive)')
      );
    
      try {
        const { connectToSalesforceOrg } = await import('../../utils/generic_function.js');
        const { validateConfigJson } = await import('../template/validate.js');
        
        const conn = await connectToSalesforceOrg(userAliasorUsernName);
        await validateConfigJson(conn, filePath);
        console.log(chalk.green(' Validation successful!'));
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.log(chalk.red(` Validation failed: ${err.message}`));
        } else {
          console.log(chalk.red(' Validation failed due to an unknown error.'));
        }
        console.log(
          chalk.yellow('It seems there was an issue with the alias or username provided.\n') + 
          chalk.yellow('The template will still be created. Please verify the alias/username or authenticate using `sf org login web`\n') +
          chalk.yellow('or use the `sf template validate --help` command..')   
          );
      }
    }
    console.log(chalk.green(`Success: ${templateFileName} created at ${filePath}`));
    return config;
  }
}

