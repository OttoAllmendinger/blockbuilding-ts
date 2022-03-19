import * as fs from 'fs/promises';
import {
  AncestorSet,
  AncestorSetBlockBuilder,
  ChainCompare,
  compareFeeRate,
  compareFeeRateAndWeight,
} from '../src/AncestorSetBlockBuilder';
import { fromNodeInfo, Tx } from '../src/TxGraph';
import { readMempool, readMempoolTxt } from '../src/Mempool';

type TxDim = [fee: number, weight: number];

function dimSum([a, b]: TxDim, [c, d]: TxDim): TxDim {
  return [a + c, b + d];
}

function collectDim(sets: Generator<AncestorSet<Tx>>): TxDim {
  let dim: TxDim = [0, 0];
  for (const s of sets) {
    dim = dimSum(dim, [s.withAncestors.aggFee, s.withAncestors.aggWeight]);
  }
  return dim;
}

class DimCollector {
  aggDim: TxDim = [0, 0];

  constructor(public builder: AncestorSetBlockBuilder<Tx>) {}

  remaining(weightLimit: number): number {
    return weightLimit - this.aggDim[1];
  }

  collect(weightLimit: number): TxDim {
    if (this.remaining(weightLimit) < 0) {
      throw new Error(`newer weightLimit must exceed prior`);
    }

    // seek to `remaining` with `maxFailures: 0`
    // this method leaves builder heap in a state where we did not throw away any txs yet
    this.aggDim = dimSum(this.aggDim, collectDim(this.builder.getOrderedAncestorSets(this.remaining(weightLimit), 0)));

    // perform deeper search with builder clone since we throw await some txs
    return dimSum(this.aggDim, collectDim(this.builder.clone().getOrderedAncestorSets(this.remaining(weightLimit))));
  }
}

function getBlocksForLimits(mempool: Map<string, Tx>, cmp: ChainCompare, weightLimits: number[]): TxDim[] {
  const dimCollector = new DimCollector(new AncestorSetBlockBuilder<Tx>(fromNodeInfo(mempool), cmp));
  return weightLimits
    .map((l, i, arr) => {
      if (dimCollector.builder.graph.size() === 0) {
        arr.length = i;
      }
      console.log('getBlocksForLimits', l, i, '/', weightLimits.length);
      return dimCollector.collect(l);
    })
    .filter((v) => v);
}

type EvalResult = { weightLimits: number[]; results: TxDim[] };

const weightLimits = Array.from({ length: 200 }).map((_, i) => 3_000_000 + i * 10_000);

function evalCmp(m: Map<string, Tx>, cmp: ChainCompare): EvalResult {
  const results = getBlocksForLimits(m, cmp, weightLimits);
  return { weightLimits, results };
}

type EvalResultDiff = {
  diff: {
    limit: number;
    remaining: [number, number];
    feeDiff: number;
  }[];
  avgDiff: number;
};

function getDiff(a: EvalResult, b: EvalResult, headers?: string[]): EvalResultDiff {
  if (headers) {
    console.log(headers.join('\t'));
  }
  const diff = a.weightLimits.flatMap((limit, i) => {
    const [fa, wa] = a.results[i];
    const [fb, wb] = b.results[i];
    if (fa === fb) {
      return [];
    }
    return [{ limit, remaining: [limit - wa, limit - wb] as [number, number], feeDiff: fa - fb }];
  });
  const avgDiff = a.results.reduce((sum, [fa], i) => sum + (fa - b.results[i][0]), 0) / a.results.length;
  return { diff, avgDiff };
}

async function readMempoolFromPath(path: string): Promise<Map<string, Tx>> {
  if (path.endsWith('.json')) {
    return await readMempool(path);
  } else if (path.endsWith('.mempool')) {
    return await readMempoolTxt(path);
  } else {
    throw new Error('invalid mempool path');
  }
}

const resultFile = 'compareSort/results.json';

async function getFiles(): Promise<string[]> {
  const prefix = 'compareSort/mempool-txt-dumps';
  return (await fs.readdir(prefix)).map((p) => `${prefix}/${p}`);
}

async function getAllMempools(minSize: number): Promise<[string, Map<string, Tx>][]> {
  return (
    await Promise.all(
      (await getFiles()).map(async (p) => [p, await readMempoolFromPath(p)] as [string, Map<string, Tx>])
    )
  ).filter(([, pool]) => getAggSize(pool) > minSize);
}

function getAggSize(p: Map<string, Tx>): number {
  return [...p.values()].reduce((sum, v) => sum + v.weight, 0);
}

async function genResults() {
  const mempools = await getAllMempools(weightLimits[weightLimits.length - 1]);
  const resultsByFile = mempools.map(([path, pool]) => {
    console.log(`getDiff ${path}`);
    return [path, getDiff(evalCmp(pool, compareFeeRateAndWeight), evalCmp(pool, compareFeeRate))];
  });
  await fs.writeFile(resultFile, JSON.stringify(resultsByFile, null, 2) + '\n');
}

async function genMarkdownTable() {
  const mempools = await getAllMempools(weightLimits[weightLimits.length - 1]);
  function getColumn(path: string): string {
    const pathParts = path.split('/');
    const nameParts = pathParts[pathParts.length - 1].split('_');
    return nameParts[0];
  }
  const data: [path: string, diff: EvalResultDiff][] = JSON.parse(await fs.readFile(resultFile, 'utf-8'));
  console.log(data.map(([path]) => path));
  const lines = data.map(([path, diff], i) =>
    ['', getColumn(path), (getAggSize(mempools[i][1]) / (1000 * 1000)).toFixed(0), diff.avgDiff.toFixed(2), ''].join(
      '|'
    )
  );
  await fs.writeFile('compareSort/table.md', lines.join('\n'));
}

async function main() {
  if (process.argv.includes('--json')) {
    await genResults();
  }

  if (process.argv.includes('--markdown')) {
    await genMarkdownTable();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
