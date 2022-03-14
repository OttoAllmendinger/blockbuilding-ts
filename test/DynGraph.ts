import * as assert from 'assert';
import { RelationMap, TransitiveClosure, TransitiveClosureDefaultSet } from '../src/DynGraph';
import { DynGraph } from '../src/DynGraph';
import { LinkedTx } from '../src/TxGraph';

function shuffle<T>(arr: T[]): T[] {
  return arr
    .map((v): [number, T] => [Math.random(), v])
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
}

function toRelmap(pairs: Record<string, string[]>, sort: <T>(v: T[]) => T[]): RelationMap<string, Set<string>> {
  return new Map(sort(Object.entries(pairs)).map(([k, v]) => [k, new Set(sort(v))]));
}

function toObj(m: RelationMap<string, Set<string>>): Record<string, string[]> {
  const keys = [...m.keys()].sort();
  return Object.fromEntries(keys.map((k) => [k, [...(m.get(k) ?? [])].sort()]));
}

class DynGraphStr extends DynGraph<string, Set<string>> {}

function test(a: Record<string, string[]>, b: Record<string, string[]>) {
  for (let i = 0; i < 10; i++) {
    const f = i === 0 ? <T>(v: T[]) => v.sort() : shuffle;
    assert.deepStrictEqual(toObj(new TransitiveClosureDefaultSet(toRelmap(a, f)).closure), b);
  }
}

describe('RelationMap', function () {
  it('builds transitive closure', function () {
    test(
      { a: ['b'], b: ['c'], c: ['d'] },
      {
        a: ['b', 'c', 'd'],
        b: ['c', 'd'],
        c: ['d'],
      }
    );

    test(
      { a: ['b', 'd'], b: ['c'], c: ['d'] },
      {
        a: ['b', 'c', 'd'],
        b: ['c', 'd'],
        c: ['d'],
      }
    );

    test(
      { a: ['b'], b: [], c: ['d'] },
      {
        a: ['b'],
        b: [],
        c: ['d'],
      }
    );

    test(
      { a: ['b'], b: [], c: ['d', 'a'] },
      {
        a: ['b'],
        b: [],
        c: ['a', 'b', 'd'],
      }
    );
  });
});

describe('DynGraph', function () {
  function createRel<A, B>(v: A[], f: (v: A) => [B, Set<B>]): TransitiveClosure<B, Set<B>> {
    return new TransitiveClosureDefaultSet(new Map(v.map((e) => f(e))));
  }

  type TestTx = LinkedTx & { id: string };

  function node(id: string, depends: string[], spentby: string[]): TestTx {
    return {
      id,
      depends,
      spentby,
    };
  }

  function getGraph(...nodes: TestTx[]): DynGraphStr {
    return new DynGraphStr(
      createRel(nodes, (n): [string, Set<string>] => [n.id, new Set(n.depends)]),
      createRel(nodes, (n): [string, Set<string>] => [n.id, new Set(n.spentby)])
    );
  }

  function sampleGraph(): DynGraphStr {
    return getGraph(node('a', [], ['b', 'd']), node('b', ['a'], ['c']), node('c', ['b'], []), node('d', ['a'], []));
  }

  function orderedKeys(t: Set<string> = new Set()): string[] {
    return [...t].sort();
  }

  it('finds ancestors', function () {
    const abc = sampleGraph();
    assert.deepStrictEqual(orderedKeys(abc.depends.closure.get('a')), []);
    assert.deepStrictEqual(orderedKeys(abc.depends.closure.get('b')), ['a']);
    assert.deepStrictEqual(orderedKeys(abc.depends.closure.get('c')), ['a', 'b']);
    assert.deepStrictEqual(orderedKeys(abc.depends.closure.get('d')), ['a']);
  });

  it('removes nodes', function () {
    function testRemove(k: string, ancs: string[][], descs: string[][]) {
      const g = sampleGraph();
      g.remove(k);
      assert.deepStrictEqual(
        ['a', 'b', 'c', 'd'].map((kk) => orderedKeys(g.depends.closure.get(kk))),
        ancs
      );
      assert.deepStrictEqual(
        ['a', 'b', 'c', 'd'].map((kk) => orderedKeys(g.spentBy.closure.get(kk))),
        descs
      );
    }

    testRemove('a', [[], [], ['b'], []], [[], ['c'], [], []]);
    testRemove('b', [[], [], [], ['a']], [['d'], [], [], []]);
    testRemove('c', [[], ['a'], [], ['a']], [['b', 'd'], [], [], []]);
    testRemove('d', [[], ['a'], ['a', 'b'], []], [['b', 'c'], ['c'], [], []]);
  });
});
