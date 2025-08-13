// Simple mastery and adaptivity tracking

import type { MasteryThresholds, UnitSpec } from './contentConfig';

export class MasteryTracker {
  private records: Record<string, number[]> = {};
  private thresholds: MasteryThresholds;
  constructor(thresholds: MasteryThresholds) {
    this.thresholds = thresholds;
  }

  record(unit: UnitSpec, accuracy: number) {
    const key = unit.id;
    const arr = this.records[key] || [];
    arr.push(accuracy);
    const { sessions } = unit.mastery_thresholds || this.thresholds;
    this.records[key] = arr.slice(-sessions);
  }

  isMastered(unit: UnitSpec): boolean {
    const t = unit.mastery_thresholds || this.thresholds;
    const arr = this.records[unit.id] || [];
    if (arr.length < t.sessions) return false;
    return arr.every((v) => v >= t.accuracy);
  }
}

export class MistakeProfile {
  private ema: Record<string, number> = {};
  private readonly alpha = 0.3;

  record(phoneme: string, correct: boolean) {
    const prev = this.ema[phoneme] ?? 0;
    const val = correct ? 0 : 1;
    this.ema[phoneme] = prev * (1 - this.alpha) + val * this.alpha;
  }

  weak(threshold = 0.15): string[] {
    return Object.entries(this.ema)
      .filter(([, v]) => v > threshold)
      .map(([k]) => k)
      .slice(0, 2);
  }
}

