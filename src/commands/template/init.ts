import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import Enquirer from 'enquirer';
import { getConnectionWithSalesforce, validateConfigJson } from '../template/validate.js';

// Import messages from the specified directory
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'template.init');

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

async function runMultiSelectPrompt(): Promise<string[]> {
  try {
    type Answers = {
      choices: string[];
    };

    const outputChoices = [
      { name: 'DI', message: 'DI', value: 'di', hint: 'Create records into org (limit- upto 200)' },
      { name: 'JSON', message: 'JSON', value: 'json' },
      { name: 'CSV', message: 'CSV', value: 'csv' },
    ];
    // Listen for Ctrl+C and terminate the CLI
    if (!sigintListenerAdded) {
      process.on('SIGINT', () => {
        process.exit(0);
      });
      sigintListenerAdded = true;
    }

    const answers = await Enquirer.prompt<Answers>({
      type: 'multiselect',
      name: 'choices',
      message: 'Provide output format for generated records [CSV, JSON, and DI-Direct Insertion Supported]',
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
    if (!sigintListenerAdded) {
      process.on('SIGINT', () => {
        process.exit(0);
      });
      sigintListenerAdded = true;
    }

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
  const suffix1 = '_data_template.json';
  const suffix2 = '_data_template';
  let fileName = fileNameParam;
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
    if (fileNameExists.toLowerCase() === 'yes' || fileNameExists.toLowerCase() === 'y') {
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
      resolve(answer ?? defaultValue ?? '');
    });
  });
};

export default class SetupInit extends SfCommand<SetupInitResult> {
  public static readonly summary: string = messages.getMessage('summary');
  public static readonly examples = [messages.getMessage('Examples')];

  public static readonly flags = {
    default: Flags.boolean({
      summary: messages.getMessage('flags.default.summary'),
      description: messages.getMessage('flags.default.description'),
      char: 't',
      required: false,
    }),
  };

  public async run(): Promise<SetupInitResult> {
    const { flags } = await this.parse(SetupInit);

    const dirname = handleDirStruct();
    const templatePath = path.join(dirname, 'templates');

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
      const jsonObject = JSON.parse(defaultTemplate) as SetupInitResult;

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
    if (temporaryFileName == null || temporaryFileName === undefined || temporaryFileName === '')
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

    // const validFormats = new Set(['csv', 'json', 'di']);
    // && outputFormat.every((format) => validFormats.has(format))
    let outputFormat: string[] = [];
    while (!(outputFormat.length > 0)) {
      const outputFormatValue = await runMultiSelectPrompt();
      outputFormat = outputFormatValue.map((format) => format.toLowerCase());
      if (!(outputFormat.length > 0)) {
        console.log(chalk.yellow('Invalid input. Please enter only CSV, JSON, or DI.'));
      }
    }

    /* generate data in language */
    const languageChoices = [
      { name: 'en', message: 'en', value: 'en', hint: 'English (US)' },
      { name: 'jp', message: 'jp', value: 'jp', hint: 'Japanese' },
    ];
    const language = await runSelectPrompt('In which language would you like to generate test data?', languageChoices);

    /* record count */

    let count = 0;
    while (count === 0) {
      const preSanitizedCount = parseInt(
        await askQuestion('Specify the number of test data records to generate' + chalk.dim(' (e.g., 5)'), '1'),
        10
      );
      if (
        preSanitizedCount > 0 &&
        preSanitizedCount <= 1000 &&
        outputFormat.includes('di') &&
        !isNaN(preSanitizedCount)
      ) {
        count = preSanitizedCount;
        break;
      } else if (
        preSanitizedCount > 0 &&
        preSanitizedCount <= 1000 &&
        preSanitizedCount !== undefined &&
        !isNaN(preSanitizedCount) &&
        !outputFormat.includes('di')
      ) {
        count = preSanitizedCount;
        break;
      } else if (isNaN(preSanitizedCount)) {
        count = 1;
        break;
      }

      if (outputFormat.includes('di')) {
        console.log(chalk.yellow('Invalid input. Please enter between 1-200, with DI- direct insertion'));
      } else {
        console.log(chalk.yellow('Invalid input. Please enter valid number 1-1000'));
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

    if (objectsToConfigure.length === 0) {
      objectsToConfigure.push('lead');
    }

    let overwriteGlobalSettings = await askQuestion(
      'Would you like to customize settings for individual SObjects? (Y/n)',
      'n'
    );
    const sObjectSettingsMap: { [key: string]: typeSObjectSettingsMap } = {};

    while (overwriteGlobalSettings.toLowerCase() === 'yes' || overwriteGlobalSettings.toLowerCase() === 'y') {
      const objInTemplateChoices = objectsToConfigure.map((obj) => ({
        name: obj,
        message: obj,
        value: obj,
      }));

      const sObjectName = await runSelectPrompt(
        'Which Object(API name) would you like to override the global settings for?',
        objInTemplateChoices
      );
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
      // object record count
      let overrideCount = null;
      while (overrideCount === null) {
        const customCountInput = await askQuestion(
          chalk.white.bold(`[${sObjectName}]`) + ' Count for generating records'
        );
        if (!customCountInput) {
          break;
        }
        overrideCount = parseInt(customCountInput, 10);

        if (overrideCount > 0 && overrideCount <= 1000 && !isNaN(overrideCount)) {
          sObjectSettingsMap[sObjectName].count = overrideCount;
          break;
        } else {
          console.log(chalk.yellow('Invalid input. Please enter a number between 1 and 1000'));
          overrideCount = null;
        }
      }
      // Note:languageChoices is defined above already
      const ovrrideSelectedLangVal = await runSelectPrompt(
        `[${sObjectName}] Language in which test data should be generated`,
        languageChoices
      );
      if (ovrrideSelectedLangVal) {
        sObjectSettingsMap[sObjectName].language = ovrrideSelectedLangVal;
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
    if (wantToValidate.toLowerCase() === 'yes' || wantToValidate.toLowerCase() === 'y') {
      const connection = await getConnectionWithSalesforce();
      console.log(chalk.cyan('Success: SF Connection established.'));
      await validateConfigJson(connection, filePath);
    }

    console.log(chalk.green(`Success: ${templateFileName} created at ${filePath}`));
    return config;
  }
  // log(arg0: string) {
  //   throw new Error('Method not implemented.');
  // }
}
