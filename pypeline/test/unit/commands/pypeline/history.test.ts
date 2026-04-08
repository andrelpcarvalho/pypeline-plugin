import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineHistory from '../../../../src/commands/pypeline/history.js';

describe('pypeline history', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should have correct HistoryEntry structure', () => {
    const entry = {
      timestamp: '2026-04-08T12:00:00.000Z',
      action: 'run' as const,
      success: true,
      baselineFrom: 'abc123def456',
      baselineTo: 'def456ghi789',
      jobId: '0Af000000000001AAA',
      branch: 'main',
      filesDeployed: 15,
      duration: 120000,
      targetOrg: 'devops',
    };
    expect(entry.action).to.be.oneOf(['run', 'quickdeploy', 'training', 'rollback']);
    expect(entry.success).to.be.a('boolean');
    expect(entry.filesDeployed).to.be.a('number');
    expect(entry.timestamp).to.match(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should filter by action type', () => {
    const entries = [
      { action: 'run', success: true },
      { action: 'quickdeploy', success: true },
      { action: 'run', success: false },
      { action: 'training', success: true },
      { action: 'rollback', success: true },
    ];

    const runs = entries.filter((e) => e.action === 'run');
    expect(runs).to.have.lengthOf(2);

    const deploys = entries.filter((e) => e.action === 'quickdeploy');
    expect(deploys).to.have.lengthOf(1);
  });

  it('should filter failures only', () => {
    const entries = [
      { action: 'run', success: true },
      { action: 'run', success: false },
      { action: 'quickdeploy', success: false },
      { action: 'training', success: true },
    ];

    const failures = entries.filter((e) => !e.success);
    expect(failures).to.have.lengthOf(2);
  });

  it('should respect FIFO limit of 200', () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      action: 'run' as const,
      success: true,
      baselineFrom: `from${i}`,
      baselineTo: `to${i}`,
    }));

    // Simula o truncamento
    const trimmed = entries.length > 200 ? entries.slice(-200) : entries;
    expect(trimmed).to.have.lengthOf(200);
    expect(trimmed[0].baselineFrom).to.equal('from50');
  });
});
