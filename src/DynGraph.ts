import { addAll, intersect, mustGet } from './collections';

export type RelationMap<T, TSet extends Set<T>> = Map<T, TSet>;

function checkRemoved<T>(c: TransitiveClosure<T, Set<T>>, k: T, rel?: RelationMap<T, Set<T>>) {
  if (rel) {
    if (rel.has(k)) {
      throw new Error(`k ${k} in rel`);
    }
    rel.forEach((v, kk) => {
      if (v.has(k)) {
        throw new Error(`k ${k} in rel[${kk}]`);
      }
    });
  } else {
    checkRemoved(c, k, c.rel);
    checkRemoved(c, k, c.closure);
  }
}

/**
 * Builds the transitive closure for binary relation `rel`
 *
 *  { a: ['b'], b: ['c'] } => { a: ['b', 'c'], b: ['c'] }
 */
export abstract class TransitiveClosure<T, TSet extends Set<T>> {
  public rel: RelationMap<T, TSet>;
  public closure: RelationMap<T, TSet> = new Map();

  constructor(v: RelationMap<T, TSet> | TransitiveClosure<T, TSet>, closure?: RelationMap<T, TSet>) {
    let rel: RelationMap<T, TSet>;
    if (v instanceof TransitiveClosure) {
      rel = v.cloneRel(v.rel);
      closure = v.cloneRel(v.closure);
    } else {
      if (!(v instanceof Map)) {
        throw new Error(`invalid argument`);
      }
      rel = v;
    }

    this.rel = rel;
    if (closure) {
      this.closure = closure;
    } else {
      this.traverseAll();
    }
  }

  abstract createSet(v?: Iterable<T>): TSet;

  traverse(k: T, v: TSet): Set<T> {
    // return cached value if present
    const c = this.closure.get(k);
    if (c) {
      return c;
    }

    // compute closure recursively
    for (const kk of [...v]) {
      const vv = this.rel.get(kk);
      if (vv) {
        addAll(v, this.traverse(kk, this.createSet(vv)));
      }
    }
    this.closure.set(k, v);
    return v;
  }

  traverseAll() {
    this.rel.forEach((v, k) => {
      this.traverse(k, this.createSet(v));
    });
  }

  /**
   * Remove k from relation and it's transitive closure
   * @param kInv
   * @param k
   */
  remove(kInv: Set<T>, k: T) {
    this.rel.delete(k);
    this.closure.delete(k);

    // use inverse relation to remove k from rel and closure
    kInv.forEach((kk) => {
      mustGet(this.rel, kk).delete(k);
      this.closure.delete(kk);
    });

    // use inverse relation to rebuild closure
    kInv.forEach((kk) => {
      const v = this.rel.get(kk);
      if (v) {
        this.traverse(kk, this.createSet(v));
      }
    });
  }

  cloneRel(rel: RelationMap<T, Set<T>>): RelationMap<T, TSet> {
    return new Map([...rel.entries()].map(([k, v]) => [k, this.createSet(v)]));
  }

  subset(s: Set<T>): TransitiveClosureDefaultSet<T> {
    return new TransitiveClosureDefaultSet(
      new Map<T, Set<T>>(
        [...s].map((t) => {
          const tRel = new Set(mustGet(this.rel, t));
          intersect(tRel, s);
          return [t, tRel];
        })
      )
    );
  }
}

export class TransitiveClosureDefaultSet<T> extends TransitiveClosure<T, Set<T>> {
  createSet(v?: Iterable<T>): Set<T> {
    return new Set<T>(v);
  }
}

export class DynGraph<T, TSet extends Set<T>> {
  checkRemoved = false;

  constructor(public depends: TransitiveClosure<T, TSet>, public spentBy: TransitiveClosure<T, TSet>) {}

  removeFrom(c: TransitiveClosure<T, TSet>, kInv: Set<T>, k: T) {
    c.remove(kInv, k);
  }

  remove(k: T) {
    const kAncestors = new Set(this.depends.closure.get(k));
    const kDescendents = new Set(this.spentBy.closure.get(k));
    if (!kAncestors || !kDescendents) {
      throw new Error(`kInv error ${k}`);
    }
    this.removeFrom(this.depends, kDescendents, k);
    this.removeFrom(this.spentBy, kAncestors, k);

    if (this.checkRemoved) {
      checkRemoved(this.depends, k);
      checkRemoved(this.spentBy, k);
    }
  }

  removeAll(ks: Iterable<T>) {
    for (const k of ks) {
      this.remove(k);
    }
  }

  /**
   * @param order
   * @return transactions in topological order
   */
  getTransactionsTopo(order?: <T>(a: T, b: T) => number): T[] {
    function getRoots(g: DynGraph<T, Set<T>>): T[] {
      const roots: T[] = [];
      g.depends.rel.forEach((v, k) => {
        if (v.size === 0) {
          roots.push(k);
        }
      });
      if (order) {
        roots.sort(order);
      }
      return roots;
    }

    const g = new DynGraph<T, Set<T>>(
      new TransitiveClosureDefaultSet(this.depends),
      new TransitiveClosureDefaultSet(this.spentBy)
    );

    const seq: T[] = [];

    while (g.depends.rel.size) {
      const roots = getRoots(g);
      seq.push(...roots);
      roots.forEach((t) => g.remove(t));
    }

    return seq;
  }

  /**
   * Return subgraph
   */
  subgraph(s: Set<T>): DynGraph<T, Set<T>> {
    return new DynGraph<T, Set<T>>(this.depends.subset(s), this.spentBy.subset(s));
  }

  nodes(): TSet {
    return this.depends.createSet(this.depends.closure.keys());
  }

  size(): number {
    return this.depends.closure.size;
  }
}
