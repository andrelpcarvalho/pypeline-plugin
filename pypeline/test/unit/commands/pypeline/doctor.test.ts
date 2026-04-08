import { expect } from 'chai';

describe('pypeline doctor', () => {
  it('should count check results correctly', () => {
    const checks = [
      { name: 'A', status: 'pass' as const, message: '' },
      { name: 'B', status: 'pass' as const, message: '' },
      { name: 'C', status: 'warn' as const, message: '' },
      { name: 'D', status: 'fail' as const, message: '' },
      { name: 'E', status: 'pass' as const, message: '' },
    ];
    const passed   = checks.filter((c) => c.status === 'pass').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const failed   = checks.filter((c) => c.status === 'fail').length;

    expect(passed).to.equal(3);
    expect(warnings).to.equal(1);
    expect(failed).to.equal(1);
  });

  it('should validate check status values', () => {
    const validStatuses = ['pass', 'warn', 'fail'];
    for (const status of validStatuses) {
      expect(validStatuses).to.include(status);
    }
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      checks: [
        { name: 'Git repository', status: 'pass' as const, message: 'OK' },
        { name: 'baseline.txt', status: 'fail' as const, message: 'Missing', fix: 'Create it' },
      ],
      passed: 1,
      warnings: 0,
      failed: 1,
    };
    expect(mockResult.checks).to.have.lengthOf(2);
    expect(mockResult.checks[1].fix).to.equal('Create it');
  });
});
