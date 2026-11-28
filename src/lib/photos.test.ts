import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardPhoto, squareCrop } from './photos.ts';

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
