/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable sf-plugin/no-hardcoded-messages-flags */
/* eslint-disable complexity */
/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable sf-plugin/command-summary */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable import/no-extraneous-dependencies */
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { loading } from 'cli-loading-animation';
import Spinner from 'cli-spinners';
import cliSelect from 'cli-select';
import { getConnectionWithSalesforce, validateConfigJson } from '../template/validate.js';
import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';

// Import messages from the specified directory
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker', 'template.init');

/* ------------------- Types ---------------------- */
export type SetupInitResult = {
  templateFileName: string;
  namespaceToExclude: string[];
  outputFormat: string[];
  language: string;
  count: number;
  sObjects: Array<{ [key: string]: typeSObjectSettingsMap }>;
};

type typeSObjectSettingsMap = {
  fieldsToExclude?: string[];
  count?: number;
  language?: string;
};

/* ------------------- Functions ---------------------- */

/*
 Create data_gen structure on current CLI path.
*/
async function handleDirStruct(): Promise<string> {
  const __cwd = process.cwd();
  const dataGenDirPath = path.join(__cwd, 'data_gen');
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
    throw new Error(`Failed to create 'data_gen' directory structure on path ${__cwd}`);
  }
}

/*
  This function validate the template name and checks the suffix.
*/
async function validateTemplateName(fileName: string, templatePath: string): Promise<string> {
  const suffix1 = '_data_template.json';
  const suffix2 = '_data_template';
  if (fileName.toLowerCase().endsWith(suffix2)) {
    fileName += '.json';
  } else if (!fileName.toLowerCase().endsWith(suffix1)) {
    fileName += '_data_template.json';
  }

  const validateFile = path.join(templatePath, fileName);

  if (!fs.existsSync(validateFile)) {
    return fileName;
  } else {
    const fileNameExists = await askQuestion(
      chalk.yellow('Warning: Template name already exists! Do you want to overwrite? (Y/n)'),
      'n'
    );
    if (fileNameExists.toLowerCase() == 'yes' || fileNameExists.toLowerCase() == 'y') {
      return fileName;
    } else {
      const newFileName = await askQuestion('Enter new template file name');
      return validateTemplateName(newFileName, templatePath);
    }
  }
}

/*
 Ask question on the CLI
*/
export const askQuestion = (query: string, defaultValue?: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const promptQuery = defaultValue ? `${query} (default: ${defaultValue}): ` : `${query}: `;
    rl.question(promptQuery, (answer) => {
      rl.close();
      resolve(answer || defaultValue || '');
    });
  });
};

/*
 Main body
*/
export default class SetupInit extends SfCommand<SetupInitResult> {
  public static readonly flags = {
    default: Flags.boolean({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 't',
      required: false,
    }),
  };

