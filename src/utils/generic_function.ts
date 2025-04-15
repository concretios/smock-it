
import * as fs from 'node:fs';
import path from 'node:path';
import { error } from '@oclif/core/errors';
import {Connection, AuthInfo } from '@salesforce/core';
import chalk from 'chalk';

/* checking valid directory structure for json data template */
export function getTemplateJsonPath(templateName: string): string {
  const filename = templateName.endsWith('.json') ? templateName : `${templateName}.json`;
  if (!filename) {
    throw error('Error: You must specify a filename using the --template-name flag.');
  }
  const templateDirPath = path.join(process.cwd(), 'data_gen/templates');
  if (!fs.existsSync(templateDirPath)) {
    throw error(`Template directory does not exist at ${templateDirPath}. Please initialize the setup first.`);
  }
  const configFilePath = path.join(templateDirPath, filename);
  if (!fs.existsSync(configFilePath)) {
    throw error(`Data Template file not found at ${configFilePath}`);
  }
  return configFilePath;
}

/** connect to Salesforce org using username or alias **/
export async function connectToSalesforceOrg(userNameorAlias: string): Promise<Connection> {
  try {
    const allAuths = await AuthInfo.listAllAuthorizations();
    const matchingAuths = allAuths.filter(
      (auth) => auth.username === userNameorAlias || (auth.aliases && auth.aliases.includes(userNameorAlias))
    );
    const resolvedUsername = matchingAuths[0].username;
    if (matchingAuths.length === 0) {
      throw new Error(`The input "${userNameorAlias}" does not match any authenticated username or alias.`);
    }
    const authInfo = await AuthInfo.create({ username: resolvedUsername });
    const connection = await Connection.create({ authInfo });
    console.log(chalk.green(`Success: Connected to SF Org: ${resolvedUsername}`));
    return connection;
  } catch (err) {
    throw new Error(
      chalk.red(
        `Failed: Connect to SF Org: ${chalk.redBright(
          userNameorAlias
        )} \n Either provide valid username/alias or authenticate your org using ${chalk.yellowBright(
          "'sf org login web'"
        )}`
      )
    );
  }
}
