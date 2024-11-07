/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prefer-const */
/* eslint-disable no-underscore-dangle */
/* eslint-disable sf-plugin/dash-o */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable sf-plugin/no-missing-messages */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable sf-plugin/command-summary */
/* eslint-disable no-lonely-if */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable sf-plugin/esm-message-import */
/* eslint-disable unicorn/prefer-node-protocol */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import chalk from 'chalk';


Messages.importMessagesDirectory(path.dirname(fileURLToPath(import.meta.url)));
const messages = Messages.loadMessages('smocker', 'template.remove');

/* 
Removing specified configuration options from the given configObject based on provided flags.
*/
export function removeOrDeleteConfig(
  configMap: any,
  flags: any,
  allowedFlags: string[],
  log: (message: string) => void,
) {
  const arrayFlags = ['namespaceToExclude', 'outputFormat', 'fieldsToExclude'];

  

  for (const [key, value] of Object.entries(flags)) {
    if (allowedFlags.includes(key) && value !== undefined) {
      if (arrayFlags.includes(key) && typeof value === 'string') {
        const valuesArray = value
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean);

        if (Array.isArray(configMap[key])) {

          const notFoundValues: string[] = [];
          const foundValues: string[] = [];

          if (key === 'outputFormat') {
            if (configMap[key].length - valuesArray.length < 1) {
                throw new Error(`Error: All the values from 'outputFormat' cannot be deleted! You must leave at least one value.`);
            }
    
            if (valuesArray.length === 0) {
                throw new Error("Error: The '-f' (outputFormat) flag cannot be empty or contain only invalid values.");
            }
          } 
    
          valuesArray.forEach((item) => {
            const index = configMap[key].indexOf(item);
            if (index > -1) {
              foundValues.push(item);
              configMap[key].splice(index, 1);
            } else {
              notFoundValues.push(item);
            }
          });

          if (notFoundValues.length > 0) {
            log(`Skipping: ${notFoundValues.join(', ')} do/ does not found in ${key}`);
          }

          if (foundValues.length > 0) {
            log(`Value(s):'${foundValues.join(', ')}' is removed from '${key}'`);
          }
        }
      } else {
        delete configMap[key];
        log(`Flag: ${key} is removed from the "${flags.sObject}" settings`);
      }
    } 
    else {
      if (key !== 'templateName' && key !== 'sObject') {
        throw new Error(`Error: Default ${key} can not be deleted! You can update instead.`);
      }
    }
  }
}

export default class TemplateRemove extends SfCommand<void> {
  public static readonly templateAddFlags = {
    sObject: Flags.string({
      char: 'o',
      summary: messages.getMessage('flags.sObject.summary'),
      required: false,
    }),
    templateName: Flags.string({
      char: 't',
      summary: messages.getMessage('flags.templateName.summary'),
      required: true,
    }),
    language: Flags.boolean({
      char: 'l',
      summary: messages.getMessage('flags.language.summary'),
      required: false,
    }),
    count: Flags.boolean({
      char: 'c',
      summary: messages.getMessage('flags.count.summary'),
      required: false,
    }),
    namespaceToExclude: Flags.string({
      char: 'x',
      summary: messages.getMessage('flags.namespaceToExclude.summary'),
      required: false,
    }),
    outputFormat: Flags.string({
      char: 'f',
      summary: messages.getMessage('flags.outputFormat.summary'),
      required: false,
    }),
    fieldsToExclude: Flags.string({
      char: 'e',
      summary: messages.getMessage('flags.fieldsToExclude.summary'),
      required: false,
    }),
  };

  public static readonly flags = TemplateRemove.templateAddFlags;

