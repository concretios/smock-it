import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import TemplatePrint from '../../../src/commands/template/print.js';

describe('template print', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs hello', async () => {
    await TemplatePrint.run([]);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello world');
  });

  it('runs hello with --json and no provided name', async () => {
    const result = await TemplatePrint.run([]);
    expect(result.path).to.equal('src/commands/template/print.ts');
  });

  it('runs hello world --name Astro', async () => {
    await TemplatePrint.run(['--name', 'Astro']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('hello Astro');
  });
});
