import { parseBlocks, parseInline } from '../markdown-parse';

describe('markdown for Sovra replies', () => {
  it('splits headings, paragraphs, lists, code and tables', () => {
    const blocks = parseBlocks(
      [
        '## Easy plants',
        'Here are **three** picks.',
        '',
        '- Snake plant',
        '- Pothos',
        '1. Water weekly',
        '```',
        'npm run check',
        '```',
        '| Plant | Light |',
        '| --- | --- |',
        '| Snake | Low |',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Easy plants' },
      { kind: 'paragraph', text: 'Here are **three** picks.' },
      { kind: 'list', ordered: false, items: ['Snake plant', 'Pothos'] },
      { kind: 'list', ordered: true, items: ['Water weekly'] },
      { kind: 'code', text: 'npm run check' },
      { kind: 'table', header: ['Plant', 'Light'], rows: [['Snake', 'Low']] },
    ]);
  });

  it('marks bold, italic and inline code', () => {
    expect(parseInline('a **b** and *c* with `d`')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' and ' },
      { text: 'c', italic: true },
      { text: ' with ' },
      { text: 'd', code: true },
    ]);
  });

  it('leaves plain text alone', () => {
    expect(parseBlocks('Just a sentence.')).toEqual([{ kind: 'paragraph', text: 'Just a sentence.' }]);
    expect(parseInline('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15' }]);
  });
});
