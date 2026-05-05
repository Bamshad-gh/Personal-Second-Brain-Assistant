'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Inline parser — **bold**, *italic*, plain text + \n → <br>
// ─────────────────────────────────────────────────────────────────────────────

function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);

  parts.forEach((part, pi) => {
    const key = `${baseKey}-p${pi}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      result.push(<strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      result.push(<em key={key}>{part.slice(1, -1)}</em>);
    } else {
      const lines = part.split('\n');
      lines.forEach((line, li) => {
        if (li > 0) result.push(<br key={`${key}-br${li}`} />);
        if (line) result.push(<React.Fragment key={`${key}-l${li}`}>{line}</React.Fragment>);
      });
    }
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkdownMessage — renders code fences, bold, italic, line breaks
// ─────────────────────────────────────────────────────────────────────────────

interface MarkdownMessageProps {
  content:   string;
  className?: string;
}

export function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  // Split on fenced code blocks: ```lang\n...\n``` or ```...```
  const segments = content.split(/(```[\w]*\n?[\s\S]*?```)/g);

  return (
    <span className={className}>
      {segments.map((segment, i) => {
        const codeMatch = segment.match(/^```([\w]*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          const lang = codeMatch[1].trim();
          const code = codeMatch[2].trimEnd();
          return (
            <pre
              key={i}
              className="my-1.5 overflow-x-auto rounded-lg bg-neutral-950 border border-neutral-800
                         px-3 py-2 font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre"
            >
              {lang && (
                <span className="block text-[10px] text-neutral-600 mb-1 font-sans not-italic">
                  {lang}
                </span>
              )}
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <React.Fragment key={i}>
            {parseInline(segment, String(i))}
          </React.Fragment>
        );
      })}
    </span>
  );
}
