/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Table } from 'console-table-printer';
import chalk from 'chalk';
import { ResultEntry } from './types.js';

/*
creating table output format function
*/
export function createTable(): Table {
    return new Table({
        columns: [
            { name: 'SObject(s)', alignment: 'left', color: 'yellow', title: chalk.blue('SObject(s)') },
            { name: 'JSON', alignment: 'center', color: 'green', title: chalk.blue('JSON') },
            { name: 'CSV', alignment: 'center', color: 'green', title: chalk.blue('CSV') },
            { name: 'DI', alignment: 'left', color: 'green', title: chalk.blue('DI') },
            { name: 'Failed(DI)', alignment: 'center', title: chalk.red('Failed(DI)') },
        ],
        /* border styles to table */
        style: {
            headerTop: {
                left: chalk.green('╔'),
                mid: chalk.green('╦'),
                right: chalk.green('╗'),
                other: chalk.green('═'),
            },
            headerBottom: {
                left: chalk.green('╟'),
                mid: chalk.green('╬'),
                right: chalk.green('╢'),
                other: chalk.green('═'),
            },
            tableBottom: {
                left: chalk.green('╚'),
                mid: chalk.green('╩'),
                right: chalk.green('╝'),
                other: chalk.green('═'),
            },
            vertical: chalk.green('║'),
        },
    });
  }


export function createResultEntryTable(object: string, outputFormat: string[], failedCount: number): ResultEntry {
    return {
        'SObject(s)': object.toUpperCase(),
        JSON: outputFormat.includes('json') || outputFormat.includes('JSON') ? '\u2714' : '-',
        CSV: outputFormat.includes('csv') || outputFormat.includes('CSV') ? '\u2714' : '-',
        DI: outputFormat.includes('di') || outputFormat.includes('DI') ? (failedCount > 0 ? chalk.red('X') : '\u2714') : '-',
        'Failed(DI)': failedCount,
    };
  }