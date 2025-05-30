/**
 * Copyright (c) 2025 concret.io
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import chalk from 'chalk';

// import SetupInit from '../smockit/template/upsert.js';
import SetupInit from '../smockit/template/upsert.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smock-it', 'smockit.template.upsert');

export type SmockitTemplateUpsertResult = {
  path: string;
};

export default class SmockitTemplateUpsert extends SfCommand<SmockitTemplateUpsertResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: false,
    }),
  };

  public async run(): Promise<SmockitTemplateUpsertResult> {
    console.log(chalk.yellow('⚠️  Heads up! This command will be retired soon. Please start using "sf smockit template upsert". All new updates will be available in new command.'));
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
      path: 'src/commands/smockit/template/upsert.ts',
    };
  }
}
