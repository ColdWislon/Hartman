// Squarified treemap layout. data: [{value, ...}] → [{d, x, y, w, h}]
export function squarify(data, X, Y, W, H) {
  data = data.filter((d) => d.value > 0).slice().sort((a, b) => b.value - a.value);
  const nodes = [];
  if (data.length === 0 || W <= 0 || H <= 0) return nodes;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const scale = (W * H) / total;
  const items = data.map((d) => ({ d, a: d.value * scale }));
  let x = X, y = Y, w = W, h = H;
  const worst = (row, len) => {
    let s = 0, mn = Infinity, mx = 0;
    for (const r of row) {
      s += r.a;
      if (r.a < mn) mn = r.a;
      if (r.a > mx) mx = r.a;
    }
    const s2 = s * s, l2 = len * len;
    return Math.max((l2 * mx) / s2, s2 / (l2 * mn));
  };
  const place = (row) => {
    const s = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      for (const r of row) {
        const rh = r.a / rw;
        nodes.push({ d: r.d, x, y: yy, w: rw, h: rh });
        yy += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const r of row) {
        const rw = r.a / rh;
        nodes.push({ d: r.d, x: xx, y, w: rw, h: rh });
        xx += rw;
      }
      y += rh;
      h -= rh;
    }
  };
  let row = [];
  for (let i = 0; i < items.length; i++) {
    const len = Math.min(w, h) || 1;
    const it = items[i];
    if (row.length === 0) {
      row = [it];
      continue;
    }
    if (worst(row, len) >= worst(row.concat(it), len)) row.push(it);
    else {
      place(row);
      row = [it];
    }
  }
  if (row.length) place(row);
  return nodes;
}
