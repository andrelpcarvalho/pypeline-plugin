import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { GitDiffResult } from '../types.js';
import { FAKE_GIT_DIFF, FAKE_COMMIT_HASH } from '../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../src').split(pathSep).join('/');

type ConfigModule = {
  readFileTrimmed: (p: string) => string;
  writeFile: (p: string, c: string) => void;
  fileExists: (p: string) => boolean;
  unlinkIfExists: (p: string) => void;
  gitDiffFiles: (hash: string) => GitDiffResult;
};

async function loadConfig(fsOverrides: Record<string, unknown> = {}, execResult = ''): Promise<ConfigModule> {
  const raw: unknown = await esmock(`${SRC}/config.js`, {
    'node:fs': { existsSync: () => true, readFileSync: () => '',
      writeFileSync: sinon.spy(), unlinkSync: sinon.spy(), ...fsOverrides },
    'node:child_process': { execSync: () => execResult },
  });
  return raw as ConfigModule;
}

describe('config.ts', () => {
  describe('readFileTrimmed', () => {
    it('deve retornar o conteúdo sem espaços nas bordas', async () => {
      const mod = await loadConfig({ readFileSync: () => '  abc123  \n' });
      expect(mod.readFileTrimmed('/fake/baseline.txt')).to.equal('abc123');
    });
  });

  describe('writeFile', () => {
    it('deve chamar fs.writeFileSync com os argumentos corretos', async () => {
      const spy = sinon.spy();
      const mod = await loadConfig({ writeFileSync: spy });
      mod.writeFile('/fake/baseline.txt', 'hash123\n');
      expect(spy.calledOnceWith('/fake/baseline.txt', 'hash123\n', 'utf8')).to.equal(true);
    });
  });

  describe('fileExists', () => {
    it('deve retornar true quando o arquivo existe', async () => {
      const mod = await loadConfig({ existsSync: () => true });
      expect(mod.fileExists('/fake/file.txt')).to.equal(true);
    });

    it('deve retornar false quando o arquivo não existe', async () => {
      const mod = await loadConfig({ existsSync: () => false });
      expect(mod.fileExists('/fake/file.txt')).to.equal(false);
    });
  });

  describe('unlinkIfExists', () => {
    it('não deve lançar erro se o arquivo não existir', async () => {
      const mod = await loadConfig({ unlinkSync: () => { throw new Error('ENOENT'); } });
      expect(() => mod.unlinkIfExists('/fake/file.txt')).to.not.throw();
    });

    it('deve chamar unlinkSync quando o arquivo existe', async () => {
      const spy = sinon.spy();
      const mod = await loadConfig({ unlinkSync: spy });
      mod.unlinkIfExists('/fake/file.txt');
      expect(spy.calledOnce).to.equal(true);
    });
  });

  describe('gitDiffFiles', () => {
    it('deve classificar arquivos em added, modified, deleted e notDeleted', async () => {
      const mod = await loadConfig({}, FAKE_GIT_DIFF);
      const result = mod.gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.notDeleted).to.have.length(2);
      expect(result.added).to.have.length(1);
      expect(result.modified).to.have.length(1);
      expect(result.deleted).to.have.length(1);
    });

    it('deve ignorar linhas vazias no diff', async () => {
      const mod = await loadConfig({}, '\n\n' + FAKE_GIT_DIFF + '\n\n');
      expect(mod.gitDiffFiles(FAKE_COMMIT_HASH).notDeleted).to.have.length(2);
    });

    it('deve retornar listas vazias se não houver diff', async () => {
      const mod = await loadConfig({}, '');
      const result = mod.gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.added).to.deep.equal([]);
      expect(result.modified).to.deep.equal([]);
      expect(result.deleted).to.deep.equal([]);
    });
  });
});
