/* eslint-disable sf-plugin/flag-case */
import fs from 'node:fs';
import path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import chalk from 'chalk';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'template.print');

export type TemplatePrintResult = {
  path: string;
};

export default class TemplatePrint extends SfCommand<void> {
  public static readonly summary: string = messages.getMessage('summary');
  public static readonly examples = [messages.getMessage('Examples')];

  public static readonly flags = {
    templateName: Flags.string({
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      char: 't',
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TemplatePrint);

    let fileName = flags['templateName'];
    if (!fileName) {
      this.error('Error: You must specify a filename using the --template-name flag.');
    } else if (!fileName.endsWith('.json')) {
      fileName += '.json';
    }
    const flagNullCheck: boolean = fileName !== undefined || fileName !== null || fileName !== '';
    if (flagNullCheck) {
      const cwd = process.cwd();
      const dataGenDirPath = path.join(cwd, 'data_gen');
      const templateDirPath = path.join(dataGenDirPath, 'templates');
      const templatePath = path.join(templateDirPath, fileName);
      if (fs.existsSync(templatePath)) {
        const readTemplate = fs.readFileSync(templatePath, 'utf8');
        console.log(chalk.magenta(readTemplate));
      } else throw new Error(`File not present at path: ${templatePath}`);
    } else {
      throw new Error("Expecting value in '--template Name'");
    }
  }
}
