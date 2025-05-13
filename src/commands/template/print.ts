/* eslint-disable sf-plugin/no-missing-messages */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import SetupInit from '../smockit/template/print.js';
import chalk from 'chalk';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'smockit.template.print');

export type SmockitTemplateInitResult = {
  path: string;
};

export default class SmockitTemplateInit extends SfCommand<SmockitTemplateInitResult> {
  public static readonly summary: string = messages.getMessage('summary');
  public static readonly examples = [messages.getMessage('Examples')];

  public async run(): Promise<SmockitTemplateInitResult> {
    console.log(chalk.yellow('⚠️  Instead use sf smockit template print as current command will be deprecated soon'));
    try {
      const setupInit = new SetupInit(this.argv, this.config);
      await setupInit.run();
    } catch (error) {
      if (error === '') {
        process.exit(0);
      }
      throw error;
    }
    return {
      path: 'src/commands/smockit/template/print.ts',
    };
  }
}
