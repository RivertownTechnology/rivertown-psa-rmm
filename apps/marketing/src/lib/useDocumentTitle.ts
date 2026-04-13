import { useEffect } from 'react';

/**
 * Set <title> and meta description per route. Crawlers like Googlebot, ChatGPT-User,
 * and ClaudeBot run JS, so this updates what they index.
 */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    const fullTitle = title.includes('ForgePSA') ? title : `${title} · ForgePSA`;
    document.title = fullTitle;

    if (description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', description);
    }
  }, [title, description]);
}
