import * as assert from 'assert';
import { Mempool, MempoolTx } from '../src/Mempool';
import { fromNodeInfo, SizedTxSet } from '../src/TxGraph';
import { getDefaultMempool } from './fixtures';
import { mustGet } from '../src/collections';

describe('Mempool', function () {
  let mempool: Mempool;

  before('load', async function () {
    mempool = await getDefaultMempool();
  });

  it('has expected data', function () {
    assert.strictEqual(mempool.size, 20606);
  });

  it('has expected graph data', function () {
    const graph = fromNodeInfo(mempool);
    function checkSetProps(tx: MempoolTx, set: SizedTxSet<MempoolTx>, count: number, fee: number) {
      set = new SizedTxSet(set);
      set.add(tx);
      assert.strictEqual(set.size, count, tx.id);
      assert.strictEqual(set.aggFee, fee, tx.id);
    }
    mempool.forEach((tx) => {
      checkSetProps(tx, mustGet(graph.depends.closure, tx), tx.ancestorcount, tx.ancestorfees);
      checkSetProps(tx, mustGet(graph.spentBy.closure, tx), tx.descendantcount, tx.descendantfees);
    });
  });
});
