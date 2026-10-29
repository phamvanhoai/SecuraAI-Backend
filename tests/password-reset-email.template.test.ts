import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from '../src/modules/authentication-account/password-reset-email.template.js';

describe('password reset email template', () => {
  it('renders the SecuraAI email hierarchy and reset guidance', () => {
    const html = renderPasswordResetEmail({
      appName: 'SecuraAI',
      resetCode: '482913',
      expiresInMinutes: 60,
    });

    expect(html).toContain('SecuraAI');
    expect(html).toContain('Account security');
    expect(html).toContain('Reset your password');
    expect(html).toContain('482913');
    expect(html).toContain('Expires in');
    expect(html).toContain('60 minutes');
    expect(html).toContain('Never share this code');
  });

  it('escapes dynamic values before rendering HTML', () => {
    const html = renderPasswordResetEmail({
      appName: 'SecuraAI & Co',
      resetCode: '<script>alert(1)</script>',
      expiresInMinutes: 60,
    });

    expect(html).toContain('SecuraAI &amp; Co');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
