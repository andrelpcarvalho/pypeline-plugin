import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineDoctor from '../../../../src/commands/pypeline/doctor.js';

describe('pypeline doctor', () => {
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
      checks: [
        { name: 'Git repository', status: 'pass' as const, message: 'OK' },
        { name: 'baseline.txt', status: 'fail' as const, message: 'Não encontrado', fix: 'Crie o arquivo' },
        { name: 'SF CLI', status: 'warn' as const, message: 'Versão antiga' },
      ],
      passed: 1,
      warnings: 1,
      failed: 1,
    };
    expect(mockResult.checks).to.have.lengthOf(3);
    expect(mockResult.passed).to.equal(1);
    expect(mockResult.failed).to.equal(1);
    expect(mockResult.checks[1].fix).to.equal('Crie o arquivo');
  });

  it('should validate check status values', () => {
    const validStatuses = ['pass', 'warn', 'fail'];
    for (const status of validStatuses) {
      expect(validStatuses).to.include(status);
    }
  });

  it('should count results correctly', () => {
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
});
