import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pageTranslation } from './translateGuard.ts';

/** Just enough of a document for pageTranslation. */
function doc(lang: string, classes: string[] = [], edge = false): Document {
  return {
    documentElement: { getAttribute: () => lang, classList: { contains: (c: string) => classes.includes(c) } },
    querySelector: () => (edge ? {} : null),
  } as unknown as Document;
}

describe('pageTranslation', () => {
  it('is null for the page as written, in English', () => {
    assert.equal(pageTranslation(doc('en')), null);
    assert.equal(pageTranslation(doc('en-GB')), null);
  });

  it('names the language Chrome translated it to', () => {
    assert.equal(pageTranslation(doc('uk', ['translated-ltr'])), 'uk');
    assert.equal(pageTranslation(doc('ar', ['translated-rtl'])), 'ar');
  });

  it('notices a translation that left the language alone', () => {
    assert.equal(pageTranslation(doc('en', ['translated-ltr'])), 'another language');
    assert.equal(pageTranslation(doc('en', [], true)), 'another language');
  });

  it('is null without a page', () => {
    assert.equal(pageTranslation(undefined), null);
  });
});
