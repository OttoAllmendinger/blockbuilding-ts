## Transaction Scoring during Block Building

The Bitcoin block-building algorithm fills a block by continuously picking transactions from a heap.

Transactions are compared pairwise by the feerate of their ancestor sets (satoshi per weight-unit).
If the ancestor sets have the same feerate, the transaction with the smaller txid is chosen.[^1]
If the best candidate transaction does not fit into the block, it is discarded and the search continues with the next
best transaction (limited to 1000 attempts).[^2]

This document compares the default transaction set scoring with a modified version that uses a different tiebreaker:
when two transaction sets have equal feerate, prefer the set with greater weight.

The strategy does not always provide the better solution, since it may prevent the inclusion of a greater number of sets
that fill the remaining block space more optimally.

However, by default we should not assume that more than one transaction fits into the remaining blockspace.

### Benchmark Method

We apply both the default block-building algorithm and the modified version on a number of mempool snapshots.

For every snapshot, we sample over 200 points of the blocklimit parameter in the range between 3.00Mwu (3,000,000
weight-units) to 5.00Mwu in increments of 10,000 weight-units.

This allows us to determine the average fee improvement of the new tiebreaker for the sampled blocks.


| Mempool Snapshot (Blockheight) | Size (Mwu) |  Average Fee Improvement (Satoshi) |
|--------------------------------|-----------:|-----------------------------------------:|
|497672|333|27.28|
|628405|41|-23.41|
|628480|35|-15.55|
|629400|96|95.65|
|629401|99|37.34|
|629402|96|48.57|
|629928|16|0.00|
|631705|232|5.99|
|632671|14|910.70|
|632696|30|0.52|

## Code, Raw Data

* [`builderCmp.ts`](./builderCmp.ts)
* [`results.json`](./results.json)

[^1]: https://github.com/bitcoin/bitcoin/blob/23.x/src/txmempool.h#L279-L294
[^2]: https://github.com/bitcoin/bitcoin/blob/23.x/src/node/miner.cpp#L395-L412
