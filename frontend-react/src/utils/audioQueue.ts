// Simple serialized audio queue using a single HTMLAudioElement.
// Guarantees no overlap and exposes “started” Promise for accurate metrics.
export type EnqueueOptions = { waitReady?: boolean; readyUrl?: string; readyTimeoutMs?: number };

export class AudioQueue {
  private audio = new Audio();
  private q: { url: string; resolveStart: (t: number) => void; opts?: EnqueueOptions }[] = [];
  private playing = false;

  constructor() {
    this.audio.addEventListener('ended', () => this.playNext());
    this.audio.addEventListener('error', () => this.playNext());
  }

  async enqueue(url: string, opts?: EnqueueOptions): Promise<number> {
    // returns ms timestamp (Date.now()) when playback actually STARTS
    if (opts?.waitReady && opts.readyUrl) {
      await this.waitReady(opts.readyUrl, opts.readyTimeoutMs ?? 1500);
    }
    return new Promise<number>((resolve) => {
      this.q.push({ url, resolveStart: resolve, opts });
      if (!this.playing) this.playNext();
    });
  }

  private async playNext() {
    const item = this.q.shift();
    if (!item) {
      this.playing = false;
      return;
    }
    this.playing = true;
    try {
      this.audio.src = item.url;
      // Start as soon as it can play; measure on 'playing'
      const startedAt = await this.playWithStartTimestamp(this.audio);
      item.resolveStart(startedAt);
    } catch {
      item.resolveStart(Date.now());
      // continue
    }
  }

  private playWithStartTimestamp(a: HTMLAudioElement): Promise<number> {
    return new Promise<number>((resolve) => {
      const onPlaying = () => {
        a.removeEventListener('playing', onPlaying);
        resolve(Date.now());
      };
      a.addEventListener('playing', onPlaying);
      a.play().catch(() => {
        a.removeEventListener('playing', onPlaying);
        resolve(Date.now());
      });
    });
  }

  private async waitReady(url: string, timeoutMs: number) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const ok = await fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
      if (ok) return;
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}

// Singleton instance
export const audioQueue = new AudioQueue();
