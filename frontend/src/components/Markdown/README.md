Renders a user-written Markdown body (a comment, a task description, a project description) with GitHub's extras, safely and in the kit's type.

## Use

```jsx
<MarkdownText>{COMMENT}</MarkdownText>
<MarkdownText variant="document">{DESCRIPTION}</MarkdownText>
```

## Props that matter

- The Markdown, as a string child.
- `variant`, default `compact`: the dense look of comments and scrum card descriptions; `document` is a full page body (a project description), with headings and more room.
- `className`: goes on the `.gt-md` wrapper.

It renders GitHub-flavoured Markdown: tables, task lists (shown checked or not, never clickable), strikethrough and autolinks. Links open in a new tab, except in-page and mail links. No media ever loads: an image becomes a link to it. Raw HTML shows as the characters typed.

## The consumer supplies

- The text, as the person wrote it. Nothing needs escaping first.

## Do and don't

- Do use it for anything a person typed in Markdown, so every surface renders it the same way.
- Don't render user text with your own HTML: this is the one safe renderer.
- Don't use `document` inside a card or a comment thread; it is for a page's main body.
