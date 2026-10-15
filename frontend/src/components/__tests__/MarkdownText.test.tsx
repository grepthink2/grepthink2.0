import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownText from '../Markdown/MarkdownText';

function renderMarkdown(markdown: string): HTMLElement {
  return render(<MarkdownText>{markdown}</MarkdownText>).container;
}

describe('MarkdownText', () => {
  it('marks the document variant on its root and leaves the default compact', () => {
    const documentRoot = render(<MarkdownText variant="document">Body</MarkdownText>).container.firstElementChild;
    expect(documentRoot).toHaveClass('gt-md', 'gt-md--document');

    const compactRoot = render(<MarkdownText>Body</MarkdownText>).container.firstElementChild;
    expect(compactRoot).toHaveClass('gt-md');
    expect(compactRoot).not.toHaveClass('gt-md--document');
  });

  it('renders a GFM table with its header cells', () => {
    const body = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(body.querySelector('table')).not.toBeNull();
    expect([...body.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['a', 'b']);
  });

  it('renders strikethrough as deleted text', () => {
    const body = renderMarkdown('~~gone~~');
    expect(body.querySelector('del')).toHaveTextContent('gone');
  });

  it('renders task-list items as checkboxes that show their state and cannot be changed', () => {
    renderMarkdown('- [x] done\n- [ ] todo');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeDisabled();
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it('links a bare URL', () => {
    renderMarkdown('see https://example.com/x');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/x');
  });

  it('renders headings, quotes, rules and numbered lists', () => {
    const body = renderMarkdown('## Goals\n\n> quoted\n\n---\n\n1. one');
    expect(body.querySelector('h2')).toHaveTextContent('Goals');
    expect(body.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(body.querySelector('hr')).not.toBeNull();
    expect(body.querySelector('ol > li')).toHaveTextContent('one');
  });

  it('renders a fenced code block with its lines and indentation intact', () => {
    const body = renderMarkdown('```js\nconst a = 1;\n  return a;\n```');
    expect(body.querySelector('pre > code')?.textContent).toBe('const a = 1;\n  return a;\n');
  });

  it('shows raw HTML as the characters typed', () => {
    const body = renderMarkdown('<b>hi</b> <script>alert(1)</script>');
    expect(body.querySelector('b')).toBeNull();
    expect(body.querySelector('script')).toBeNull();
    expect(body.textContent).toContain('<b>hi</b>');
  });

  it('shows the text of a link whose URL is unsafe, without a link', () => {
    const body = renderMarkdown('[x](javascript:alert(1))');
    // Not a role query: Testing Library does not count <a href=""> as a link, and that is what we must not render.
    expect(body.querySelector('a')).toBeNull();
    expect(body).toHaveTextContent('x');
  });

  it('shows the alt text of an image whose URL is unsafe, without an image or a link', () => {
    const body = renderMarkdown('![x](javascript:alert(1))');
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelector('a')).toBeNull();
    expect(body).toHaveTextContent('x');
  });

  it('shows an image as a link to it instead of loading it', () => {
    const body = renderMarkdown('![logo](https://example.com/a.png)');
    expect(body.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'logo' })).toHaveAttribute('href', 'https://example.com/a.png');
  });

  it('shows an image inside a link as text in that one link', () => {
    const body = renderMarkdown('[![demo](https://x.test/d.png)](https://youtu.be/abc)');
    const links = body.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://youtu.be/abc');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0].textContent).toBe('demo');
    expect(body.querySelector('a a')).toBeNull();
  });

  it('opens a link in a new tab without sending the referrer', () => {
    renderMarkdown('[docs](https://example.com)');
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('opens a bare email address in the mail app, not a new tab', () => {
    renderMarkdown('Contact sponsor@example.com today');
    const link = screen.getByRole('link', { name: 'sponsor@example.com' });
    expect(link).toHaveAttribute('href', 'mailto:sponsor@example.com');
    expect(link).not.toHaveAttribute('target');
  });

  it('keeps footnote links in the page, each pointing at the other', () => {
    const body = renderMarkdown('text[^1]\n\n[^1]: the note');
    const reference = screen.getByRole('link', { name: '1' });
    expect(reference).toHaveAttribute('href', '#user-content-fn-1');
    expect(reference).not.toHaveAttribute('target');
    expect(body.querySelector('#user-content-fn-1')).toHaveTextContent('the note');

    const backReference = body.querySelector('a[href="#user-content-fnref-1"]');
    expect(backReference).not.toBeNull();
    expect(backReference).not.toHaveAttribute('target');
    // The back-reference lands on the reference, so the reference keeps its id.
    expect(reference).toHaveAttribute('id', 'user-content-fnref-1');
  });

  it('renders plain text as a single paragraph', () => {
    const body = renderMarkdown('Find trails by name');
    expect(body.querySelectorAll('p')).toHaveLength(1);
    expect(body.querySelector('p')).toHaveTextContent('Find trails by name');
  });
});
