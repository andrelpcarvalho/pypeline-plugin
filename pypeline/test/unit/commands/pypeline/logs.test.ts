import { expect } from 'chai';

describe('pypeline logs', () => {
  const ERROR_PATTERNS   = [/Status\s*:\s*Failed/i, /error/i, /exception/i, /ENOENT/i, /falhou/i];
  const WARNING_PATTERNS = [/warning/i, /warn/i, /aviso/i, /deprecated/i];

  function classifyLine(line: string): 'error' | 'warning' | 'info' {
    for (const p of ERROR_PATTERNS)   { if (p.test(line)) return 'error'; }
    for (const p of WARNING_PATTERNS) { if (p.test(line)) return 'warning'; }
    return 'info';
  }

  it('should classify error lines correctly', () => {
    expect(classifyLine('Status : Failed')).to.equal('error');
    expect(classifyLine('Status:Failed')).to.equal('error');
    expect(classifyLine('Some error occurred')).to.equal('error');
    expect(classifyLine('NullPointerException in line 42')).to.equal('error');
    expect(classifyLine('Deploy falhou com exit code 1')).to.equal('error');
    expect(classifyLine('ENOENT: no such file')).to.equal('error');
  });

  it('should classify warning lines correctly', () => {
    expect(classifyLine('Warning: unused variable')).to.equal('warning');
    expect(classifyLine('[WARN] something deprecated')).to.equal('warning');
    expect(classifyLine('Aviso: campo não encontrado')).to.equal('warning');
  });

  it('should classify info lines correctly', () => {
    expect(classifyLine('Deploying source...')).to.equal('info');
    expect(classifyLine('Component deployed successfully')).to.equal('info');
    expect(classifyLine('')).to.equal('info');
  });
});
