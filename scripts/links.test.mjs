import assert from 'node:assert/strict';
import test from 'node:test';

import { createMarkdown, scanTokens } from './lib/markdown.mjs';
import { VaultIndex, parseMarkdownTarget, parseWikiTarget } from './lib/resolve.mjs';

const FILES = [
  'Index.md',
  'Dosimetry/Absorbed Dose.md',
  'Dosimetry/TG-51 Calibration.md',
  'Dosimetry/Ionization Chambers.md',
  'Imaging/CT Physics.md',
  'Imaging/Protocols/CT Physics.md', // deliberate duplicate basename
  'Attachments/pdd-curve.svg',
  'Attachments/tg51-protocol.pdf',
];
const vault = new VaultIndex(FILES, {
  imageExtensions: ['svg', 'png'],
  fileExtensions: ['pdf'],
});

test('parseWikiTarget splits aliases, headings and block refs', () => {
  assert.deepEqual(parseWikiTarget('Absorbed Dose'), {
    target: 'Absorbed Dose',
    anchor: null,
    blockRef: null,
    alias: null,
  });
  assert.deepEqual(parseWikiTarget('Absorbed Dose|dose to water'), {
    target: 'Absorbed Dose',
    anchor: null,
    blockRef: null,
    alias: 'dose to water',
  });
  assert.deepEqual(parseWikiTarget('Absorbed Dose#Relationship to kerma'), {
    target: 'Absorbed Dose',
    anchor: 'Relationship to kerma',
    blockRef: null,
    alias: null,
  });
  assert.deepEqual(parseWikiTarget('Absorbed Dose#^dose-definition|see this'), {
    target: 'Absorbed Dose',
    anchor: null,
    blockRef: 'dose-definition',
    alias: 'see this',
  });
  assert.equal(parseWikiTarget('#Local Heading').target, '');
});

test('parseMarkdownTarget decodes and splits the fragment', () => {
  assert.deepEqual(parseMarkdownTarget('../Imaging/CT%20Physics.md#hounsfield-units'), {
    target: '../Imaging/CT Physics.md',
    anchor: 'hounsfield-units',
    blockRef: null,
    alias: null,
  });
  assert.equal(parseMarkdownTarget('<Absorbed Dose.md>').target, 'Absorbed Dose.md');
});

test('resolves by filename anywhere in the vault', () => {
  assert.deepEqual(vault.resolve('Absorbed Dose', 'Index.md'), {
    path: 'Dosimetry/Absorbed Dose.md',
    kind: 'note',
  });
  assert.deepEqual(vault.resolve('TG-51 Calibration.md', 'Imaging/CT Physics.md'), {
    path: 'Dosimetry/TG-51 Calibration.md',
    kind: 'note',
  });
});

test('resolution is case-insensitive', () => {
  assert.equal(vault.resolve('absorbed dose', 'Index.md').path, 'Dosimetry/Absorbed Dose.md');
  assert.equal(vault.resolve('DOSIMETRY/tg-51 calibration', 'Index.md').path, 'Dosimetry/TG-51 Calibration.md');
});

test('root-relative paths beat basename matches', () => {
  assert.equal(
    vault.resolve('Imaging/Protocols/CT Physics', 'Index.md').path,
    'Imaging/Protocols/CT Physics.md',
  );
});

test('relative markdown paths resolve against the linking note', () => {
  assert.equal(
    vault.resolve('../Imaging/CT Physics.md', 'Dosimetry/Absorbed Dose.md').path,
    'Imaging/CT Physics.md',
  );
  assert.equal(
    vault.resolve('./Ionization Chambers.md', 'Dosimetry/Absorbed Dose.md').path,
    'Dosimetry/Ionization Chambers.md',
  );
});

test('ambiguous filenames prefer the same folder, then the shortest path', () => {
  assert.equal(
    vault.resolve('CT Physics', 'Imaging/Protocols/CT Physics.md').path,
    'Imaging/Protocols/CT Physics.md',
  );
  assert.equal(vault.resolve('CT Physics', 'Index.md').path, 'Imaging/CT Physics.md');
});

test('assets resolve with their own kind', () => {
  assert.deepEqual(vault.resolve('pdd-curve.svg', 'Dosimetry/Absorbed Dose.md'), {
    path: 'Attachments/pdd-curve.svg',
    kind: 'image',
  });
  assert.equal(vault.resolve('tg51-protocol.pdf', 'Index.md').kind, 'file');
});

test('external and missing targets do not resolve', () => {
  assert.equal(vault.resolve('https://example.org/note.md', 'Index.md'), null);
  assert.equal(vault.resolve('mailto:someone@example.org', 'Index.md'), null);
  assert.equal(vault.resolve('Proton Bragg Peak', 'Index.md'), null);
  assert.equal(vault.resolve('', 'Index.md'), null);
});

/* ---------------------------------------------------------- token scanning -- */

function scan(markdown) {
  const md = createMarkdown();
  return scanTokens(md.parse(markdown, {}));
}

test('links inside code and math are ignored', () => {
  const { links } = scan(
    [
      'Real link to [[Absorbed Dose]].',
      '',
      '```md',
      'Fake [[Not A Link]] and [also fake](Nope.md)',
      '```',
      '',
      'Inline `[[Also Fake]]` stays code.',
      '',
      '$$',
      'x^2 + [[Fake In Math]]',
      '$$',
    ].join('\n'),
  );
  assert.deepEqual(
    links.map((l) => l.target),
    ['Absorbed Dose'],
  );
});

test('wikilinks, markdown links and embeds are all collected', () => {
  const { links } = scan(
    [
      '[[Absorbed Dose|dose]] and [[TG-51 Calibration#Working equation]]',
      '[relative](../Imaging/CT%20Physics.md)',
      '![[pdd-curve.svg]]',
      '![alt](Attachments/pdd-curve.svg)',
      '[external](https://example.org)',
    ].join('\n\n'),
  );
  assert.deepEqual(
    links.map((l) => `${l.syntax}:${l.embed ? 'embed:' : ''}${l.target}`),
    [
      'wiki:Absorbed Dose',
      'wiki:TG-51 Calibration',
      'markdown:../Imaging/CT Physics.md',
      'wiki:embed:pdd-curve.svg',
      'markdown:embed:Attachments/pdd-curve.svg',
    ],
  );
});

test('inline tags are collected but headings and code are not', () => {
  const { tags } = scan(
    ['# Heading', '', 'Tagged #dosimetry and #protocol/aapm here.', '', '`#not-a-tag`', '', 'Issue #42 is not a tag.'].join('\n'),
  );
  assert.deepEqual(tags.sort(), ['dosimetry', 'protocol/aapm']);
});

test('headings and block ids are captured, dollars survive', () => {
  const { headings, blockIds } = scan(
    ['# Title', '## Sub section', '', 'Costs $20 and $30 today. ^price-note'].join('\n'),
  );
  assert.deepEqual(headings, [
    { level: 1, text: 'Title' },
    { level: 2, text: 'Sub section' },
  ]);
  assert.deepEqual(blockIds, ['price-note']);
});

test('inline math renders and does not swallow currency', () => {
  const md = createMarkdown();
  const html = md.render('Dose $D = E/m$ costs $20 to $30.', {});
  assert.match(html, /class="katex"/);
  assert.match(html, /costs \$20 to \$30/);
});

test('display math renders as a block', () => {
  const md = createMarkdown();
  const html = md.render(['$$', 'D = \\frac{\\varepsilon}{m}', '$$'].join('\n'), {});
  assert.match(html, /katex-display/);
});
