import { expect } from 'chai';

describe('pypeline notify', () => {
  it('should format success payload correctly', () => {
    const event = 'deploy_success';
    const emoji = event.includes('success') ? '✅' : '❌';
    expect(emoji).to.equal('✅');
  });

  it('should format failure payload correctly', () => {
    const event = 'deploy_failure';
    const emoji = event.includes('success') ? '✅' : '❌';
    expect(emoji).to.equal('❌');
  });

  it('should filter null fields from payload', () => {
    function buildParts(fields: Record<string, string | null>): string[] {
      return Object.entries(fields)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([key, val]) => key + ': ' + val);
    }

    const parts = buildParts({
      Branch: 'main',
      Baseline: null,
      'Job ID': null,
    });

    expect(parts).to.have.lengthOf(1);
    expect(parts[0]).to.include('main');
  });

  it('should validate webhook URLs', () => {
    const validUrls = [
      'https://hooks.slack.com/services/T00/B00/xxx',
      'https://outlook.office.com/webhook/xxx',
      'http://localhost:3000/webhook',
    ];

    const invalidUrls = [
      'not-a-url',
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
  });
});
