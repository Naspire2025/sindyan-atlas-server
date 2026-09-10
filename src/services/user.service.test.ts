import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalePreference } from './user.service';

test('parseLocalePreference accepts supported locales and reset', () => {
  assert.equal(parseLocalePreference({ locale: 'en' }), 'en');
  assert.equal(parseLocalePreference({ locale: 'ar' }), 'ar');
  assert.equal(parseLocalePreference({ locale: null }), null);
});

test('parseLocalePreference rejects malformed or unsupported payloads', () => {
  assert.throws(() => parseLocalePreference(null), { message: 'Request body must be an object.' });
  assert.throws(() => parseLocalePreference({}), { message: 'locale is the only supported preference.' });
  assert.throws(() => parseLocalePreference({ locale: 'fr' }), { message: 'locale must be en, ar, or null.' });
  assert.throws(() => parseLocalePreference({ locale: 'en', role: 'admin' }), { message: 'locale is the only supported preference.' });
});
