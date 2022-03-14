export function mustGet<K, V>(m: Map<K, V>, k: K): V {
  const v = m.get(k);
  if (v) {
    return v;
  }
  throw new Error(`key ${k} not in map`);
}

export function addAll<T>(a: Set<T>, b: Set<T>) {
  b.forEach((e) => a.add(e));
}

export function deleteAll<T>(a: Set<T>, b: Set<T>) {
  b.forEach((e) => a.delete(e));
}

export function intersect<T>(a: Set<T>, b: Set<T>) {
  a.forEach((e) => {
    if (!b.has(e)) {
      a.delete(e);
    }
  });
}
