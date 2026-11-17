import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAccountCreatedEmail } from '../src/modules/user-management-authorization/account-created-email.template.js';

describe('account created email template', () => {
  it('renders onboarding details in the shared SecuraAI layout', () => {
    const html = renderAccountCreatedEmail({
      appName: 'SecuraAI',
      fullName: 'Test Employee',
      email: 'employee@example.com',
      temporaryPassword: 'Temporary-Password-1',
    });

    expect(html).toContain('Account provisioned');
    expect(html).toContain('Your account is ready');
    expect(html).toContain('employee@example.com');
    expect(html).toContain('Temporary-Password-1');
    expect(html).toContain('change this password immediately');
  });

  it('escapes recipient and credential values', () => {
    const html = renderAccountCreatedEmail({
      appName: 'SecuraAI & Co',
      fullName: '<script>alert(1)</script>',
      email: 'user+<unsafe>@example.com',
      temporaryPassword: '<temporary>',
    });

    expect(html).toContain('SecuraAI &amp; Co');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('user+&lt;unsafe&gt;@example.com');
    expect(html).toContain('&lt;temporary&gt;');
    expect(html).not.toContain('<script>');
  });

  it('does not render a CTA for a non-HTTP login URL', () => {
    const html = renderAccountCreatedEmail({
      appName: 'SecuraAI',
      fullName: 'Test Employee',
      email: 'employee@example.com',
      temporaryPassword: 'Temporary-Password-1',
      loginUrl: 'javascript:alert(1)',
    });

    expect(html).not.toContain('javascript:alert(1)');
  });
});

const smtp = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => smtp } }));
vi.mock('../src/config/env.js', () => ({
  env: {
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'sender@example.test',
    SMTP_PASS: 'test-only',
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    APP_NAME: 'SecuraAI',
  },
}));
import { usersEmailService } from '../src/modules/user-management-authorization/users.email.service.js';
describe('account email acceptance', () => {
  beforeEach(() => vi.resetAllMocks());
  const input = {
    email: 'recipient@example.test',
    fullName: 'Test Recipient',
    temporaryPassword: 'Test-only-A!',
  };
  it('succeeds only when SMTP accepts the intended recipient', async () => {
    smtp.sendMail.mockResolvedValue({ accepted: [input.email], rejected: [] });
    await expect(usersEmailService.sendAccountCreated(input)).resolves.toBeUndefined();
  });
  it('rejects SMTP results with no accepted recipient', async () => {
    smtp.sendMail.mockResolvedValue({ accepted: [], rejected: [input.email] });
    await expect(usersEmailService.sendAccountCreated(input)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
    });
  });
  it('does not accept a different recipient as success', async () => {
    smtp.sendMail.mockResolvedValue({ accepted: ['someone-else@example.test'] });
    await expect(usersEmailService.sendAccountCreated(input)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
    });
  });
  it('propagates SMTP rejection for provisioning compensation', async () => {
    smtp.sendMail.mockRejectedValue(new Error('SMTP down'));
    await expect(usersEmailService.sendAccountCreated(input)).rejects.toThrow('SMTP down');
  });
});