  public async run(): Promise<SetupInitResult> {
    const { flags } = await this.parse(SetupInit);
    const { start, stop } = loading('Establishing Connection with Org', {
      clearOnEnd: true,
      spinner: Spinner.line2,
    });
    start();
    const dirname = await handleDirStruct();
    const templatePath = path.join(dirname, 'templates');
    // const connection = await getConnectionWithSalesforce();
    stop();
    // console.log(chalk.cyan('Success: SF Connection established.'));

    console.log(chalk.bold('====================================='));
    console.log(chalk.bold('🚀 Creating Data Template File 🚀'));
    console.log(chalk.bold('====================================='));

    if (flags.default !== undefined) {
      let defaultTemplatePath = path.join(templatePath, 'default_data_template.json');
      let defaultTemplateNumber: number = 0;

      while (fs.existsSync(defaultTemplatePath)) {
        defaultTemplateNumber++;
        defaultTemplatePath = path.join(templatePath, `default_data_template_${defaultTemplateNumber}.json`);
      }

      const defaultTemplate = `
        {
          "_comment_importantNote": "We highly recommend removing all the comments for a cleaner exeperience once you are comfortable with this json format",

          "_comment_templateFileName": "The filename of the data template.",
          "templateFileName": "${path.basename(defaultTemplatePath)}",
          
          "_comment_namespaceToExclude": "Fields from these namespace(s) will be excluded while generating test data",
          "_example_namespaceToExclude": "namespaceToExclude:['namespace1','namespace2']",
          "namespaceToExclude": [],
          
          "_comment_outputFormat": "Desired output format(s) for the storing the generated test data; Only 3 values are valid- csv,json and di(i.e. for direct insertion of upto 200 records into the connected org)",
          "_example_outputFormat": "outputFormat:['csv','json','di']",
          "outputFormat": ["csv"],
          
          "_comment_language": "Specifies the default language for data generation; applies to all sObjects unless overridden (e.g., 'en' for English).",
          "language": "en",
          
          "_comment_count": "Specifies the default count for data generation; applies to all sObjects unless overridden",
          "count": 1,
          
          "_comment_sObjects": "Lists Salesforce objects (API names) to generate test data for.",
          "sObjects": [
            {"account": {}},
            {"contact": {}},
            {
              "lead": {
                "_comment_sobjectLevel": "These settings are object specific, so here these are set for lead object only",
                "_comment_fieldsToExclude": "Lists fields to exclude from generating test data for the Lead object.",
                "fieldsToExclude": ["fax", "website"],

                "_comment_language": "Specifies language for generating test data for the Lead object.",
                "language": "en",

                "_comment_count": "Specifies count for generating test data for the Lead object.",
                "count": 5
              }
            }
          ]
        }
        `;

      // Parse the string to ensure it's valid JSON before continuing
      const jsonObject = JSON.parse(defaultTemplate);

      // Write the JSON object to the file with custom formatting
      fs.writeFileSync(defaultTemplatePath, defaultTemplate, 'utf8');

      // Log success message
      console.log(chalk.green(`Success: default data template created at ${defaultTemplatePath}`));

      return jsonObject;
    }

    /* Template Data File Name */
    const temporaryFileName: string = await askQuestion(
      'Provide descriptive name for the template data file' + chalk.dim(' (e.g., validate_Account_creation)')
    );
    if (temporaryFileName == null || temporaryFileName == undefined || temporaryFileName == '')
      throw new Error('Please provide template data file name.');
    const templateFileName = await validateTemplateName(temporaryFileName, templatePath);

    const filePath = path.join(templatePath, templateFileName);

    /* Namespace to exclude */
    const namespaceExcludeValue = await askQuestion(
      'Enter namespace(s) to exclude' +
        chalk.dim(
          ' [Fields from these namespace(s) will be ignored. (comma-separated: "mynamespaceA", "mynamespaceB")]'
        ),
      ''
    );
    const namespaceToExclude = namespaceExcludeValue
      ? namespaceExcludeValue
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean)
      : [];

    const validFormats = new Set(['csv', 'json', 'di']);
    let outputFormat: string[] = [];
    while (true) {
      const outputFormatValue = await askQuestion(
        'Provide output format for generated records ' + chalk.dim('[CSV, JSON, and DI-Direct Insertion Supported]'),
        ''
      );
      outputFormat = outputFormatValue ? outputFormatValue.toLowerCase().split(/[\s,]+/) : [];
      if (outputFormat.length > 0 && outputFormat.every((format) => validFormats.has(format))) {
        break;
      }
      console.log(chalk.yellow('Invalid input. Please enter only CSV, JSON, or DI.'));
    }

    /* generate data in language */
    console.log(`In which language would you like to generate test data?`);
    const selectedLangVal = await cliSelect({
      values: ['en', 'jp'],
      valueRenderer: (value, selected) => {
        if (selected) {
          return chalk.inverse(value);
        }
        return value;
      },
      cleanup: false,
    });
    const language = selectedLangVal.value;
    console.log(chalk.dim(`Selected:${language}`));

