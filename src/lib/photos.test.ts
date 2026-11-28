import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardPhoto, photosForFile, photosFromFile, squareCrop } from './photos.ts';

describe('sim photos', () => {
  it('cuts a square from the middle of a wide picture, and near the top of a tall one', () => {
    assert.deepEqual(squareCrop(400, 200), { x: 100, y: 0, side: 200 });
    assert.deepEqual(squareCrop(300, 400), { x: 0, y: 20, side: 300 });
    assert.deepEqual(squareCrop(100, 100), { x: 0, y: 0, side: 100 });
  });

  it('shows a photo, a silhouette for infants to teens when asked, and nothing for pets or with photos off', () => {
    const urls = new Map([['a', 'blob:a'], ['k', 'blob:k']]);
    const on = { photos: true, silhouettes: false };
    assert.equal(cardPhoto({ id: 'a', age: 'Adult' }, on, urls), 'blob:a');
    assert.equal(cardPhoto({ id: 'k', age: 'Teen' }, on, urls), 'blob:k');
    assert.equal(cardPhoto({ id: 'k', age: 'Teen' }, { ...on, silhouettes: true }, urls), 'silhouette');
    assert.equal(cardPhoto({ id: 'x', age: 'Child' }, { ...on, silhouettes: true }, urls), 'silhouette');
    assert.equal(cardPhoto({ id: 'a', age: 'Young Adult' }, { ...on, silhouettes: true }, urls), 'blob:a');
    assert.equal(cardPhoto({ id: 'a', age: 'Adult' }, { photos: false, silhouettes: true }, urls), undefined);
    assert.equal(cardPhoto({ id: 'a', age: 'Adult', species: 'Cat' }, on, urls), undefined);
    assert.equal(cardPhoto({ id: 'none', age: 'Adult' }, on, urls), undefined);
  });
});

describe('photos in a board file', () => {
  it('takes back only small pictures', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const got = await photosFromFile({ a: png, b: 'javascript:alert(1)', c: 42, d: `data:image/png;base64,${'A'.repeat(500_000)}` });
    assert.deepEqual([...got.keys()], ['a']);
    assert.equal(got.get('a')!.type, 'image/png');
    assert.equal((await photosFromFile(null)).size, 0);
  });

  it('writes the photos of the board’s own cards', async () => {
    const url = 'data:image/webp;base64,UklGRg==';
    const out = await photosForFile(new Map([['a', url], ['gone', url]]), new Set(['a']));
    assert.deepEqual(Object.keys(out), ['a']);
    assert.match(out.a!, /^data:image\/webp;base64,/);
  });
});
