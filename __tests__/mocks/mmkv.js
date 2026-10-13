// 内存版 MMKV，仿真 set/getString/getNumber/getBoolean/delete
const sharedStore = new Map();

class FakeMMKV {
  constructor() {
    this.store = sharedStore;
  }
  set(key, value) {
    this.store.set(key, value);
  }
  getString(key) {
    const v = this.store.get(key);
    return typeof v === 'string' ? v : v == null ? undefined : String(v);
  }
  getNumber(key) {
    const v = this.store.get(key);
    return typeof v === 'number' ? v : undefined;
  }
  getBoolean(key) {
    const v = this.store.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }
  delete(key) {
    this.store.delete(key);
  }
  clearAll() {
    this.store.clear();
  }
  contains(key) {
    return this.store.has(key);
  }
}

module.exports = { MMKV: FakeMMKV };
