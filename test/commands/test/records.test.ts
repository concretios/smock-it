// import { TestContext } from '@salesforce/core/testSetup';
// import { expect } from 'chai';
// import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
// import TestRecords from '../../../src/commands/test/records.js';

// describe('test records', () => {
//   const $$ = new TestContext();
//   let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

//   beforeEach(() => {
//     sfCommandStubs = stubSfCommandUx($$.SANDBOX);
//   });

//   afterEach(() => {
//     $$.restore();
//   });

// it('runs hello', async () => {
//   await TestRecords.run([]);
//   const output = sfCommandStubs.log
//     .getCalls()
//     .flatMap((c) => c.args)
//     .join('\n');
//   expect(output).to.include('hello world');
// });

// it('runs hello with --json and no provided name', async () => {
//   const result = await TestRecords.run([]);
//   expect(result.path).to.equal('C:\\Users\\vishk\\testdatagenmockaroo\\src\\commands\\test\\records.ts');
// });

// it('runs hello world --name Astro', async () => {
//   await TestRecords.run(['--name', 'Astro']);
//   const output = sfCommandStubs.log
//     .getCalls()
//     .flatMap((c) => c.args)
//     .join('\n');
//   expect(output).to.include('hello Astro');
// });
// });
