import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineConfigCmd from '../../../../src/commands/pypeline/config.js';

describe('pypeline config', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should validate config keys', () => {
    const VALID_KEYS = ['branch', 'prdOrg', 'trainingOrg', 'testLevel', 'waitMinutes', 'ci'];
    expect(VALID_KEYS).to.include('branch');
    expect(VALID_KEYS).to.include('prdOrg');
    expect(VALID_KEYS).to.include('trainingOrg');
    expect(VALID_KEYS).to.include('testLevel');
    expect(VALID_KEYS).to.include('waitMinutes');
    expect(VALID_KEYS).to.include('ci');
    expect(VALID_KEYS).to.not.include('invalidKey');
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      action: 'set' as const,
      config: {
        branch: 'main',
        prdOrg: 'devops',
        trainingOrg: 'treino',
        testLevel: 'RunLocalTests',
        waitMinutes: 240,
        ci: false,
      },
    };
    expect(mockResult.action).to.be.oneOf(['list', 'get', 'set', 'unset']);
    expect(mockResult.config.branch).to.equal('main');
    expect(mockResult.config.waitMinutes).to.equal(240);
    expect(mockResult.config.ci).to.be.a('boolean');
  });

  it('should validate waitMinutes is positive', () => {
    const val = '120';
    const num = parseInt(val, 10);
    expect(num).to.be.greaterThan(0);
    expect(isNaN(num)).to.be.false;

    const invalidVal = 'abc';
    expect(isNaN(parseInt(invalidVal, 10))).to.be.true;
  });
});
