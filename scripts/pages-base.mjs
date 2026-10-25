import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pagesBase = process.env.ZZOO_GITHUB_PAGES === '1' ? '/zzoo-studio' : '';

export function withBase(url, base) {
  if (!base || !url.startsWith('/') || url.startsWith('//') ||
      url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}#`) ||
      url.startsWith(`${base}?`)) return url;
  return base + url;
}

// Prefix URLs in generated HTML tags, not source documents or code examples.
export function prefixHtml(html, base) {
  if (!base) return html;
  return html.replace(/<(?:a|link|img|iframe|script|source|form|video|audio)\b[^>]*>/gi,
    tag => tag.replace(/(\s(?:href|src|poster|action)=)(["'])(\/[^"']*)\2/gi,
      (_, attr, quote, url) => attr + quote + withBase(url, base) + quote));
}

export function pagesBaseIntegration(base) {
  return {
    name: 'zzoo-pages-base',
    hooks: {
      'astro:build:done': ({ dir }) => {
        if (!base) return;
        function visit(directory) {
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith('.html')) {
              writeFileSync(path, prefixHtml(readFileSync(path, 'utf8'), base));
            }
          }
        }
        visit(fileURLToPath(dir));
      },
    },
  };
}
