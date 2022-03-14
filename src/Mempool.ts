import * as fs from 'fs/promises';
import { Tx } from './TxGraph';

export type MempoolTx = {
  id: string;
  fee: number;
  vsize: number;
  weight: number;

  depends: string[];
  spentby: string[];

  descendantcount: number;
  descendantsize: number;
  descendantfees: number;

  ancestorcount: number;
  ancestorsize: number;
  ancestorfees: number;
};

export type Mempool = Map<string, MempoolTx>;

export async function readMempool(path: string): Promise<Mempool> {
  const mempoolObj: Record<string, MempoolTx> = JSON.parse(await fs.readFile(path, 'utf8'));
  return new Map(
    Object.entries(mempoolObj).map(([txid, tx]) => {
      return [
        txid,
        {
          ...tx,
          id: txid,
          fee: Math.round(tx.fee * 1e8),
          toString() {
            return `MempoolTx{id=${this.id}}`;
          },
        },
      ];
    })
  );
}

export function sum(arr: { fee: number; vsize: number }[], prop: 'fee' | 'vsize'): number {
  return arr.reduce((s, v) => s + v[prop], 0);
}

export function getVSizeFromWeight(weight: number): number {
  return Math.floor((weight + 3) / 4);
}

export async function readMempoolTxt(path: string): Promise<Map<string, Tx>> {
  function closeSpent(m: Map<string, Tx>, tx: Tx) {
    tx.depends.forEach((txid) => {
      const parent = m.get(txid);
      if (!parent) {
        throw new Error(`no parent ${txid}`);
      }
      if (parent.spentby.includes(tx.id)) {
        return;
      }
      parent.spentby.push(tx.id);
    });
  }

  const data = await fs.readFile(path, 'utf-8');
  const txs: Tx[] = data
    .split('\n')
    .map((l) => l.split(' '))
    .filter((arr) => arr.length > 1 && arr[0] !== '#')
    .map(
      ([id, fee, weight, ...depends]): Tx => ({
        id,
        fee: Number(fee),
        weight: Number(weight),
        depends,
        spentby: [],
      })
    );

  const txMap = new Map<string, Tx>(txs.map((t) => [t.id, t]));
  txMap.forEach((tx) => closeSpent(txMap, tx));
  console.log(
    'mempoolTxt',
    txMap.size,
    'aggWeight',
    [...txMap.values()].reduce((sum, t) => sum + t.weight, 0)
  );
  return txMap;
}
