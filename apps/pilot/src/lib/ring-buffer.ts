/**
 * Fixed-capacity circular buffer. New items push out the oldest.
 *
 * Pure structural helper — no mutation of inputs. Callers should not mutate
 * the returned array from `toArray()`.
 */
export class RingBuffer<T> {
  private readonly items: T[] = [];
  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0');
  }

  push(item: T): void {
    this.items.unshift(item);
    if (this.items.length > this.capacity) {
      this.items.length = this.capacity;
    }
  }

  toArray(): T[] {
    return this.items.slice();
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}
