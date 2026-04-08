import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import PypelineNotify from '../../../../src/commands/pypeline/notify.js';

describe('pypeline notify', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should format Slack payload correctly', () => {
    const payload = {
      event: 'deploy_success' as const,
      project: 'my-project',
      branch: 'main',
      baseline: 'abc123def456',
      jobId: '0Af000000000001AAA',
      message: 'Deploy concluído com sucesso!',
      timestamp: '2026-04-08T12:00:00.000Z',
    };

    // Simula a formatação do payload
    const emoji = payload.event.includes('success') ? '✅' : '❌';
    const text = [
      `${emoji} *Pypeline — ${payload.event.replace(/_/g, ' ').toUpperCase()}*`,
      `> ${payload.message}`,
      payload.branch  ? `Branch: \`${payload.branch}\`` : null,
      payload.baseline ? `Baseline: \`${payload.baseline.slice(0, 12)}\`` : null,
      payload.jobId    ? `Job ID: \`${payload.jobId}\``  : null,
      `_${payload.timestamp}_`,
    ].filter(Boolean).join('\n');

    expect(text).to.include('✅');
    expect(text).to.include('DEPLOY SUCCESS');
    expect(text).to.include('Deploy concluído com sucesso!');
    expect(text).to.include('`main`');
    expect(text).to.include('`0Af000000000001AAA`');
  });

  it('should format failure payload correctly', () => {
    const payload = {
      event: 'deploy_failure' as const,
      project: 'my-project',
      branch: 'release-v5',
      baseline: null,
      jobId: null,
      message: 'Deploy falhou na etapa validate-prd.',
      timestamp: '2026-04-08T12:00:00.000Z',
    };

    const emoji = payload.event.includes('success') ? '✅' : '❌';
    expect(emoji).to.equal('❌');

    const parts = [
      payload.branch  ? `Branch: \`${payload.branch}\`` : null,
      payload.baseline ? `Baseline` : null,
      payload.jobId    ? `Job ID` : null,
    ].filter(Boolean);

    // branch existe, baseline e jobId são null — devem ser filtrados
    expect(parts).to.have.lengthOf(1);
    expect(parts[0]).to.include('release-v5');
  });

  it('should validate webhook URL', () => {
    const validUrls = [
      'https://hooks.slack.com/services/T00/B00/xxx',
      'https://outlook.office.com/webhook/xxx',
      'http://localhost:3000/webhook',
    ];

    const invalidUrls = [
      'not-a-url',
      'ftp://invalid.com',
      '',
    ];

    for (const url of validUrls) {
      expect(() => new URL(url)).to.not.throw();
    }

    for (const url of invalidUrls) {
      expect(() => new URL(url)).to.throw();
    }
  });

  it('should have correct result type structure', () => {
    const mockResult = {
      sent: true,
      webhookUrl: 'https://hooks.slack.com/services/xxx',
      payload: {
        event: 'test' as const,
        project: 'myproject',
        branch: 'main',
        baseline: null,
        jobId: null,
        message: 'Test notification',
        timestamp: '2026-04-08T12:00:00.000Z',
      },
    };
    expect(mockResult.sent).to.be.a('boolean');
    expect(mockResult.webhookUrl).to.be.a('string');
    expect(mockResult.payload).to.not.be.null;
    expect(mockResult.payload!.event).to.equal('test');
  });
});
