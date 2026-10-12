import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageMarkdown, MessagePlainText } from '../components/MessageMarkdown';

function renderBody(body: string): HTMLElement {
  return render(<MessageMarkdown body={body} />).container;
}

describe('MessageMarkdown', () => {
  it('renders bold, italics and inline code', () => {
    const body = renderBody('**ship** it _today_ or *tomorrow*, after `npm test`');
    expect(body.querySelector('strong')).toHaveTextContent('ship');
    expect([...body.querySelectorAll('em')].map((em) => em.textContent)).toEqual(['today', 'tomorrow']);
    expect(body.querySelector('code')).toHaveTextContent('npm test');
  });

  it('renders a fenced code block with its lines and indentation intact', () => {
    const body = renderBody('before\n```js\nconst a = 1;\n  return a;\n```');
    expect(body.querySelector('pre > code')?.textContent).toBe('const a = 1;\n  return a;\n');
  });

  it('opens a link in a new tab without sending the referrer', () => {
    renderBody('see [the docs](https://example.com/docs)');
    const link = screen.getByRole('link', { name: 'the docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('links a bare URL and leaves the sentence punctuation after it as text', () => {
    const body = renderBody('Slides: https://example.com/deck?id=1. Thanks');
    const link = screen.getByRole('link', { name: 'https://example.com/deck?id=1' });
    expect(link).toHaveAttribute('href', 'https://example.com/deck?id=1');
    expect(body).toHaveTextContent('Slides: https://example.com/deck?id=1. Thanks');
  });

  it('keeps a closing parenthesis inside a URL only when the URL opened it', () => {
    renderBody('(see https://example.com/a_(b) and https://example.com/c)');
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/a_(b)',
      'https://example.com/c',
    ]);
  });

  it('does not link a URL inside inline code', () => {
    renderBody('run `curl https://example.com/health`');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the text of a link whose URL is unsafe, without a link', () => {
    const body = renderBody('[click me](javascript:alert(1))');
    expect(screen.queryByRole('link')).toBeNull();
    expect(body).toHaveTextContent('click me');
  });

  it('keeps the line breaks the sender typed', () => {
    const body = renderBody('line one\nline two\nline three');
    expect(body.querySelectorAll('br')).toHaveLength(2);
    expect(body.querySelectorAll('p')).toHaveLength(1);
  });

  it.each([
    ['a numbered list', '1. eggs\n2. milk', 'ol, li'],
    ['a bullet list', '- eggs\n- milk', 'ul, li'],
    ['a heading', '# 3 is the answer', 'h1'],
    ['an underlined heading', 'Agenda\n---', 'h2, hr'],
    ['a quote', '> as discussed', 'blockquote'],
    ['a rule', '***', 'hr'],
    ['raw HTML', '<b>hi</b> <script>x()</script>', 'b, script'],
  ])('leaves %s as the characters typed', (_label, typed, tags) => {
    const body = renderBody(typed);
    expect(body.querySelector(tags)).toBeNull();
    expect(body.textContent).toBe(typed);
  });

  it('does not treat indentation as a code block', () => {
    const body = renderBody('    four spaces in');
    expect(body.querySelector('pre, code')).toBeNull();
    expect(body).toHaveTextContent('four spaces in');
  });

  it('shows an image as a link to it instead of loading it', () => {
    renderBody('![logo](https://example.com/logo.png)');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'logo' })).toHaveAttribute(
      'href',
      'https://example.com/logo.png',
    );
  });

  it('lets a backslash keep a marker literal', () => {
    const body = renderBody('\\*not italic\\*');
    expect(body.querySelector('em')).toBeNull();
    expect(body).toHaveTextContent('*not italic*');
  });
});

describe('MessagePlainText', () => {
  it('keeps the words and drops the formatting marks and elements', () => {
    const { container } = render(
      <MessagePlainText body={'**Done** with `fix.py`, see [the PR](https://example.com/pr/1)\nthanks'} />,
    );
    expect(container.textContent).toBe('Done with fix.py, see the PR\nthanks');
    expect(container.children).toHaveLength(0);
  });
});
