import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

// Escape user-controlled text before it's interpolated into the trusted HTML template
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ProposalData {
  title: string;
  status: string;
  agency: string;
  opportunityTitle: string;
  samNumber: string;
  submissionDeadline: string | null;
  sections: Array<{ title: string; content: string; order: number }>;
}

function mdToHtml(md: string): string {
  return md
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\|(.+)\|/g, (row) => {
      const cells = row.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
      const tag = cells.some(c => /^\*\*/.test(c.trim())) ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c.trim().replace(/\*\*/g, '')}</${tag}>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (m) => `<table>${m}</table>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export function PublicProposalPage({ token }: { token: string }) {
  const [data, setData] = useState<ProposalData | null>(null);
  const [error, setError] = useState('');

  const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

  useEffect(() => {
    fetch(`${API_BASE}/api/public/proposals/${token}`)
      .then(r => { if (!r.ok) throw new Error('Proposal not found'); return r.json(); })
      .then(setData)
      .catch(() => setError('This proposal link is invalid or has been revoked.'));
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Segoe UI, Calibri, Arial, sans-serif', color: '#555' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24pt', color: '#1e3a5f', marginBottom: 12 }}>Proposal Not Found</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Segoe UI, Calibri, Arial, sans-serif', color: '#555' }}>
        Loading proposal...
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const deadline = data.submissionDeadline ? new Date(data.submissionDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const sections = data.sections.sort((a, b) => a.order - b.order);

  return (
    <div
      style={{ fontFamily: 'Segoe UI, Calibri, Arial, sans-serif', fontSize: '11pt', lineHeight: 1.6, color: '#1a1a1a', maxWidth: 850, margin: '0 auto', padding: '20px 40px' }}
      dangerouslySetInnerHTML={{
        __html: `
<style>
  @page { size: letter; margin: 0.75in 1in 1in 1in; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 30px; font-size: 7.5pt; color: #999; display: flex; justify-content: space-between; align-items: center; padding: 0 1in; border-top: 1px solid #ddd; }
    .page-content { padding-bottom: 40px; }
  }
  .cover { page-break-after: always; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 90vh; text-align: center; padding: 2in 1in; }
  .cover-logo { width: 180px; margin-bottom: 40px; }
  .cover-title { font-size: 28pt; font-weight: 700; color: #1e3a5f; margin-bottom: 12px; line-height: 1.2; }
  .cover-subtitle { font-size: 16pt; color: #4a6f8a; margin-bottom: 40px; }
  .cover-meta { font-size: 11pt; color: #555; line-height: 2; }
  .cover-meta strong { color: #1a1a1a; }
  .cover-divider { width: 80px; height: 3px; background: #1e3a5f; margin: 30px auto; }
  .toc { page-break-after: always; padding-top: 40px; }
  .toc h1 { font-size: 20pt; color: #1e3a5f; margin-bottom: 24px; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
  .toc-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #ccc; font-size: 12pt; text-decoration: none; color: inherit; }
  .toc-item:hover { color: #1e3a5f; }
  .toc-item span:first-child { color: #1a1a1a; }
  .toc-item span:last-child { color: #888; }
  .section { page-break-before: always; }
  .section-title { font-size: 20pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 20px; }
  .section-content h2 { font-size: 14pt; color: #1e3a5f; margin: 20px 0 8px; }
  .section-content h3 { font-size: 12pt; color: #2a5a7f; margin: 16px 0 6px; }
  .section-content h4 { font-size: 11pt; color: #2a5a7f; margin: 12px 0 4px; }
  .section-content p { margin-bottom: 10px; }
  .section-content ul { margin: 8px 0 12px 24px; }
  .section-content li { margin-bottom: 4px; }
  .section-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  .section-content th, .section-content td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  .section-content th { background: #f0f4f8; font-weight: 600; color: #1e3a5f; }
  .section-content strong { color: #1e3a5f; }
  .screen-footer { font-size: 8pt; color: #888; border-top: 1px solid #ddd; padding: 8px 0; display: flex; justify-content: space-between; margin-top: 40px; }
  @media print { .screen-footer { display: none; } }
  .page-footer { display: none; }
  .no-print { margin: 20px 0; text-align: center; }
  .no-print button { padding: 10px 24px; background: #1e3a5f; color: white; border: none; border-radius: 6px; font-size: 12pt; cursor: pointer; margin: 0 8px; }
  .no-print button:hover { background: #2a5a7f; }
</style>

<div class="no-print">
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

<div class="cover">
  <img src="/logo.png" class="cover-logo" alt="Rivertown Technology" onerror="this.style.display='none'" />
  <div class="cover-title">${data.title ? esc(data.title) : `Proposal for ${esc(data.opportunityTitle)}`}</div>
  <div class="cover-subtitle">Information Technology Services Proposal</div>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <strong>Prepared for:</strong> ${esc(data.agency)}<br>
    <strong>Prepared by:</strong> Rivertown Technology Group<br>
    <strong>Date:</strong> ${esc(today)}<br>
    ${deadline ? `<strong>Submission Deadline:</strong> ${esc(deadline)}<br>` : ''}
    ${data.samNumber ? `<strong>SAM Number:</strong> ${esc(data.samNumber)}<br>` : ''}
  </div>
</div>

<div class="page-footer">
  <span>Rivertown Technology Group — Confidential</span>
  <span>${esc(data.opportunityTitle)}</span>
</div>

<div class="page-content">
<div class="toc">
  <h1>Table of Contents</h1>
  ${sections.map((s, i) => `<a href="#section-${i + 1}" class="toc-item"><span>${esc(s.title)}</span><span>${i + 1}</span></a>`).join('')}
</div>

${sections.map((s, i) => `<div class="section" id="section-${i + 1}"><h1 class="section-title">${esc(s.title)}</h1><div class="section-content"><p>${DOMPurify.sanitize(mdToHtml(s.content || ''))}</p></div></div>`).join('')}
</div>

<div class="screen-footer">
  <span>Rivertown Technology Group — Confidential</span>
  <span>${esc(data.opportunityTitle)}</span>
</div>
`,
      }}
    />
  );
}
