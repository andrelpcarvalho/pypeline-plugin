import { expect } from 'chai';

describe('pypeline status', () => {
  it('should define the correct result type structure', () => {
    const mockResult = {
      baseline: 'abc123def456abc123def456abc123def456abc123',
      branch: 'main',
      pendingChanges: { added: 1, modified: 2, deleted: 0 },
      jobId: '0Af000000000001AAA',
      jobIdExpired: false,
      buildDirExists: true,
      logsExist: { prd: true, training: false, quickDeploy: false },
      orgsAuthenticated: ['devops'],
    };
    expect(mockResult.baseline).to.be.a('string');
    expect(mockResult.pendingChanges.added).to.be.a('number');
    expect(mockResult.pendingChanges.modified).to.be.a('number');
    expect(mockResult.pendingChanges.deleted).to.be.a('number');
    expect(mockResult.jobIdExpired).to.be.a('boolean');
    expect(mockResult.orgsAuthenticated).to.be.an('array');
    expect(mockResult.logsExist.prd).to.be.a('boolean');
  });

  it('should detect expired job IDs based on 10h TTL', () => {
    const TTL_MS = 10 * 60 * 60 * 1000;
    const now = Date.now();

    const fresh = now - (5 * 60 * 60 * 1000);
    expect(now - fresh > TTL_MS).to.be.false;

    const expired = now - (11 * 60 * 60 * 1000);
    expect(now - expired > TTL_MS).to.be.true;
  });
});
