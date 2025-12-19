// src/commands/template/create.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand} from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import chalk from 'chalk';
import { TemplateCreator } from '../../../../utils/templateCreator.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
// You would need a new message bundle here, e.g., 'smock-it', 'template.create'
const messages = Messages.loadMessages('smock-it', 'create.default.templates'); 

// All predefined template types the utility can handle
const ALL_TEMPLATE_TYPES = ['default', 'salesprocess', 'taskray', 'cpq'] as const;
type TemplateType = typeof ALL_TEMPLATE_TYPES[number];

export default class TemplateCreate extends SfCommand<void> {
    public static readonly summary = messages.getMessage('summary') || 'Generates all default data template files.';
    public static readonly description = messages.getMessage('description') || 'Creates default, salesprocess, taskray, CPQ etc template files in the data_gen/templates directory.';

    // Helper function moved from DataTemplates/init.ts to ensure directory structure exists
    private handleDirStruct(): string {
        const cwd = process.cwd();
        const dataGenDirPath = path.join(cwd, 'data_gen');
        const templateDirPath = path.join(dataGenDirPath, 'templates');
        const outputDirPath = path.join(dataGenDirPath, 'output');
        try {
            if (!fs.existsSync(dataGenDirPath)) {
                fs.mkdirSync(dataGenDirPath, { recursive: true });
            }
            if (!fs.existsSync(templateDirPath)) fs.mkdirSync(templateDirPath, { recursive: true });
            if (!fs.existsSync(outputDirPath)) fs.mkdirSync(outputDirPath, { recursive: true });
            return templateDirPath;
        } catch (err: any) {
            throw new Error(`Failed to create 'data_gen' directory structure on path ${cwd}: ${err.message}`);
        }
    }

    public async run(): Promise<void> {
        const templateDirPath = this.handleDirStruct();
        const templateCreator = new TemplateCreator();
            
        let createdCount = 0;
        
        for (const type of ALL_TEMPLATE_TYPES) {
            try {
                templateCreator.createTemplate(templateDirPath, type as TemplateType);
                createdCount++;
            } catch (err: any) {
                this.warn(chalk.yellow(`⚠️ Could not create ${type} template: ${err.message}`));
            }
        }
        
        this.log(chalk.green(`\nSuccessfully created all default templates.`));
        
        this.log(chalk.cyan('\nYou can review and customize the generated templates using this directory:',templateDirPath));

        this.log('\nUse one of the created template file names to generate data using this command:',chalk.yellow('sf smockit data generate -t <TemplateName> -a <OrgAlias>\n'));
    }
}