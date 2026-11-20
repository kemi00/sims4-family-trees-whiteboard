import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** A localStorage stand-in for node. */
class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('the error log', () => {
  it('keeps a crash for the report after the page reloads', async () => {
    const storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    const first = await import(`./errorLog.ts?first=${Date.now()}`);
    const boom = new TypeError("Cannot read properties of undefined (reading 'x')");
    boom.stack = 'TypeError: boom\n    at Ve (index-abc.js:1:200)\n    at Qe (index-abc.js:1:900)';
    first.logError(boom, { crash: true, build: 'abc1234', componentStack: '\n    at ConnectMenu (x)\n    at WhiteboardStage (y)\n    at App (z)' });
    // A fresh page: the module loads again and reads what the last one kept.
    const second = await import(`./errorLog.ts?second=${Date.now()}`);
    const [e] = second.recentErrors();
    assert.equal(e.message, "TypeError: Cannot read properties of undefined (reading 'x')");
    assert.equal(e.where, 'index-abc.js:1:200 < index-abc.js:1:900');
    assert.equal(e.components, 'ConnectMenu < WhiteboardStage < App');
    assert.equal(e.crash, true);
    assert.equal(e.build, 'abc1234');
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
