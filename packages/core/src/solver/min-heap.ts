import { readAt } from './read-at.js';

const CHILDREN = 2;

interface Entry {
  readonly value: number;
  readonly priority: number;
  /** Push count, so equal priorities pop in push order. */
  readonly order: number;
}

const NONE: Entry = { value: -1, priority: Infinity, order: Infinity };

/** Binary min-heap of cell indexes keyed by priority. Equal priorities pop in push order. */
export class MinHeap {
  private readonly entries: Entry[] = [];
  private pushes = 0;

  get size(): number {
    return this.entries.length;
  }

  push(value: number, priority: number): void {
    this.entries.push({ value, priority, order: this.pushes });
    this.pushes += 1;
    this.siftUp(this.entries.length - 1);
  }

  /** The value with the lowest priority, or undefined when empty. */
  pop(): number | undefined {
    const last = this.entries.pop();
    if (last === undefined) return undefined;
    if (this.entries.length === 0) return last.value;
    const top = this.at(0);
    this.entries[0] = last;
    this.siftDown(0);
    return top.value;
  }

  private at(index: number): Entry {
    return readAt(this.entries, index, NONE);
  }

  private before(a: number, b: number): boolean {
    const first = this.at(a);
    const second = this.at(b);
    return (
      first.priority < second.priority ||
      (first.priority === second.priority && first.order < second.order)
    );
  }

  private swap(a: number, b: number): void {
    const first = this.at(a);
    this.entries[a] = this.at(b);
    this.entries[b] = first;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / CHILDREN);
      if (!this.before(index, parent)) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * CHILDREN + 1;
      let smallest = index;
      if (this.before(left, smallest)) smallest = left;
      if (this.before(left + 1, smallest)) smallest = left + 1;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }
}
