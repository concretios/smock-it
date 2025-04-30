/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sf-plugin/no-hardcoded-messages-flags */
/* eslint-disable sf-plugin/no-hardcoded-messages-commands */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable camelcase */
import * as fs from 'node:fs';
import { exec } from 'node:child_process';
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

  private async generateTemplate(
    userPrompt: string,
    outputFormats: string[] = ['json']
  ): Promise<string> {
    const allowedFormats = ['json', 'csv', 'di'];
    const invalidFormats = outputFormats.filter((format) => !allowedFormats.includes(format));
    if (invalidFormats.length > 0) {
      throw new Error(
        `Invalid output formats provided: ${invalidFormats.join(', ')}. Allowed values are: ${allowedFormats.join(', ')}.`
      );
    }

    const openAiToken = process.env.OPENAI_API_KEY;
    if (!openAiToken) {
      throw new Error('OpenAI API key is not set. Please set it as an environment variable: OPENAI_API_KEY');
    }

    const openai = new OpenAI({ apiKey: openAiToken });

    this.log(chalk.blue('Generating Smock-it template...'));

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that generates Smock-it test data template JSONs for Salesforce test data generation. Always output a valid JSON object only.',
        },
        {
          role: 'user',
          content: `Generate a Smock-it test data template JSON with the following format:
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
          "fieldName1": [],
          "fieldName2": []
        },
        "pickLeftFields": true
      }
    }
  ]
}
The template should follow this structure, and include default values where applicable.
Conditions: 1. Dependent picklists must start with dp- prefix. 2. Each dependent picklist array must contain only one value. 3. Dependent picklists should follow the correct hierarchical order. 4. If a specific object count is provided, update the object-level count. 5. If the user specifies "exclude rest fields" or "do not consider other fields," set pickLeftFields to false. Based on the following user prompt: "${userPrompt}".`,
        },
      ],
      max_tokens: 500,
    });

    const templateText = response.choices[0]?.message?.content?.trim();
    if (!templateText) {
      throw new Error('Failed to generate a valid template. Please try again.');
    }

    let templateJson;
    try {
      templateJson = JSON.parse(templateText);
    } catch (error) {
      throw new Error('Generated template is not valid JSON. Please check the output.');
    }

    templateJson.outputFormat = outputFormats;

    const templateDir = path.join(process.cwd(), 'data_gen', 'templates');
    const templateName = `GeneratedTemplate-${Date.now()}.json`;
    const templatePath = path.join(templateDir, templateName);

    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    fs.writeFileSync(templatePath, JSON.stringify(templateJson, null, 2));
    this.log(chalk.green(`Template generated and saved at: ${templatePath}`));

    return templatePath;
  }

  private async handleDataGeneration(templatePath: string): Promise<void> {
    const generateNow = await askQuestion('Do you wish to generate the data instantly? (yes/no)');
    if (!generateNow) {
      return;
    }

    const isAuthorized = await askQuestion('Is your Salesforce org already authorized on the CLI? (yes/no)');

    let usernameOrAlias: string;
    if (isAuthorized) {
      usernameOrAlias = await askQuestion('Enter the username or alias of the authorized Salesforce org:');
    } else {
      this.log('Please authorize your Salesforce org in another CLI window and provide the username or alias here.');
      usernameOrAlias = await askQuestion('Enter the username or alias of the authorized Salesforce org:');
    }

    this.log(`Running 'sf data generate' for org: ${usernameOrAlias}`);
    exec(`sf data generate -t ${templatePath} -a ${usernameOrAlias}`, (error, stdout, stderr) => {
      if (error) {
        this.error(`Error generating data: ${stderr}`);
      } else {
        this.log(chalk.green('Data generation completed successfully!'));
      }
    });
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(TemplateGenerate);

    try {
      const userPrompt = flags.prompt;
      const outputFormats = flags.output
        ? flags.output.split(',').map((format) => format.trim())
        : ['json'];
      const templatePath = await this.generateTemplate(userPrompt, outputFormats);
      await this.handleDataGeneration(path. basename(templatePath));
    } catch (error: unknown) {
      this.error(`Error: ${error}`);
    }
  }
}