/**
 * Generates short WAV tones for app feedback (no external assets).
 * Run: node scripts/gen-sounds.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "sounds");
fs.mkdirSync(outDir, { recursive: true });

function writeWav(filename, freqs, durationSec, vol = 0.28) {
  const sampleRate = 22050;
  const n = Math.floor(sampleRate * durationSec);
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  const weights =
    freqs.length === 1 ? [1] : freqs.map((_, i) => (i === 0 ? 0.55 : 0.45));
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / 90);
    const release = i > n - 180 ? (n - i) / 180 : 1;
    const env = attack * release;
    let s = 0;
    freqs.forEach((f, j) => {
      s += weights[j] * Math.sin(2 * Math.PI * f * t);
    });
    s = Math.max(-1, Math.min(1, vol * env * s));
    buf.writeInt16LE(Math.round(s * 32767), o);
    o += 2;
  }
  fs.writeFileSync(path.join(outDir, filename), buf);
}

// Cherry: higher, softer two-tone
writeWav("success-cherry.wav", [1046.5, 1568], 0.26, 0.3);
// Blueberry: slightly deeper
writeWav("success-blue.wav", [523.25, 784], 0.3, 0.34);
// Short click for deletes
writeWav("click.wav", [1650], 0.055, 0.24);

console.log("Wrote WAV files to public/sounds/");
