// src/commands/data/templates.ts

/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable sf-plugin/flag-case */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-unused-vars */ // Allowed because we import the generate command class

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core'; // Add Flags
import { Messages } from '@salesforce/core';
import chalk from 'chalk';
import Enquirer from 'enquirer';
import { TemplateCreator } from '../../../utils/templateCreator.js'; // Use the utility location
// import { connectToSalesforceOrg } from '../../../utils/generic_function.js';
import DataGenerate from '../data/generate.js'; // Import the DataGenerate command class (assuming its path)


Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'data.templates'); 

// Map the template names for the command line prompt
const templateChoices = [
  { name: 'default', message: 'Default Template', value: 'default' },
  { name: 'salesprocess', message: 'Sales Process Template', value: 'salesprocess' },
];

/**
 * Manages the creation and subsequent data generation for predefined templates.
 */
export default class DataTemplates extends SfCommand<void> {
  public static readonly summary: string = messages.getMessage('summary');

  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    alias: Flags.string({
      summary: 'Alias or username for the target Salesforce org.',
      description: 'The alias or username used to connect to the org for validation and data insertion.',
      char: 'a',
      required: true,
    }),
  };

  private handleDirStruct(): string {
    const cwd = process.cwd();
    const dataGenDirPath = path.join(cwd, 'data_gen');
    const templateDirPath = path.join(dataGenDirPath, 'templates');
    const outputDirPath = path.join(dataGenDirPath, 'output');
    try {
      if (!fs.existsSync(dataGenDirPath)) {
        fs.mkdirSync(dataGenDirPath, { recursive: true });
        this.log(chalk.green(`Success: data-gen structure created: ${dataGenDirPath}`));
      }
      if (!fs.existsSync(templateDirPath)) fs.mkdirSync(templateDirPath, { recursive: true });
      if (!fs.existsSync(outputDirPath)) fs.mkdirSync(outputDirPath, { recursive: true });
      return templateDirPath;
    } catch (err: any) {
      throw new Error(`Failed to create 'data_gen' directory structure on path ${cwd}: ${err.message}`);
    }
  }

  private async runSelectPrompt(): Promise<'default' | 'salesprocess' | ''> {
    try {
      type Answers = {
        choice: 'default' | 'salesprocess';
      };
      
      const answers = await Enquirer.prompt<Answers>({
        type: 'select',
        name: 'choice',
        message: 'Select a template to create:',
        choices: templateChoices,
      });

      return answers.choice;
    } catch (error) {
      if (error === '') {
        process.exit(0);
      }
      return '';
    }
  }
  
  public async run(): Promise<void> {
    const { flags } = await this.parse(DataTemplates);
    const templateDirPath = this.handleDirStruct();
    console.log('templateDirPath: ', templateDirPath);
    const templateCreator = new TemplateCreator();

    
    this.log(chalk.bold('====================================='));
    this.log(chalk.bold('🚀 Select Predefined Data Template 🚀'));
    this.log(chalk.bold('====================================='));

    const selectedTemplate = await this.runSelectPrompt();

    if (!selectedTemplate) {
      this.log(chalk.yellow('No template selected. Exiting.'));
      return;
    }

    // Create the template file
    const createdTemplatePath = templateCreator.createTemplate(templateDirPath, selectedTemplate);
    const templateName = path.basename(createdTemplatePath, '.json');

    this.log(chalk.green(`\n✅ Success: '${selectedTemplate}' template created at ${createdTemplatePath}`));

    // Execute Data Generation
    this.log(chalk.bold('\n====================================='));
    this.log(chalk.bold('🚀 Starting Data Generation & Insert 🚀'));
    this.log(chalk.bold('====================================='));
    
    // We instantiate the DataGenerate command and run its logic directly.
    const dataGenerateCommand = new DataGenerate(
      [
        '-t', templateName,
        '-a', flags.alias,
      ],
      this.config // Pass the CLI configuration context
    );
    
    try {
      await dataGenerateCommand.run(); 

      this.log(chalk.green.bold('\n✅ Template creation and data insertion successful!'));
    } catch (err: any) {
      this.error(chalk.red.bold(`\n❌ Data generation or insertion failed: ${err.message}`));
    }
  }
}