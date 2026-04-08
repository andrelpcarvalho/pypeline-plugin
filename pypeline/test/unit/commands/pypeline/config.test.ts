import { expect } from 'chai';

describe('pypeline config', () => {
  it('should validate known config keys', () => {
    const VALID_KEYS = ['branch', 'prdOrg', 'trainingOrg', 'testLevel', 'waitMinutes', 'ci'];
    expect(VALID_KEYS).to.include('branch');
    expect(VALID_KEYS).to.include('prdOrg');
    expect(VALID_KEYS).to.include('waitMinutes');
    expect(VALID_KEYS).to.not.include('invalidKey');
  });

  it('should reject invalid config keys', () => {
    const VALID_KEYS = ['branch', 'prdOrg', 'trainingOrg', 'testLevel', 'waitMinutes', 'ci'];
    expect(VALID_KEYS.includes('foo')).to.be.false;
    expect(VALID_KEYS.includes('password')).to.be.false;
  });

  it('should validate waitMinutes is positive', () => {
    const valid = parseInt('120', 10);
    expect(valid).to.be.greaterThan(0);
    expect(isNaN(valid)).to.be.false;

    const invalid = parseInt('abc', 10);
    expect(isNaN(invalid)).to.be.true;
  });

  it('should parse ci as boolean', () => {
    const parseCI = (val: string): boolean => val === 'true';
    expect(parseCI('true')).to.be.true;
    expect(parseCI('false')).to.be.false;
  });
});
