/**
 * Bounded exponential backoff with full jitter, 1 s to 30 s, as the desktop
 * contract asks of foreground reconnects. Reset on success or an explicit retry.
 */
export class Backoff {
  private attempt = 0;

  constructor(
    private readonly minMs = 1000,
    private readonly maxMs = 30_000,
    private readonly random: () => number = Math.random,
  ) {}

  next(): number {
    const ceiling = Math.min(this.maxMs, this.minMs * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 16);
    return Math.max(this.minMs, Math.round(ceiling * this.random()));
  }

  reset(): void {
    this.attempt = 0;
  }
}
