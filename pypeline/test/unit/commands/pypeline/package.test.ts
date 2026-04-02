import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import type { EsmockModule, PackageResult } from '../../../types.js';
import { assertRejects } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

async function loadPackage(exitCode: number): Promise<EsmockModule<PackageResult>> {
  const raw: unknown = await esmock(`${SRC}/commands/pypeline/package.js`, {
    'node:child_process': {
      spawn: (_bin: string, args: string[]) => {
        void args;
        return { on: (e: string, cb: (c: number) => void) => { if (e === 'close') cb(exitCode); } };
      },
    },
    [`${SRC}/config.js`]: { BUILD_DIR: () => '/fake/build' },
  });
  return raw as EsmockModule<PackageResult>;
}

describe('pypeline package', () => {
  it('deve retornar success: true quando sf retorna exit 0', async () => {
    const { default: Cmd } = await loadPackage(0);
    const result = await Cmd.run([]);
    expect(result.success).to.equal(true);
  });

  it('deve lançar erro quando sf retorna exit 1', async () => {
    const { default: Cmd } = await loadPackage(1);
    await assertRejects(Cmd.run([]), /Falha ao gerar package\.xml/);
  });

  it('deve chamar sf com os argumentos corretos', async () => {
    let capturedArgs: string[] = [];
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/package.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: string[]) => {
          capturedArgs = [...args];
          return { on: (e: string, cb: (c: number) => void) => { if (e === 'close') cb(0); } };
        },
      },
      [`${SRC}/config.js`]: { BUILD_DIR: () => '/fake/build' },
    });
    const { default: Cmd } = raw as EsmockModule<PackageResult>;
    await Cmd.run([]);
    expect(capturedArgs).to.include('generate');
    expect(capturedArgs).to.include('manifest');
  });
});
