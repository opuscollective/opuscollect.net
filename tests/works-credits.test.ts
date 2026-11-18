import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditTrust, TRUST_LABEL } from '../src/lib/credits.ts';
import { PRODUCTS } from '../src/data/products.ts';

test('credit trust: self, confirmed, pending, listed', () => {
  assert.equal(creditTrust({ status: 'confirmed', userId: 'a', createdBy: 'a' }), 'self');
  assert.equal(creditTrust({ status: 'confirmed', userId: 'b', createdBy: 'a' }), 'confirmed');
  assert.equal(creditTrust({ status: 'pending', userId: 'b', createdBy: 'a' }), 'pending');
  assert.equal(creditTrust({ status: 'unlinked', userId: null, createdBy: 'a' }), 'listed');
  assert.ok(!Object.values(TRUST_LABEL).some((l) => /verified/i.test(l)), 'never called verified');
});

test('product nav: every destination, only real routes', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  assert.equal(Object.keys(PRODUCTS).length, 10);
  for (const p of Object.values(PRODUCTS)) for (const i of p.items) {
    const path = i.href.split('?')[0]!.replace(/^\//, '');
    const ok = existsSync(`src/pages/${path}.astro`) || existsSync(`src/pages/${path}/index.astro`);
    assert.ok(ok, `${p.key}: ${i.href} has a page`);
  }
  void readdirSync;
});
