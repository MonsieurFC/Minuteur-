// Synthesize the "Mezzo Dente" opening phrase (from index.html THEME table)
// as a 44.1 kHz mono 16-bit WAV, to be used as the PWA notification sound.
// Usage: node tools/make-chime.mjs  →  sound/chime.wav
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BEAT = 0.5; // ♩ = 120, as in index.html

// Notes with start < 32 beats (first phrase + tail ≈ 16 s)
const THEME = [
  [67,0,1],[66,1,1],[67,2,.5],[62,2.5,4.5],[67,8,1],[66,9,1],[67,10,.5],[71,10.5,4.5],
  [72,15,1],[71,16,1],[69,17,1],[67,18,.5],[72,18.5,1.5],[71,20,1],[69,21,1],[67,22,1],
  [67,23,1.5],[69,24.5,.5],[69,25,6]
];

const totalBeats = 33;
const total = totalBeats * BEAT + 1.0; // + release tail
const N = Math.ceil(total * SR);
const out = new Float64Array(N);

const freqOf = (m) => 440 * Math.pow(2, (m - 69) / 12);

for (const [midi, beat, durBeats] of THEME) {
  const f = freqOf(midi);
  const t0 = beat * BEAT;
  const d = Math.max(0.15, durBeats * BEAT * 0.92);
  const v = 0.3;
  const a = 0.02, rel = Math.min(0.5, d * 0.5), sus = Math.max(0.001, v * 0.6);
  const i0 = Math.floor(t0 * SR);
  const i1 = Math.min(N, Math.ceil((t0 + d + rel + 0.05) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR - t0;
    // Envelope (linear ramps + exponential tails, mirroring the Web Audio graph)
    let g;
    if (t < a) g = v * (t / a);
    else if (t < a + 0.12) g = v + (sus - v) * ((t - a) / 0.12);
    else if (t < d - rel) g = sus;
    else if (t < d) g = sus * Math.pow(0.0008 / sus, (t - (d - rel)) / rel);
    else g = 0.0008 * Math.exp(-(t - d) * 12);
    const x = f * t;
    const tri = 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1; // triangle
    const sub = Math.sin(2 * Math.PI * (f / 2) * t);               // sine sub-octave
    out[i] += (tri + 0.25 * sub) * g;
  }
}

// Soft normalize to ~88 % peak
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
const norm = peak > 0 ? 0.88 / peak : 1;

// Encode 16-bit PCM mono WAV
const buf = Buffer.alloc(44 + N * 2);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 2, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);   // PCM
buf.writeUInt16LE(1, 22);   // mono
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, out[i] * norm));
  buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
}

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'sound', 'chime.wav');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, buf);
console.log(`wrote ${dest} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${total.toFixed(1)} s)`);
