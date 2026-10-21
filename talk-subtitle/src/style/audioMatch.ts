// Finds where a piece of the finished video's audio comes from in the source
// audio, to the sample (16 kHz). Normalized cross-correlation (NCC):
//   local   around a few candidate offsets (from the transcript / the previous window),
//           coarse on a 2 kHz copy, then fine at 16 kHz
//   global  over the whole source on a 1 kHz copy (FFT), for windows the text could not place
// offset = source time − final time (s). gain = how much louder the final is (least squares).

export type Match = { offset: number; ncc: number; gain: number };

const SR = 16000;

function toFloat(x: Int16Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] / 32768;
  return out;
}

/** Box-car average over `factor` samples (a crude low-pass, enough for speech correlation). */
function decimate(x: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += x[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

function prefixSq(x: Float32Array): Float64Array {
  const p = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) p[i + 1] = p[i] + x[i] * x[i];
  return p;
}

/** In-place iterative radix-2 FFT (inverse without 1/N scaling). */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

type Level = { x: Float32Array; p: Float64Array; rate: number };

export class AudioMatcher {
  readonly src: Level;
  readonly fin: Level;
  private src2: Level;
  private fin2: Level;
  private src1: Level;
  private fin1: Level;
  private srcSpectrum: { re: Float64Array; im: Float64Array; n: number } | null = null;

  constructor(source: Int16Array, final: Int16Array) {
    const level = (x: Float32Array, rate: number): Level => ({ x, p: prefixSq(x), rate });
    const s = toFloat(source);
    const f = toFloat(final);
    this.src = level(s, SR);
    this.fin = level(f, SR);
    this.src2 = level(decimate(s, 8), SR / 8);
    this.fin2 = level(decimate(f, 8), SR / 8);
    this.src1 = level(decimate(s, 16), SR / 16);
    this.fin1 = level(decimate(f, 16), SR / 16);
  }

  get sourceSeconds() {
    return this.src.x.length / SR;
  }
  get finalSeconds() {
    return this.fin.x.length / SR;
  }

  /** NCC of final[a, a+len) against source[b, b+len) at one level. */
  private nccAt(L: { s: Level; f: Level }, a: number, b: number, len: number): Match | null {
    if (a < 0 || b < 0 || a + len > L.f.x.length || b + len > L.s.x.length) return null;
    let dot = 0;
    const fx = L.f.x;
    const sx = L.s.x;
    for (let i = 0; i < len; i++) dot += fx[a + i] * sx[b + i];
    const ef = L.f.p[a + len] - L.f.p[a];
    const es = L.s.p[b + len] - L.s.p[b];
    if (ef <= 1e-12 || es <= 1e-12) return null;
    return { offset: (b - a) / L.f.rate, ncc: dot / Math.sqrt(ef * es), gain: dot / es };
  }

  private search(L: { s: Level; f: Level }, a: number, len: number, lagFrom: number, lagTo: number): Match | null {
    let best: Match | null = null;
    for (let lag = lagFrom; lag <= lagTo; lag++) {
      const m = this.nccAt(L, a, a + lag, len);
      if (m && (!best || m.ncc > best.ncc)) best = m;
    }
    return best;
  }

  /** Fine search at 16 kHz within ±fineMs of an offset. */
  refine(outStart: number, seconds: number, offset: number, fineMs = 1): Match | null {
    const L = { s: this.src, f: this.fin };
    const a = Math.round(outStart * SR);
    const len = Math.round(seconds * SR);
    const lag = Math.round(offset * SR);
    const r = Math.max(1, Math.round((fineMs / 1000) * SR));
    return this.search(L, a, len, lag - r, lag + r);
  }

  /** Best match of final[outStart, +seconds) with offset in [center − range, center + range]. */
  local(outStart: number, seconds: number, center: number, range: number): Match | null {
    const L = { s: this.src2, f: this.fin2 };
    const a = Math.round(outStart * L.f.rate);
    const len = Math.round(seconds * L.f.rate);
    const c = Math.round(center * L.f.rate);
    const r = Math.round(range * L.f.rate);
    const coarse = this.search(L, a, len, c - r, c + r);
    if (!coarse) return null;
    return this.refine(outStart, seconds, coarse.offset, 1);
  }

  /** Best match anywhere in the source (FFT on the 1 kHz copy), refined to the sample. */
  global(outStart: number, seconds: number): (Match & { runnerUp: number }) | null {
    const S = this.src1;
    const F = this.fin1;
    const a = Math.round(outStart * F.rate);
    const len = Math.round(seconds * F.rate);
    if (a + len > F.x.length) return null;
    const ef = F.p[a + len] - F.p[a];
    if (ef <= 1e-12) return null;
    if (!this.srcSpectrum) {
      let n = 1;
      while (n < S.x.length + len) n <<= 1;
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      re.set(S.x);
      fft(re, im, false);
      this.srcSpectrum = { re, im, n };
    }
    const { re: sr, im: si, n } = this.srcSpectrum;
    if (n < S.x.length + len) return null;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < len; i++) re[i] = F.x[a + i];
    fft(re, im, false);
    // corr[k] = Σ s[n+k]·w[n]  ⇔  S · conj(W)
    for (let i = 0; i < n; i++) {
      const r = sr[i] * re[i] + si[i] * im[i];
      const m = si[i] * re[i] - sr[i] * im[i];
      re[i] = r;
      im[i] = m;
    }
    fft(re, im, true);
    let best = -1;
    let bestK = -1;
    const scores = new Float64Array(S.x.length - len + 1);
    for (let k = 0; k + len <= S.x.length; k++) {
      const es = S.p[k + len] - S.p[k];
      const v = es > 1e-12 ? re[k] / n / Math.sqrt(ef * es) : 0;
      scores[k] = v;
      if (v > best) {
        best = v;
        bestK = k;
      }
    }
    if (bestK < 0) return null;
    const guard = Math.round(0.1 * S.rate);
    let runnerUp = 0;
    for (let k = 0; k < scores.length; k++) if (Math.abs(k - bestK) > guard && scores[k] > runnerUp) runnerUp = scores[k];
    const coarse = (bestK - a) / S.rate;
    const m = this.local(outStart, seconds, coarse, 0.006);
    return m ? { ...m, runnerUp } : null;
  }

  /**
   * Squared error per frame of final[from, to) against the source shifted by offset
   * (scaled by gain), and the final's own energy per frame. Out-of-range source → Infinity.
   */
  frameErrors(from: number, to: number, offset: number, gain: number, frameSeconds: number): { err: Float64Array; energy: Float64Array } {
    const fl = Math.round(frameSeconds * SR);
    const a = Math.round(from * SR);
    const k = Math.max(0, Math.floor((Math.round(to * SR) - a) / fl));
    const lag = Math.round(offset * SR);
    const err = new Float64Array(k);
    const energy = new Float64Array(k);
    const f = this.fin.x;
    const s = this.src.x;
    for (let i = 0; i < k; i++) {
      let e = 0;
      let en = 0;
      let out = false;
      for (let j = 0; j < fl; j++) {
        const fi = a + i * fl + j;
        const si = fi + lag;
        const fv = f[fi] ?? 0;
        en += fv * fv;
        if (si < 0 || si >= s.length) {
          out = true;
          continue;
        }
        const d = fv - gain * s[si];
        e += d * d;
      }
      err[i] = out ? Infinity : e;
      energy[i] = en;
    }
    return { err, energy };
  }

  /** RMS (dBFS) of final (or source) frames, for telling speech from room tone. */
  finalFrameDb(frameSeconds: number, which: "final" | "source" = "final"): Float64Array {
    const L = which === "final" ? this.fin : this.src;
    const fl = Math.round(frameSeconds * SR);
    const n = Math.floor(L.x.length / fl);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const e = L.p[(i + 1) * fl] - L.p[i * fl];
      const rms = Math.sqrt(e / fl);
      out[i] = rms > 0 ? 20 * Math.log10(rms) : -120;
    }
    return out;
  }
}
