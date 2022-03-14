import Heap from 'heap-js';

import { fromNodeInfo, SizedTxSet, Tx, TxGraph } from './TxGraph';
import { addAll, deleteAll, mustGet } from './collections';

type CompareFunc<T extends Tx> = (a: AncestorSet<T>, b: AncestorSet<T>) => number;

const compareAggFeeRate: CompareFunc<Tx> = (a, b) => b.withAncestors.aggFeeRate - a.withAncestors.aggFeeRate;
const compareAggFee: CompareFunc<Tx> = (a, b) => b.withAncestors.aggFee - a.withAncestors.aggFee;
const compareRepTxid: CompareFunc<Tx> = (a, b) => a.tx.id.localeCompare(b.tx.id);

const MAX_CONSECUTIVE_FAILURES = 1000;

export class ChainCompare {
  public funcs: CompareFunc<Tx>[];

  constructor(...funcs: CompareFunc<Tx>[]) {
    this.funcs = funcs;
  }

  apply(a: AncestorSet<Tx>, b: AncestorSet<Tx>): number {
    for (const f of this.funcs) {
      const v = f(a, b);
      if (v !== 0) {
        return v;
      }
    }

    return 0;
  }

  eval(a: AncestorSet<Tx>, b: AncestorSet<Tx>): number[] {
    return this.funcs.map((f) => f(a, b));
  }

  get comparator() {
    return this.apply.bind(this);
  }
}

export const compareFeeRate = new ChainCompare(compareAggFeeRate, compareRepTxid);
export const compareFeeRateAndFee = new ChainCompare(compareAggFeeRate, compareAggFee, compareRepTxid);

export type AncestorSet<T extends Tx> = {
  tx: T;
  withAncestors: SizedTxSet<T>;
};

export function ancestorSet<T extends Tx>(tx: T, withAncestors: SizedTxSet<T>): AncestorSet<T> {
  return { tx, withAncestors };
}

/**
 * Transaction inclusion algorithm as implemented by Bitcoin Core
 *
 * https://gist.github.com/Xekyo/5cb413fe9f26dbce57abfd344ebbfaf2#file-candidate-set-based-block-building-md
 */
export class AncestorSetBlockBuilder<T extends Tx> {
  static CONSENSUS_WEIGHT_LIMIT = 3992820;

  byHighestAncestorSetFeeRate: Heap<T>;

  constructor(public graph: TxGraph<T>, public compare = compareFeeRateAndFee, heapArray?: T[]) {
    this.byHighestAncestorSetFeeRate = this.createHeap(heapArray);
  }

  static fromPool<T extends Tx>(pool: Map<string, T>) {
    return new AncestorSetBlockBuilder(fromNodeInfo(pool));
  }

  withAncestors(t: T): AncestorSet<T> {
    const s = new SizedTxSet(mustGet(this.graph.depends.closure, t));
    s.add(t);
    return ancestorSet(t, s);
  }

  createHeap(heapArray?: T[]): Heap<T> {
    const heap = new Heap<T>((a, b) =>
      a === b ? 0 : this.compare.apply(this.withAncestors(a), this.withAncestors(b))
    );
    if (heapArray) {
      heap.heapArray = heapArray;
    } else {
      heap.init([...this.graph.depends.closure.keys()]);
    }
    return heap;
  }

  removeAll(ancestorSet: AncestorSet<T>) {
    const set = new Set(ancestorSet.withAncestors);
    const recalc = new Set<T>();
    set.forEach((k) => {
      addAll(recalc, mustGet(this.graph.spentBy.closure, k));
    });
    deleteAll(recalc, set);
    [set, recalc].forEach((s) => {
      s.forEach((k) => {
        if (!this.byHighestAncestorSetFeeRate.remove(k)) {
          throw new Error(`could not remove ${k}`);
        }
      });
    });
    this.graph.removeAll(set);
    this.byHighestAncestorSetFeeRate.addAll([...recalc]);
  }

  peekAncestorSet(): AncestorSet<T> | undefined {
    const tx = this.byHighestAncestorSetFeeRate.peek();
    if (tx) {
      return this.withAncestors(tx);
    }
  }

  popAncestorSet(): AncestorSet<T> | undefined {
    const set = this.peekAncestorSet();
    if (set) {
      this.removeAll(set);
      this.graph.removeAll(set.withAncestors);
      return set;
    }
  }

  *getOrderedAncestorSets(maxWeight = Infinity, maxFailures = MAX_CONSECUTIVE_FAILURES): Generator<AncestorSet<T>> {
    let aggWeight = 0;
    let nConsecutiveFailures = 0;
    for (let next = this.peekAncestorSet(); next; next = this.peekAncestorSet()) {
      if (aggWeight + next.withAncestors.aggWeight > maxWeight) {
        if (++nConsecutiveFailures > maxFailures) {
          return;
        }
        this.popAncestorSet();
        continue;
      }
      this.popAncestorSet();
      aggWeight += next.withAncestors.aggWeight;
      nConsecutiveFailures = 0;
      yield next;
    }
  }

  clone(): AncestorSetBlockBuilder<T> {
    return new AncestorSetBlockBuilder<T>(this.graph.clone(), this.compare, [
      ...this.byHighestAncestorSetFeeRate.heapArray,
    ]);
  }
}
