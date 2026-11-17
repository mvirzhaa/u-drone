// Penyimpanan lokal yang aman (localStorage bisa tidak tersedia di beberapa konteks).
const mem = new Map();
export const store = {
  get(k, def) {
    try { const v = localStorage.getItem('udrone:' + k); return v === null ? def : JSON.parse(v); }
    catch { return mem.has(k) ? mem.get(k) : def; }
  },
  set(k, v) {
    try { localStorage.setItem('udrone:' + k, JSON.stringify(v)); }
    catch { mem.set(k, v); }
  },
  del(k) {
    try { localStorage.removeItem('udrone:' + k); } catch { mem.delete(k); }
  },
};
