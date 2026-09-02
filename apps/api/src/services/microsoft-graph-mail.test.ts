import { describe, it, expect } from 'vitest';
import { buildGraphMessage, mapGraphMessage, type GraphInboxMessage } from './microsoft-graph-mail.js';

describe('buildGraphMessage', () => {
  it('maps a simple HTML email to the Graph message shape', () => {
    const msg = buildGraphMessage({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi there</p>',
    });

    expect(msg).toMatchObject({
      subject: 'Hello',
      body: { contentType: 'HTML', content: '<p>Hi there</p>' },
      toRecipients: [{ emailAddress: { address: 'user@example.com' } }],
    });
    expect(msg.attachments).toBeUndefined();
    expect(msg.replyTo).toBeUndefined();
  });

  it('falls back to text content when no html is given', () => {
    const msg = buildGraphMessage({ to: 'a@b.com', subject: 'S', text: 'plain body' });
    expect((msg.body as Record<string, unknown>).content).toBe('plain body');
  });

  it('includes replyTo and base64 file attachments', () => {
    const msg = buildGraphMessage({
      to: 'user@example.com',
      subject: 'With attachment',
      html: '<p>See attached</p>',
      replyTo: 'reply@example.com',
      attachments: [{ filename: 'note.txt', content: 'hello', contentType: 'text/plain' }],
    });

    expect(msg.replyTo).toEqual([{ emailAddress: { address: 'reply@example.com' } }]);
    const atts = msg.attachments as Array<Record<string, unknown>>;
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'note.txt',
      contentType: 'text/plain',
      contentBytes: Buffer.from('hello').toString('base64'),
    });
  });

  it('base64-encodes Buffer attachment content', () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    const msg = buildGraphMessage({
      to: 'x@y.com', subject: 'bin', html: 'x',
      attachments: [{ filename: 'blob.bin', content: buf }],
    });
    const atts = msg.attachments as Array<Record<string, unknown>>;
    expect(atts[0].contentBytes).toBe(buf.toString('base64'));
    expect(atts[0].contentType).toBe('application/octet-stream');
  });
});

describe('mapGraphMessage', () => {
  const base: GraphInboxMessage = {
    id: 'AAMkAGabc',
    subject: 'Need help',
    isRead: false,
    internetMessageId: '<abc123@contoso.com>',
    from: { emailAddress: { name: 'Jane Doe', address: 'Jane.Doe@Contoso.com' } },
    toRecipients: [{ emailAddress: { name: 'Support', address: 'Support@Rivertown.com' } }],
    body: { contentType: 'html', content: '<p>My printer<br>is broken</p>' },
    bodyPreview: 'My printer is broken',
  };

  it('extracts and lowercases sender/recipient and keeps internetMessageId for dedupe', () => {
    const m = mapGraphMessage(base);
    expect(m.graphId).toBe('AAMkAGabc');
    expect(m.messageId).toBe('<abc123@contoso.com>');
    expect(m.fromAddress).toBe('jane.doe@contoso.com');
    expect(m.fromName).toBe('Jane Doe');
    expect(m.toAddress).toBe('support@rivertown.com');
    expect(m.subject).toBe('Need help');
    expect(m.bodyHtml).toBe('<p>My printer<br>is broken</p>');
    expect(m.bodyText).toBe('My printer\nis broken');
  });

  it('falls back to the Graph id when internetMessageId is missing', () => {
    const m = mapGraphMessage({ ...base, internetMessageId: '' });
    expect(m.messageId).toBe('AAMkAGabc');
  });

  it('handles plain-text bodies and missing subject', () => {
    const m = mapGraphMessage({
      ...base,
      subject: '',
      body: { contentType: 'text', content: 'just text' },
    });
    expect(m.bodyHtml).toBeUndefined();
    expect(m.bodyText).toBe('just text');
    expect(m.subject).toBe('(No subject)');
  });
});