  public async run(): Promise<void> {

    const { flags } = await this.parse(TemplateRemove);

    const flagKeys = Object.keys(flags);

    const filename = flags.templateName.includes('.json') ? flags.templateName : flags.templateName + '.json';
   

      const __cwd = process.cwd();
      const dataGenDirPath = path.join(__cwd, 'data_gen');
      const templateDirPath = path.join(dataGenDirPath, 'templates');

      if (!fs.existsSync(templateDirPath)) {
        this.error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
      }

      if (!filename) {
        this.error('Error: You must specify a filename using the --templateName flag.');
      }

      const configFilePath = path.join(templateDirPath, filename);

      if (!fs.existsSync(configFilePath)) {
        this.error(`Data Template file not found at ${configFilePath}`);
      }

      let config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

      if (flagKeys.length === 1 && flagKeys.includes('templateName')) {
        this.error('Error: Data Template File can not be deleted! You must specify at least one setting flag to remove');
      }

      const objectNames = flags.sObject ? flags.sObject.split(',').map((obj) => obj.trim().toLowerCase()) : undefined;

      

      let allowedFlags: string[] = [];
      let configFile: any = {};

    /*
    Handling object level configuration
    */
      if (objectNames) {
        
        if (flags.namespaceToExclude) {
              throw new Error(`You cannot use global flag "namespaceToExclude" with an SObject flag.`);
        }

        if (flags.outputFormat) {
              throw new Error(`You cannot use global flag "outputFormat" with an SObject flag.`);
        }

        if (!Array.isArray(config.sObjects)) {
          throw new Error("The 'sObjects' configuration is missing in the template data file.");
        }

        objectNames.forEach((objectName) => {
          const lowerCaseObjectName = objectName.toLowerCase();

          const objectIndex = config.sObjects.findIndex(
            (obj: string) => Object.keys(obj)[0].toLowerCase() === lowerCaseObjectName,
          );

          if (objectIndex === -1) {
            this.error(chalk.yellow(`Object '${objectName}' does not exist in data template file.`));
          } 
          
          else {

            allowedFlags = ['fieldsToExclude', 'language', 'count'];

            if (flagKeys.includes('sObject') && Object.keys(flags).length === 2) {
              config.sObjects.splice(objectIndex, 1);
              this.log(chalk.green(`Object '${objectName}' has been removed from the data template file.`));
            }


            // If flags are provided, modify the object configuration
            else {
              const objectConfig = config.sObjects[objectIndex];
              const currentObjectName = Object.keys(objectConfig)[0];
              configFile = objectConfig[currentObjectName];

              const missingFlags: string[] = [];

              // Check each flag and dynamically collect missing or invalid flags
              if (flags.count && !configFile.count) {
                missingFlags.push('-c (count)');
              }
              if (flags.language && !configFile.language) {
                missingFlags.push('-l (language)');
              }
              
              if (flags.fieldsToExclude) {

                const fieldsArray = flags.fieldsToExclude.split(',').map(item => item.trim()).filter(Boolean);
                
                if (fieldsArray.length === 0) {
                  this.error("Error: The '-e' (fieldsToExclude) flag cannot be empty or contain only invalid values.");
                }

                if (!configFile.fieldsToExclude || configFile.fieldsToExclude.length === 0) {
                  missingFlags.push('-e (fieldsToExclude)');
                }

              }

              if (missingFlags.length > 0) {
                this.error(
                  `Error: Can not remove '${missingFlags.join(', ')}.' as it does not exist on ${currentObjectName} settings.`,
                );
              }
            }
          }
        });
      }     
      /*
      Handling object level configuration
      */  
      else {

        if (flags.namespaceToExclude) {
          const fieldsArray = flags.namespaceToExclude.split(',')
          .map(item => item.trim())
          .filter(Boolean);
          if (fieldsArray.length === 0) {
            this.error("Error: The '-e' (namespaceToExclude) flag cannot be empty or contain only invalid values.");
          }
        }

        if (flags.fieldsToExclude) {
          if (!flags.sObject) {
            this.error("Error: The '-e' (fieldsToExclude) flag requires the '-o' (sObject) flag.");
          }
        }        
        configFile = config;
        allowedFlags = ['outputFormat', 'namespaceToExclude'];
      }

      // Call a function to remove/delete the configuration
      removeOrDeleteConfig(configFile, flags, allowedFlags, this.log.bind(this));

      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');

      this.log(chalk.green(`Success: Configuration updated in data template file`));
  }
}
