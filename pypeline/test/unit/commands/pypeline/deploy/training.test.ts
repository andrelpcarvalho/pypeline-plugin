/**
 * test/unit/commands/pypeline/deploy/training.test.ts
 *
 * CONCEITO DE PROMISE + EVENTEMITTER FAKE:
 * O comando deploy training usa spawn() e escuta eventos ('data', 'close').
 * Em vez de subir um processo real, criamos um objeto que imita
 * essa interface (stdout.on, stderr.on, proc.on) e dispara os eventos
 * de forma síncrona durante o teste.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineDeployTraining from '../../../../../src/commands/pypeline/deploy/training.js';
import { stubSpawn, stubCreateWriteStream } from '../../../../helpers.js';

describe('pypeline deploy training', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  it('deve retornar success: true quando o deploy passa', async () => {
    stubSpawn(sandbox, { exitCode: 0, lines: ['Deploy successful\n'] });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'unlinkSync');

    const result = await PypelineDeployTraining.run([]);
    expect(result.success).to.be.true;
  });

  it('deve lançar erro quando o deploy falha (exit code 1)', async () => {
    stubSpawn(sandbox, { exitCode: 1, lines: ['Error: something went wrong\n'] });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'unlinkSync');

    await expect(PypelineDeployTraining.run([])).to.be.rejectedWith(/falhou com exit code 1/);
  });

  it('deve respeitar flag --target-org customizada', async () => {
    const spawnStub = stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'unlinkSync');

    await PypelineDeployTraining.run(['--target-org', 'minha-org-treino']);

    const args: string[] = spawnStub.firstCall.args[1];
    expect(args).to.include('minha-org-treino');
  });

  it('deve respeitar flag --wait customizada', async () => {
    const spawnStub = stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'unlinkSync');

    await PypelineDeployTraining.run(['--wait', '60']);

    const args: string[] = spawnStub.firstCall.args[1];
    expect(args).to.include('60');
  });

  it('deve gravar o output em um arquivo de log', async () => {
    stubSpawn(sandbox, { exitCode: 0, lines: ['linha de log\n'] });
    const { write: writeStub } = stubCreateWriteStream(sandbox);
    sandbox.stub(fs, 'unlinkSync');

    await PypelineDeployTraining.run([]);

    expect(writeStub.called).to.be.true;
    const written = writeStub.args.map((a: unknown[]) => String(a[0])).join('');
    expect(written).to.include('linha de log');
  });
});
