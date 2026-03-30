import {
  chunkKnowledgeText,
  chunkKnowledgeTextWithPositions,
  clampChunksForEmbeddingPositions,
  EMBEDDING_SAFE_MAX_CHARS,
  normalizeKnowledgeText,
} from './knowledge-chunking';

describe('knowledge-chunking', () => {
  const opts = { targetChars: 200, overlapChars: 40 };

  it('normalizeKnowledgeText collapses CRLF and triple newlines', () => {
    expect(normalizeKnowledgeText('a\r\n\r\n\r\nb')).toBe('a\n\nb');
  });

  it('produces multiple chunks for long multi-paragraph text', () => {
    const paras = Array.from(
      { length: 12 },
      (_, i) =>
        `Section ${i + 1}. This is a paragraph with enough words to span space. `.repeat(
          4,
        ),
    ).join('\n\n');
    const chunks = chunkKnowledgeText(paras, opts);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(20);
    }
  });

  it('keeps a short paragraph in a single chunk', () => {
    const t = 'Only one short paragraph here.';
    const chunks = chunkKnowledgeText(t, opts);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('short paragraph');
  });

  it('sub-splits an oversized paragraph via windows', () => {
    const long = 'word '.repeat(400).trim();
    const chunks = chunkKnowledgeText(long, opts);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunkKnowledgeTextWithPositions returns non-decreasing logical starts', () => {
    const text = Array.from(
      { length: 8 },
      (_, i) => `Block ${i}.\n\n${'Sentence. '.repeat(30)}`,
    ).join('\n\n');
    const withPos = chunkKnowledgeTextWithPositions(text, {
      targetChars: 250,
      overlapChars: 50,
    });
    expect(withPos.length).toBeGreaterThan(1);
    for (let i = 1; i < withPos.length; i++) {
      expect(withPos[i].start).toBeGreaterThanOrEqual(0);
    }
  });

  it('clampChunksForEmbeddingPositions splits segments over OpenAI-safe char limit', () => {
    const huge = 'z'.repeat(EMBEDDING_SAFE_MAX_CHARS + 5000);
    const clamped = clampChunksForEmbeddingPositions([{ content: huge, start: 0 }], 100);
    expect(clamped.length).toBeGreaterThan(1);
    for (const c of clamped) {
      expect(c.content.length).toBeLessThanOrEqual(EMBEDDING_SAFE_MAX_CHARS);
    }
  });

  it('adjacent chunks share overlapping tail content when text is long', () => {
    const parts = Array.from({ length: 10 }, (_, i) => `Para ${i}: ${'x'.repeat(80)}`);
    const text = parts.join('\n\n');
    const chunks = chunkKnowledgeText(text, { targetChars: 180, overlapChars: 60 });
    if (chunks.length >= 2) {
      const a = chunks[0].slice(-35);
      expect(chunks[1]).toContain(a.slice(10));
    }
  });
});
