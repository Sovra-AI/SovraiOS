/**
 * A small, safe Markdown subset for Sovra's replies on the phone: headings, paragraphs,
 * bullet/numbered lists, fenced code and tables; bold, italic and inline code. No links
 * or HTML are interpreted — text stays text.
 */
export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  code?: true;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      flush();
      const header = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = numbered !== null;
      const item = (bullet ?? numbered)![1].trim();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![\w*])\*[^*\s][^*\n]*\*(?![\w*]))/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: text.slice(last, index) });
    const token = match[0];
    if (token.startsWith('**')) spans.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) spans.push({ text: token.slice(1, -1), code: true });
    else spans.push({ text: token.slice(1, -1), italic: true });
    last = index + token.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length ? spans : [{ text }];
}
