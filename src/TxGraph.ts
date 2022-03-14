import { DynGraph, RelationMap, TransitiveClosure } from './DynGraph';

export interface SizedTx {
  fee: number;
  weight: number;
}

export type Tx = SizedTx & LinkedTx;

export function sortedIds<T extends Tx>(txs: Iterable<T>, length = Infinity): string[] {
  return [...txs].map((t) => t.id.substring(0, length)).sort();
}

export function deref<T>(keys: Iterable<string>, map: Map<string, T>): Map<string, T> {
  return new Map(
    [...keys].map((k) => {
      const v = map.get(k);
      if (!v) {
        throw new Error(`no value for key ${k}`);
      }
      return [k, v];
    })
  );
}

export class SizedTxSet<T extends SizedTx> implements Set<T> {
  public set = new Set<T>();
  public aggWeight = 0;
  public aggFee = 0;

  get aggFeeRate(): number {
    return this.aggFee / this.aggWeight;
  }

  constructor(v?: SizedTxSet<T> | Iterable<T>) {
    if (v) {
      if (v instanceof SizedTxSet) {
        this.set = new Set(v.set);
        this.aggWeight = v.aggWeight;
        this.aggFee = v.aggFee;
      } else {
        for (const vv of v) {
          this.add(vv);
        }
      }
    }
  }

  get [Symbol.toStringTag](): string {
    return this.set[Symbol.toStringTag];
  }

  get size(): number {
    return this.set.size;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.set[Symbol.iterator]();
  }

  add(value: T): this {
    if (this.set.size < this.set.add(value).size) {
      this.aggFee += value.fee;
      this.aggWeight += value.weight;
    }
    return this;
  }

  clear(): void {
    this.set.clear();
    this.aggFee = 0;
    this.aggWeight = 0;
  }

  delete(value: T): boolean {
    if (this.set.delete(value)) {
      this.aggFee -= value.fee;
      this.aggWeight -= value.weight;
      return true;
    }
    return false;
  }

  entries(): IterableIterator<[T, T]> {
    return this.set.entries();
  }

  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
    return this.set.forEach(callbackfn);
  }

  has(value: T): boolean {
    return this.set.has(value);
  }

  keys(): IterableIterator<T> {
    return this.set.keys();
  }

  values(): IterableIterator<T> {
    return this.set.values();
  }
}

class TransitiveClosureSizedTx<T extends SizedTx> extends TransitiveClosure<T, SizedTxSet<T>> {
  static from<T extends SizedTx>(s: TransitiveClosure<T, Set<T>>) {
    const tc = new TransitiveClosureSizedTx(new Map());
    return new TransitiveClosureSizedTx(tc.cloneRel(s.rel), tc.cloneRel(s.closure));
  }

  createSet(v: Set<T> | undefined): SizedTxSet<T> {
    return new SizedTxSet<T>(v);
  }
}

export class TxGraph<T extends Tx> extends DynGraph<T, SizedTxSet<T>> {
  static from<T extends Tx>(depends: TransitiveClosure<T, Set<T>>, spentBy: TransitiveClosure<T, Set<T>>): TxGraph<T> {
    return new TxGraph<T>(TransitiveClosureSizedTx.from(depends), TransitiveClosureSizedTx.from(spentBy));
  }

  constructor(depends: TransitiveClosure<T, SizedTxSet<T>>, spentBy: TransitiveClosure<T, SizedTxSet<T>>) {
    super(depends, spentBy);
  }

  subgraph(txs: Set<T>): TxGraph<T> {
    const subgraph = super.subgraph(txs);
    return TxGraph.from(subgraph.depends, subgraph.spentBy);
  }

  clone(): TxGraph<T> {
    return TxGraph.from(this.depends, this.spentBy);
  }
}

export interface LinkedTx {
  id: string;
  depends: string[];
  spentby: string[];
}

export function fromNodeInfo<T extends SizedTx & LinkedTx>(txs: Map<string, T>): TxGraph<T> {
  function mapValues(txs: Iterable<T>, f: (v: T) => IterableIterator<T>): RelationMap<T, SizedTxSet<T>> {
    return new Map([...txs].map((v) => [v, new SizedTxSet<T>(f(v))]));
  }
  return new TxGraph(
    new TransitiveClosureSizedTx(mapValues(txs.values(), (tx) => deref(tx.depends, txs).values())),
    new TransitiveClosureSizedTx(mapValues(txs.values(), (tx) => deref(tx.spentby, txs).values()))
  );
}
