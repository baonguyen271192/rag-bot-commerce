'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkText } = require('../src/chunker');

test('splits markdown into one chunk per top-level section', () => {
  const md = '# Title\n\n## Section A\nContent A\n\n## Section B\nContent B\n';
  const chunks = chunkText(md);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /Section A/);
  assert.match(chunks[0], /Content A/);
  assert.match(chunks[1], /Section B/);
  assert.match(chunks[1], /Content B/);
});

test('returns the whole text as one chunk when there are no ## headings and it fits maxChunkSize', () => {
  const chunks = chunkText('Just a short paragraph, no headings.');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], 'Just a short paragraph, no headings.');
});

test('splits an oversized section further by paragraph, respecting maxChunkSize', () => {
  const para = 'x'.repeat(500);
  const md = `## Big Section\n\n${para}\n\n${para}\n\n${para}\n`;
  const chunks = chunkText(md, { maxChunkSize: 800 });
  assert.ok(chunks.length >= 2, `expected multiple chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 800 + 50, `chunk too large: ${chunk.length} chars`);
  }
});

test('ignores empty input', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
});

test('keeps a short document with multiple small sections as separate chunks even under maxChunkSize', () => {
  const md = '## A\nshort\n\n## B\nalso short\n';
  const chunks = chunkText(md, { maxChunkSize: 800 });
  assert.equal(chunks.length, 2);
});
