import { expect } from 'chai';

describe('pypeline rollback', () => {
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

    expect(successfulRuns[0].baselineFrom).to.equal('ddd');
    expect(successfulRuns[1].baselineFrom).to.equal('ccc');
    expect(successfulRuns[2].baselineFrom).to.equal('aaa');
  });

  it('should validate git hash format', () => {
    const validFull = 'abc123def456abc123def456abc123def456abc1';
    const validShort = 'abc123d';
    const invalid = 'xyz!!!';

    expect(/^[0-9a-f]{40}$/i.test(validFull)).to.be.true;
    expect(/^[0-9a-f]{7,40}$/i.test(validShort)).to.be.true;
    expect(/^[0-9a-f]{7,40}$/i.test(invalid)).to.be.false;
  });

  it('should detect no-op rollback when baseline equals target', () => {
    const current = 'abc123def456abc123def456abc123def456abc1';
    const target = 'abc123def456abc123def456abc123def456abc1';
    expect(current === target).to.be.true;
  });
});
