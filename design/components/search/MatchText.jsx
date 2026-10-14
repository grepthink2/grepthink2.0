import React from 'react';

/** Renders `text` with every case-insensitive occurrence of `query` wrapped in <mark>. */
export function MatchText({ text = '', query = '', className = '' }) {
  const q = String(query).trim();
  if (!q) return <span className={className}>{text}</span>;
  const parts = [];
  const lower = String(text).toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(ql, i);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(<mark key={idx}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <span className={className}>{parts}</span>;
}
