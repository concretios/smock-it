/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable sf-plugin/command-summary */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable sf-plugin/flag-case */
/* eslint-disable sf-plugin/no-missing-messages */
/* eslint-disable import/order */
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker', 'template.print');

export type TemplatePrintResult = {
  path: string;
};

export default class TemplatePrint extends SfCommand<void> {
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
    const flagNullCheck: boolean =
      flags.templateName !== undefined || flags.templateName !== null || flags.templateName !== '';
    if (flagNullCheck) {
      const __cwd = process.cwd();
      const dataGenDirPath = path.join(__cwd, 'data_gen');
      const templateDirPath = path.join(dataGenDirPath, 'templates');
      const templatePath = path.join(templateDirPath, `${flags.templateName}`);
      if (fs.existsSync(templatePath)) {
        const readTemplate = fs.readFileSync(templatePath, 'utf8');
        console.log(chalk.magenta(readTemplate));
      } else throw new Error(`File not present at path: ${templatePath}`);
    } else {
      throw new Error("Expecting value in '--template Name'");
    }
  }
}
