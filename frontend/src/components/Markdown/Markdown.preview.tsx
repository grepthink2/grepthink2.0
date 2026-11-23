import type { PreviewMeta } from '@components/previewMeta';
import MarkdownText from './MarkdownText';

export const meta: PreviewMeta = { group: 'Display', height: 370, component: 'MarkdownText', expects: '.gt-md' };

const COMMENT = [
  'Moved the **dock map** to the new tile server. Two things left:',
  '',
  '- [x] cache the station list',
  '- [ ] show `out of service` docks in grey',
  '',
  'Notes are in the [team doc](https://example.edu/team-4/notes).',
].join('\n');

const DESCRIPTION = [
  '## Bike Share Map',
  '',
  'Live dock availability for campus, so you can find a bike before you walk to the rack.',
  '',
  '| Sprint | Goal |',
  '| --- | --- |',
  '| 1 | Sign-in and the station list |',
  '| 2 | The live map |',
].join('\n');

export default function MarkdownPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">compact (the default): comments and card descriptions</p>
        <MarkdownText>{COMMENT}</MarkdownText>
      </section>
      <section className="ds-section">
        <p className="ds-caption">document: a full page body</p>
        <MarkdownText variant="document">{DESCRIPTION}</MarkdownText>
      </section>
    </div>
  );
}
