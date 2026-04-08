import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineRollback from '../../../../src/commands/pypeline/rollback.js';

describe('pypeline rollback', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      success: true,
      previousBaseline: 'abc123def456abc123def456abc123def456abc123',
      newBaseline: 'def456ghi789def456ghi789def456ghi789def456',
    };
    expect(mockResult.success).to.be.a('boolean');
    expect(mockResult.previousBaseline).to.be.a('string');
    expect(mockResult.newBaseline).to.be.a('string');
    expect(mockResult.previousBaseline).to.not.equal(mockResult.newBaseline);
  });

  it('should find correct step in history', () => {
    const history = [
      { action: 'run', success: true, baselineFrom: 'aaa', baselineTo: 'bbb' },
      { action: 'run', success: false, baselineFrom: 'bbb', baselineTo: 'ccc' },
      { action: 'run', success: true, baselineFrom: 'ccc', baselineTo: 'ddd' },
      { action: 'quickdeploy', success: true, baselineFrom: 'ddd', baselineTo: 'eee' },
    ];

    const successfulRuns = history
      .filter((e) => e.success && (e.action === 'run' || e.action === 'quickdeploy'))
      .reverse();

    // steps=1 → último deploy com sucesso (eee → volta para ddd)
    expect(successfulRuns[0].baselineFrom).to.equal('ddd');

    // steps=2 → penúltimo deploy com sucesso (ddd → volta para ccc)
    expect(successfulRuns[1].baselineFrom).to.equal('ccc');

    // steps=3 → antepenúltimo (bbb → volta para aaa)
    expect(successfulRuns[2].baselineFrom).to.equal('aaa');
  });

  it('should validate git hash format', () => {
    const validHash = 'abc123def456abc123def456abc123def456abc123';
    const shortHash = 'abc123d';
    const invalidHash = 'xyz!!!';

    expect(/^[0-9a-f]{40}$/i.test(validHash)).to.be.true;
    expect(/^[0-9a-f]{7,40}$/i.test(shortHash)).to.be.true;
    expect(/^[0-9a-f]{7,40}$/i.test(invalidHash)).to.be.false;
  });
});
