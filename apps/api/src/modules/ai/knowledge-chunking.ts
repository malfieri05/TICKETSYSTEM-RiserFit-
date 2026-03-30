/**
 * Structure-aware knowledge text chunking for RAG embeddings.
 * Bump when algorithm changes — must match DB chunkPipelineVersion re-ingest logic.
 */
export const KNOWLEDGE_CHUNK_PIPELINE_VERSION = 2;

const MIN_CHUNK_CHARS = 20;

export interface KnowledgeChunkOptions {
  targetChars: number;
  overlapChars: number;
}

interface TextPiece {
  text: string;
  /** Start index in normalized full text */
  absStart: number;
}

/** Default sizes (~300–400 tokens); overlap preserves boundary context */
export const DEFAULT_CHUNK_TARGET_CHARS = 1600;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 200;

/**
 * OpenAI embedding models reject inputs over ~8192 tokens. Large PDFs can still
 * produce a rare oversized segment; hard-cap in characters (~2500–3000 tokens).
 */
export const EMBEDDING_SAFE_MAX_CHARS = 10_000;

/** Split any chunk over {@link EMBEDDING_SAFE_MAX_CHARS} into sliding windows before embedding. */
export function clampChunksForEmbeddingPositions(
  chunks: { content: string; start: number }[],
  overlapChars: number,
): { content: string; start: number }[] {
  const overlap = Math.min(Math.max(40, overlapChars), 400);
  const out: { content: string; start: number }[] = [];
  for (const c of chunks) {
    if (c.content.length <= EMBEDDING_SAFE_MAX_CHARS) {
      out.push(c);
      continue;
    }
    const pieces = hardWindowPieces(
      { text: c.content, absStart: c.start },
      EMBEDDING_SAFE_MAX_CHARS,
      overlap,
    );
    for (const p of pieces) {
      if (p.text.length >= MIN_CHUNK_CHARS) {
        out.push({ content: p.text, start: p.absStart });
      }
    }
  }
  return out;
}

/** Same as {@link clampChunksForEmbeddingPositions} for plain string chunks (text ingest). */
export function clampChunkStringsForEmbedding(
  chunks: string[],
  overlapChars: number,
): string[] {
  const overlap = Math.min(Math.max(40, overlapChars), 400);
  const out: string[] = [];
  for (const content of chunks) {
    if (content.length <= EMBEDDING_SAFE_MAX_CHARS) {
      out.push(content);
      continue;
    }
    const pieces = hardWindowPieces(
      { text: content, absStart: 0 },
      EMBEDDING_SAFE_MAX_CHARS,
      overlap,
    );
    for (const p of pieces) {
      if (p.text.length >= MIN_CHUNK_CHARS) out.push(p.text);
    }
  }
  return out;
}

export function normalizeKnowledgeText(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Paragraph-style blocks with positions in `normalized` */
function paragraphPieces(normalized: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let searchFrom = 0;
  const segments = normalized.split(/\n{2,}/);
  for (const raw of segments) {
    const t = raw.trim();
    if (t.length === 0) continue;
    const i = normalized.indexOf(t, searchFrom);
    if (i < 0) continue;
    pieces.push({ text: t, absStart: i });
    searchFrom = i + Math.max(1, t.length);
  }
  if (pieces.length === 0 && normalized.length > 0) {
    pieces.push({ text: normalized, absStart: 0 });
  }
  return pieces;
}

/** Split on sentence-like boundaries */
function splitSentences(text: string, baseOffset: number): TextPiece[] {
  const parts = text.split(/(?<=[.!?…])(?:\s+|\n+)/gu).filter((x) => x.trim());
  const out: TextPiece[] = [];
  let pos = 0;
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const idx = text.indexOf(t, pos);
    if (idx < 0) continue;
    out.push({ text: t, absStart: baseOffset + idx });
    pos = idx + t.length;
  }
  return out.length > 0 ? out : [{ text: text.trim(), absStart: baseOffset }];
}

function hardWindowPieces(
  p: TextPiece,
  window: number,
  overlap: number,
): TextPiece[] {
  const out: TextPiece[] = [];
  const { text, absStart } = p;
  let offset = 0;
  const step = Math.max(1, window - overlap);
  while (offset < text.length) {
    const end = Math.min(offset + window, text.length);
    const slice = text.slice(offset, end).trim();
    if (slice.length >= MIN_CHUNK_CHARS) {
      out.push({ text: slice, absStart: absStart + offset });
    }
    if (end >= text.length) break;
    offset += step;
  }
  if (out.length === 0 && text.trim().length >= MIN_CHUNK_CHARS) {
    out.push({ text: text.trim(), absStart: absStart });
  }
  return out;
}

