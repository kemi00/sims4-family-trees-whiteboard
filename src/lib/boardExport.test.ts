import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportScale, pdfOfJpeg, pdfOfPages, worldRects } from './boardExport.ts';

describe('the whole tree as a file', () => {
  it('keeps the canvas within what browsers draw', () => {
    assert.equal(exportScale(1000, 800), 2);
    const s = exportScale(30000, 9000);
    assert.ok(30000 * s <= 16000 && 30000 * s * 9000 * s <= 120_000_000);
  });

  it('writes a one-page PDF with the picture and a link, its cross-references pointing at each object', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const blob = pdfOfJpeg(jpeg, 400, 300, { x: 300, y: 260, w: 80, h: 30, url: 'https://example.com/a(b)' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.endsWith('%%EOF\n'));
    assert.match(text, /\/MediaBox \[0 0 300 225\]/);
    assert.match(text, /\/URI \(https:\/\/example\.com\/a\\\(b\\\)\)/);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    assert.ok(text.slice(startxref).startsWith('xref'));
    const rows = text.slice(startxref).split('\n').slice(3, 9);
    rows.forEach((row, i) => {
      const off = Number(row.slice(0, 10));
      assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${off}`);
    });
  });
});

describe('a page for each world', () => {
  it('frames each world around its cards, with room for the tags, in the Legend’s order', () => {
    const nodes = [
      { world: 'B', x: 0, y: 0, w: 200, h: 100 },
      { world: 'A', x: 1000, y: 500, w: 200, h: 100 },
      { world: 'A', x: 1400, y: 900, w: 200, h: 100 },
      { world: 'A', x: 0, y: 0, w: 0, h: 0 },
    ];
    assert.deepEqual(worldRects(nodes, ['A', 'B']), [
      { world: 'A', rect: { x: 860, y: 280, w: 880, h: 840 } },
      { world: 'B', rect: { x: -140, y: -220, w: 480, h: 440 } },
    ]);
  });

  it('puts each picture on a page of its own', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = pdfOfPages([{ jpeg, w: 100, h: 100 }, { jpeg, w: 200, h: 50 }]);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
    assert.match(text, /\/Count 2/);
    assert.equal(text.match(/\/Type \/Page /g)?.length, 2);
  });
});
