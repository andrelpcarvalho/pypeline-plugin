/**
 * test/unit/commands/pypeline/package.test.ts
 */

import * as childProcess from 'node:child_process';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelinePackage from '../../../../src/commands/pypeline/package.js';
import { stubSpawnSync } from '../../../helpers.js';

describe('pypeline package', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  it('deve retornar success: true quando sf retorna exit 0', async () => {
    stubSpawnSync(sandbox, 0);
    const result = await PypelinePackage.run([]);
    expect(result.success).to.be.true;
  });

  it('deve lançar erro quando sf retorna exit 1', async () => {
    stubSpawnSync(sandbox, 1);
    await expect(PypelinePackage.run([])).to.be.rejectedWith(/Falha ao gerar package\.xml/);
  });

  it('deve chamar sf com os argumentos corretos', async () => {
    const stub = stubSpawnSync(sandbox, 0);
    await PypelinePackage.run([]);

    const [bin, args] = stub.firstCall.args as [string, string[]];
    expect(bin).to.equal('sf');
    expect(args).to.include('generate');
    expect(args).to.include('manifest');
  });
});
