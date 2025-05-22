/* eslint-disable sf-plugin/command-summary */
/* eslint-disable sf-plugin/command-example */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SfCommand } from '@salesforce/sf-plugins-core';
import SetupInit from '../smockit/template/init.js';
import chalk from 'chalk';

export type SmockitTemplateInitResult = {
  path: string;
};

export default class SmockitTemplateInit extends SfCommand<SmockitTemplateInitResult> {
  public async run(): Promise<SmockitTemplateInitResult> {
    console.log(chalk.yellow('⚠️   Heads up! This command is retiring soon. Switch to "sf smockit template init" to keep things running smoothly.'));
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
      path: 'src/commands/smockit/template/init.ts',
    };
  }
}
