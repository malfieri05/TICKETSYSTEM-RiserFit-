/**
 * Short success chime when a ticket is created (Web Audio — no MP3 asset).
 * `primeTicketSuccessAudio()` must run synchronously in the submit handler before any `await`
 * so the AudioContext is allowed to run after the API returns (browser autoplay policy).
 */

let sharedCtx: AudioContext | null = null;

function getOrCreateContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  sharedCtx = new AC();
  return sharedCtx;
}

/** Call from the form submit handler after validation passes, before the first `await`. */
export function primeTicketSuccessAudio(): void {
  const ctx = getOrCreateContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
}

export function playTicketSuccessSound(): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = getOrCreateContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.14, now);
  master.connect(ctx.destination);

  const playTone = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + start);
    g.gain.setValueAtTime(0.0001, now + start);
    g.gain.linearRampToValueAtTime(0.35, now + start + 0.015);
    g.gain.linearRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  // Pleasant major-third “ding” (C5 → E5)
  playTone(523.25, 0, 0.11);
  playTone(659.25, 0.09, 0.14);
}