    /* record count */
    let count = 0;
    while (true) {
      const countValue = await askQuestion(
        'Specify the number of test data records to generate' + chalk.dim(' (e.g., 5)'),
        '1'
      );
      count = parseInt(countValue, 10);
      if (count > 0 && count <= 200 && outputFormat.includes('di') && !isNaN(count)) {
        break;
      } else if (count > 0 && count !== undefined && !isNaN(count) && !outputFormat.includes('di')) {
        break;
      }

      if (outputFormat.includes('di')) {
        console.log(chalk.yellow('Invalid input. Please enter between 1-200, with DI- direct insertion'));
      } else {
        console.log(chalk.yellow('Invalid input. Please enter valid number'));
      }
    }

    const objectsToConfigureInput = await askQuestion(
      'Provide Objects(API names) for data creation' + chalk.dim(' (comma-separated)'),
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

    let overwriteGlobalSettings = await askQuestion(
      'Would you like to customize settings for individual SObjects? (Y/n)',
      'n'
    );
    const sObjectSettingsMap: { [key: string]: typeSObjectSettingsMap } = {};

    while (overwriteGlobalSettings.toLowerCase() === 'yes' || overwriteGlobalSettings.toLowerCase() === 'y') {
      console.log('\nWhich Object(API name) would you like to override the global settings for?');
      const proRet = cliSelect({
        values: objectsToConfigure,
        valueRenderer: (value, selected) => {
          if (selected) {
            return chalk.inverse(value);
          }
          return value;
        },
        cleanup: false,
      });

      const sObjectName = (await proRet).value;
      if (!sObjectName) {
        overwriteGlobalSettings = await askQuestion(
          'Would you like to customize settings for individual SObjects? (Y/n)',
          'n'
        );
        if (overwriteGlobalSettings.toLowerCase() !== 'yes' || overwriteGlobalSettings.toLowerCase() !== 'y') {
          break;
        }
        continue;
      }

      if (objectsToConfigure.length == 0) {
        objectsToConfigure.push('lead');
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
          overwriteGlobalSettings = await askQuestion(
            'Would you like to customize settings for individual SObjects? (Y/n)',
            'n'
          );
          continue;
        }
      }
      sObjectSettingsMap[sObjectName] = {};

      const fieldsToExcludeInput = await askQuestion(
        chalk.white.bold(`[${sObjectName}]`) +
          ' Provide fields(API names) to exclude ' +
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

      const customCountInput = await askQuestion(
        chalk.white.bold(`[${sObjectName}]`) + ' Count for generating records'
      );
      const overrideCount = customCountInput ? parseInt(customCountInput, 10) : null;
      if (overrideCount !== null) {
        sObjectSettingsMap[sObjectName].count = overrideCount;
      }

      console.log(`[${sObjectName}] Language in which test data should be generated`);
      const ovrrideSelectedLangVal = cliSelect({
        values: ['en', 'jp'],
        valueRenderer: (value, selected) => {
          if (selected) {
            return chalk.inverse(value);
          }
          return value;
        },
        cleanup: false,
      });
      if (ovrrideSelectedLangVal) {
        sObjectSettingsMap[sObjectName].language = (await ovrrideSelectedLangVal).value;
        console.log(chalk.dim(`Selected: ${sObjectSettingsMap[sObjectName].language}`));
      }
      overwriteGlobalSettings = await askQuestion(
        'Do you wish to overwrite global settings for another Object(API name)? (Y/n)',
        'n'
      );
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
      templateFileName,
      namespaceToExclude,
      outputFormat,
      language,
      count,
      sObjects,
    };

    // Write the values of the config to the file template
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    const wantToValidate = await askQuestion(
      chalk.bold('Do you want to validate the added sObjects and their fields from your org?(Y/n)'),
      'n'
    );
    if (wantToValidate.toLowerCase() == 'yes' || wantToValidate.toLowerCase() == 'y') {
      const connection = await getConnectionWithSalesforce();
      console.log(chalk.cyan('Success: SF Connection established.'));
      await validateConfigJson(connection, filePath);
    }

    console.log(chalk.green(`Success: ${templateFileName} created at ${filePath}`));
    return config;
  }
  log(arg0: string) {
    throw new Error('Method not implemented.');
  }
}
