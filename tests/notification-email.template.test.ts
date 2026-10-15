import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from '../src/modules/notification-system-logs/notification-email.template.js';

describe('notification email template', () => {
  it('renders the SecuraAI notification hierarchy and preserves line breaks', () => {
    const html = renderNotificationEmail({
      appName: 'SecuraAI',
      subject: 'Review required',
      message: 'Review the finding.\nRespond by Friday.',
    });

    expect(html).toContain('SecuraAI');
    expect(html).toContain('Security notification');
    expect(html).toContain('Review required');
    expect(html).toContain('Review the finding.<br>Respond by Friday.');
  });

  it('escapes administrator-provided content before rendering HTML', () => {
    const html = renderNotificationEmail({
      appName: 'SecuraAI & Co',
      subject: '<img src=x onerror=alert(1)>',
      message: '<script>alert("unsafe")</script>',
    });

    expect(html).toContain('SecuraAI &amp; Co');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });
});
