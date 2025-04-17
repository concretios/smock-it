/* eslint-disable sf-plugin/flag-case */

import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { DataGenerationService } from '../../services/data-generation-service.js';
import { DataGenerateResult } from '../../utils/types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('smocker-concretio', 'data.generate');

export default class DataGenerate extends SfCommand<DataGenerateResult> {
  public static readonly summary: string = messages.getMessage('summary');
  public static readonly examples: string[] = [messages.getMessage('Examples')];

  public static readonly flags = {
    sObjects: Flags.string({
      char: 's',
      summary: messages.getMessage('flags.sObjects.summary'),
      required: false,
    }),
    templateName: Flags.string({
      char: 't',
      summary: messages.getMessage('flags.templateName.summary'),
      description: messages.getMessage('flags.templateName.description'),
      required: true,
    }),
    alias: Flags.string({
      char: 'a',
      summary: messages.getMessage('flags.alias.summary'),
      description: messages.getMessage('flags.alias.description'),
      required: true,
    }),
  };

  public async run(): Promise<DataGenerateResult> {
    const { flags } = await this.parse(DataGenerate);
    const service = new DataGenerationService(flags);
    const result = await service.execute();
    return result;
  }
}
