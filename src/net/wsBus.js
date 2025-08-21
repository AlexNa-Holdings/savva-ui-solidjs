// File: src/net/wsBus.js
// Lightweight event bus for WS alerts (type-based) with a small replay buffer.

export function createWsBus({ replay = 0 } = {}) {
  const map = new Map();          // type -> Set<fn>
  const any = new Set();          // watchers of all events
  const buf = [];                 // [{type, payload, ts}]
  const max = Math.max(0, replay | 0);

  function on(type, fn) {
    if (!type || type === "*") { any.add(fn); return () => any.delete(fn); }
    let set = map.get(type); if (!set) { set = new Set(); map.set(type, set); }
    set.add(fn);
    if (max > 0) {
      for (let i = 0; i < buf.length; i++) if (buf[i].type === type) try { fn(buf[i].payload); } catch {}
    }
    return () => set.delete(fn);
  }

  function off(type, fn) {
    if (!type || type === "*") { any.delete(fn); return; }
    const set = map.get(type); if (set) set.delete(fn);
  }

  function emit(type, payload) {
    if (max > 0) {
      buf.push({ type, payload, ts: Date.now() });
      if (buf.length > max) buf.splice(0, buf.length - max);
    }
    const set = map.get(type);
    if (set) for (const fn of Array.from(set)) try { fn(payload); } catch {}
    for (const fn of Array.from(any)) try { fn({ type, payload }); } catch {}
  }

  function clear() { map.clear(); any.clear(); buf.length = 0; }

  return { on, off, emit, clear };
}
