'use strict';

function splitOversizedSection(section, maxChunkSize) {
  if (section.length <= maxChunkSize) return [section];
  const paragraphs = section.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > maxChunkSize) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function chunkText(text, { maxChunkSize = 800 } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const headingMatches = [...trimmed.matchAll(/^## .*$/gm)];
  if (headingMatches.length === 0) {
    return splitOversizedSection(trimmed, maxChunkSize);
  }

  const sections = [];
  const firstHeadingStart = headingMatches[0].index;
  if (firstHeadingStart > 0) {
    const preamble = trimmed.slice(0, firstHeadingStart).trim();
    if (preamble) sections.push(preamble);
  }
  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].index;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index : trimmed.length;
    const section = trimmed.slice(start, end).trim();
    if (section) sections.push(section);
  }

  const chunks = [];
  for (const section of sections) {
    chunks.push(...splitOversizedSection(section, maxChunkSize));
  }
  return chunks;
}

module.exports = { chunkText };
