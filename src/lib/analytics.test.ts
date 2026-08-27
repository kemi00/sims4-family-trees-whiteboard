import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slug } from './analytics.ts';

describe('slug', () => {
  it('slugifies world names', () => {
    assert.equal(slug('Willow Creek'), 'willow-creek');
    assert.equal(slug('Tartosa'), 'tartosa');
  });

  it('strips diacritics and junk', () => {
    assert.equal(slug('  São  Myshuno!! '), 'sao-myshuno');
  });
});
