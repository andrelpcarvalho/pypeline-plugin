/**
 * test/unit/config.test.ts
 *
 * Testa as funções utilitárias de config.ts:
 * - findProjectDir: resolve o caminho da pasta raiz
 * - readFileTrimmed, writeFile, fileExists, unlinkIfExists, gitDiffFiles
 *
 * CONCEITO DE SANDBOX:
 * sinon.createSandbox() cria um espaço isolado de stubs.
 * sandbox.restore() no afterEach desfaz TODOS os stubs de uma vez,
 * garantindo que um teste não afete o próximo.
 */

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  readFileTrimmed,
  writeFile,
  fileExists,
  unlinkIfExists,
  gitDiffFiles,
} from '../../src/config.js';
import { FAKE_GIT_DIFF, FAKE_COMMIT_HASH } from '../helpers.js';

describe('config.ts', () => {
  let sandbox: sinon.SinonSandbox;

  // Antes de cada teste, criamos um sandbox limpo
  beforeEach(() => { sandbox = sinon.createSandbox(); });

  // Depois de cada teste, desfazemos todos os stubs
  afterEach(() => { sandbox.restore(); });

  // ── readFileTrimmed ────────────────────────────────────────────────────

  describe('readFileTrimmed', () => {
    it('deve retornar o conteúdo do arquivo sem espaços nas bordas', () => {
      sandbox.stub(fs, 'readFileSync').returns('  abc123  \n');
      const result = readFileTrimmed('/fake/path/baseline.txt');
      expect(result).to.equal('abc123');
    });
  });

  // ── writeFile ──────────────────────────────────────────────────────────

  describe('writeFile', () => {
    it('deve chamar fs.writeFileSync com os argumentos corretos', () => {
      const stub = sandbox.stub(fs, 'writeFileSync');
      writeFile('/fake/baseline.txt', 'hash123\n');
      expect(stub.calledOnceWith('/fake/baseline.txt', 'hash123\n', 'utf8')).to.be.true;
    });
  });

  // ── fileExists ─────────────────────────────────────────────────────────

  describe('fileExists', () => {
    it('deve retornar true quando o arquivo existe', () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      expect(fileExists('/fake/file.txt')).to.be.true;
    });

    it('deve retornar false quando o arquivo não existe', () => {
      sandbox.stub(fs, 'existsSync').returns(false);
      expect(fileExists('/fake/file.txt')).to.be.false;
    });
  });

  // ── unlinkIfExists ─────────────────────────────────────────────────────

  describe('unlinkIfExists', () => {
    it('não deve lançar erro se o arquivo não existir', () => {
      sandbox.stub(fs, 'unlinkSync').throws(new Error('ENOENT'));
      // Deve engolir o erro silenciosamente
      expect(() => unlinkIfExists('/fake/file.txt')).to.not.throw();
    });

    it('deve chamar unlinkSync quando o arquivo existe', () => {
      const stub = sandbox.stub(fs, 'unlinkSync');
      unlinkIfExists('/fake/file.txt');
      expect(stub.calledOnce).to.be.true;
    });
  });

  // ── gitDiffFiles ───────────────────────────────────────────────────────

  describe('gitDiffFiles', () => {
    it('deve classificar arquivos em added, modified, deleted e notDeleted', () => {
      sandbox.stub(childProcess, 'execSync').returns(FAKE_GIT_DIFF);

      const result = gitDiffFiles(FAKE_COMMIT_HASH);

      // notDeleted contém added + modified
      expect(result.notDeleted).to.have.length(2);
      expect(result.added).to.have.length(1);
      expect(result.modified).to.have.length(1);
      expect(result.deleted).to.have.length(1);
    });

    it('deve ignorar linhas vazias no diff', () => {
      sandbox.stub(childProcess, 'execSync').returns('\n\n' + FAKE_GIT_DIFF + '\n\n');
      const result = gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.notDeleted).to.have.length(2);
    });

    it('deve retornar listas vazias se não houver diff', () => {
      sandbox.stub(childProcess, 'execSync').returns('');
      const result = gitDiffFiles(FAKE_COMMIT_HASH);
      expect(result.added).to.deep.equal([]);
      expect(result.modified).to.deep.equal([]);
      expect(result.deleted).to.deep.equal([]);
    });
  });
});
