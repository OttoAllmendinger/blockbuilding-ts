import * as fs from 'fs';
import * as assert from 'assert';
import { Mempool, MempoolTx } from '../src/Mempool';
import { ancestorSet, AncestorSet, AncestorSetBlockBuilder, compareFeeRate } from '../src/AncestorSetBlockBuilder';
import { getDefaultMempool, getSortedMempool } from './fixtures';
import { fromNodeInfo, SizedTxSet, sortedIds, Tx } from '../src/TxGraph';
import { mustGet } from '../src/collections';

function assertEqualSets<T extends Tx>(
  builder: AncestorSetBlockBuilder<T>,
  a: AncestorSet<T>,
  b: AncestorSet<T>,
  i?: number
) {
  try {
    assert.deepStrictEqual(sortedIds(a.withAncestors), sortedIds(b.withAncestors));
  } catch (e) {
    console.error('error at index ' + i);
    console.error('compareSets', builder.compare.eval(a, b));
    console.error([a, b].map((s) => [s.withAncestors.aggFeeRate, s.tx.id]));
    throw e;
  }
}

describe('AncestorSetBlockBuilder', function () {
  let mempool: Mempool;

  function getBuilder(): AncestorSetBlockBuilder<MempoolTx> {
    return new AncestorSetBlockBuilder(fromNodeInfo(mempool), compareFeeRate);
  }

  async function getSortedMempoolSets(): Promise<AncestorSet<MempoolTx>[]> {
    return (await getSortedMempool()).map((txids) => {
      const txs = txids.map((t) => mustGet(mempool, t));
      return ancestorSet(txs[0], new SizedTxSet<MempoolTx>(txs));
    });
  }

  before('load mempool', async function () {
    mempool = await getDefaultMempool();
  });

  it('has expected order for builder sequence', async function () {
    this.timeout(Infinity);
    const refSets = await getSortedMempoolSets();
    const builder = getBuilder();
    let i = 0;
    const sets = [...builder.getOrderedAncestorSets()];
    assert.strictEqual(sets.length, refSets.length);
    for (const set of sets) {
      const refSet = refSets[i++];
      assertEqualSets(builder, set, refSet, i);
    }
  });

  it('write fee seq', function () {
    const builder = getBuilder();
    const seq = [...builder.getOrderedAncestorSets()];
    fs.writeFileSync(
      './seq.json',
      JSON.stringify(
        seq.map((s) => [s.withAncestors.aggFee, s.withAncestors.aggWeight]),
        null,
        2
      )
    );
  });

  it('clone works', function () {
    this.timeout(Infinity);
    const ba = new AncestorSetBlockBuilder(fromNodeInfo(mempool));
    const bb = ba.clone();
    assert.deepStrictEqual(sortedIds(bb.graph.nodes()), sortedIds(ba.graph.nodes()));
    for (let next = ba.popAncestorSet(); next; next = ba.popAncestorSet()) {
      const nextB = bb.popAncestorSet();
      assert.deepStrictEqual(next.tx.id, nextB?.tx.id);
    }
  });
});
