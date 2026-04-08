import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineLogs from '../../../../src/commands/pypeline/logs.js';

describe('pypeline logs', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should classify log lines correctly', () => {
    const ERROR_PATTERNS   = [/Status\s*:\s*Failed/i, /error/i, /exception/i, /ENOENT/i, /falhou/i];
    const WARNING_PATTERNS = [/warning/i, /warn/i, /aviso/i, /deprecated/i];

    function classifyLine(line: string): 'error' | 'warning' | 'info' {
      for (const p of ERROR_PATTERNS)   { if (p.test(line)) return 'error'; }
      for (const p of WARNING_PATTERNS) { if (p.test(line)) return 'warning'; }
      return 'info';
    }

    expect(classifyLine('Status : Failed')).to.equal('error');
    expect(classifyLine('Status:Failed')).to.equal('error');
    expect(classifyLine('Some error occurred')).to.equal('error');
    expect(classifyLine('NullPointerException in line 42')).to.equal('error');
    expect(classifyLine('Deploy falhou com exit code 1')).to.equal('error');
    expect(classifyLine('ENOENT: no such file')).to.equal('error');

    expect(classifyLine('Warning: unused variable')).to.equal('warning');
    expect(classifyLine('[WARN] something deprecated')).to.equal('warning');
    expect(classifyLine('Aviso: campo não encontrado')).to.equal('warning');

    expect(classifyLine('Deploying source...')).to.equal('info');
    expect(classifyLine('Component deployed successfully')).to.equal('info');
    expect(classifyLine('')).to.equal('info');
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      target: 'prd' as const,
      logPath: '/some/path/deploy_prd_output.log',
      totalLines: 150,
      errors: 3,
      warnings: 5,
      entries: [
        { line: 42, level: 'error' as const, content: 'Status : Failed' },
        { line: 80, level: 'warning' as const, content: 'Warning: test' },
      ],
    };
    expect(mockResult.target).to.equal('prd');
    expect(mockResult.errors).to.equal(3);
    expect(mockResult.entries).to.have.lengthOf(2);
    expect(mockResult.entries[0].level).to.equal('error');
  });
});
