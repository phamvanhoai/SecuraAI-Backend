import { describe, expect, it } from 'vitest';
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
