import * as assert from 'assert';
import { SizedTxSet, sortedIds, Tx } from '../src/TxGraph';
import { ancestorSet, compareFeeRateAndFee } from '../src/AncestorSetBlockBuilder';

describe('TxGraph', function () {
  function ancestorSetFrom(...txs: Tx[]) {
    return ancestorSet(txs[0], new SizedTxSet(txs));
  }

  function tx(id: string, fee: number, weight: number): Tx {
    return {
      id,
      fee,
      weight,
      depends: [],
      spentby: [],
    };
  }

  it('orders transactions correctly', function () {
    const setA = ancestorSetFrom(tx('x', 1, 1), tx('y', 1, 1));
    const setB = ancestorSetFrom(tx('w', 1, 1), tx('a', 1, 1));
    const allSets = [setA, setB];
    allSets.sort(compareFeeRateAndFee.comparator);
    assert.deepStrictEqual(
      allSets.map((s) => sortedIds(s.withAncestors)),
      [
        ['a', 'w'],
        ['x', 'y'],
      ]
    );
  });
});
