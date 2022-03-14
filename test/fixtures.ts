import * as fs from 'fs/promises';

import { Mempool, readMempool } from '../src/Mempool';

export async function getDefaultMempool(): Promise<Mempool> {
  return await readMempool('test/fixtures/mempool.json');
}

export async function getSortedMempool(): Promise<string[][]> {
  return JSON.parse(await fs.readFile('test/fixtures/mempool.sequenced.json', 'utf8'));
}
