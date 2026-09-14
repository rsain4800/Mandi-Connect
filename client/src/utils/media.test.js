import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaUrl, DEFAULT_CATEGORY_IMAGE } from './media.js';

test('resolveMediaUrl converts relative upload paths to backend URLs', () => {
  const url = resolveMediaUrl('/uploads/categories/vegetables.jpg');
  assert.equal(url, 'http://localhost:5000/uploads/categories/vegetables.jpg');
});

test('resolveMediaUrl leaves absolute URLs unchanged', () => {
  const url = 'https://cdn.example.com/image.jpg';
  assert.equal(resolveMediaUrl(url), url);
});

test('DEFAULT_CATEGORY_IMAGE is defined', () => {
  assert.ok(DEFAULT_CATEGORY_IMAGE.length > 0);
});