/** Break a long paragraph into pieces at most `maxLen` chars */
function breakParagraph(p: TextPiece, maxLen: number, overlap: number): TextPiece[] {
  if (p.text.length <= maxLen) return [p];
  const sents = splitSentences(p.text, p.absStart);
  if (sents.length <= 1) {
    return hardWindowPieces(p, maxLen, overlap);
  }
  const merged: TextPiece[] = [];
  let buf = '';
  let bufStart = sents[0].absStart;
  const flush = () => {
    const t = buf.trim();
    if (t.length >= MIN_CHUNK_CHARS) {
      merged.push({ text: t, absStart: bufStart });
    }
    buf = '';
  };
  for (const s of sents) {
    const next = buf ? `${buf} ${s.text}` : s.text;
    if (next.length <= maxLen) {
      if (!buf) bufStart = s.absStart;
      buf = next;
    } else {
      flush();
      if (s.text.length > maxLen) {
        merged.push(...hardWindowPieces(s, maxLen, overlap));
      } else {
        buf = s.text;
        bufStart = s.absStart;
      }
    }
  }
  flush();
  return merged.length > 0 ? merged : hardWindowPieces(p, maxLen, overlap);
}

function overlapSuffix(content: string, overlapChars: number): string {
  if (content.length <= overlapChars) return content.trim();
  let tail = content.slice(-overlapChars).trim();
  const markers = ['. ', '.\n', '! ', '? ', '… ', '\n\n'];
  let cut = 0;
  for (const m of markers) {
    const idx = tail.indexOf(m);
    if (idx >= 0 && idx + m.length > cut) cut = idx + m.length;
  }
  if (cut > 0 && tail.length - cut > 40) tail = tail.slice(cut).trim();
  return tail.length >= MIN_CHUNK_CHARS ? tail : content.slice(-overlapChars).trim();
}

/**
 * Split normalized text into embedding-sized chunks with paragraph/sentence awareness and overlap.
 */
export function chunkKnowledgeTextWithPositions(
  rawText: string,
  opts: KnowledgeChunkOptions,
): { content: string; start: number }[] {
  const normalized = normalizeKnowledgeText(rawText);
  if (normalized.length === 0) return [];

  const { targetChars, overlapChars } = opts;
  const maxPiece = Math.max(400, Math.floor(targetChars * 0.92));

  const paras = paragraphPieces(normalized);
  const flat: TextPiece[] = [];
  for (const para of paras) {
    flat.push(...breakParagraph(para, maxPiece, overlapChars));
  }
  if (flat.length === 0) return [];

  const chunks: { content: string; start: number }[] = [];
  let current: TextPiece[] = [];
  let currentLen = 0;

  const joinCurrent = () => current.map((x) => x.text).join('\n\n').trim();

  const flush = () => {
    const content = joinCurrent();
    if (content.length < MIN_CHUNK_CHARS) {
      current = [];
      currentLen = 0;
      return;
    }
    const start = current[0].absStart;
    chunks.push({ content, start });
    const ov = overlapSuffix(content, overlapChars);
    if (ov.length >= MIN_CHUNK_CHARS) {
      const abs = start + Math.max(0, content.length - ov.length);
      current = [{ text: ov, absStart: abs }];
      currentLen = ov.length;
    } else {
      current = [];
      currentLen = 0;
    }
  };

  for (const piece of flat) {
    const sep = currentLen > 0 ? 2 : 0;
    if (currentLen + sep + piece.text.length <= targetChars) {
      current.push(piece);
      currentLen += sep + piece.text.length;
      continue;
    }
    flush();
    if (piece.text.length > targetChars) {
      for (const hw of hardWindowPieces(piece, targetChars, overlapChars)) {
        if (
          currentLen + hw.text.length + (currentLen > 0 ? 2 : 0) <=
          targetChars
        ) {
          current.push(hw);
          currentLen += (currentLen > 0 ? 2 : 0) + hw.text.length;
        } else {
          flush();
          chunks.push({ content: hw.text, start: hw.absStart });
          const ov = overlapSuffix(hw.text, overlapChars);
          if (ov.length >= MIN_CHUNK_CHARS) {
            current = [
              {
                text: ov,
                absStart: hw.absStart + Math.max(0, hw.text.length - ov.length),
              },
            ];
            currentLen = ov.length;
          } else {
            current = [];
            currentLen = 0;
          }
        }
      }
      continue;
    }
    current = [piece];
    currentLen = piece.text.length;
  }
  flush();

  return chunks.filter((c) => c.content.length >= MIN_CHUNK_CHARS);
}

export function chunkKnowledgeText(
  rawText: string,
  opts: KnowledgeChunkOptions,
): string[] {
  return chunkKnowledgeTextWithPositions(rawText, opts).map((c) => c.content);
}
