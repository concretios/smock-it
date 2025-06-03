/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import SetupInit from '../smockit/data/generate.js';
import chalk from 'chalk';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'smockit.data.generate');

export type SmockitTemplateInitResult = {
  path: string;
};

export default class SmockitTemplateInit extends SfCommand<SmockitTemplateInitResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<SmockitTemplateInitResult> {
    console.log(chalk.yellow('⚠️  Heads up! This command will be retired soon. Please start using "sf smockit data generate". All new updates will be available in new command.'));
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
      path: 'src/commands/smockit/data/generate.ts',
    };
  }
}
