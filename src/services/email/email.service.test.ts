import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../utils/app-error.util';
import { EmailProvider } from './email.types';

const { resolveProvider } = require('./email.service') as typeof import('./email.service');
const { smtpProvider } = require('./email.service') as typeof import('./email.service');
const { webhookProvider } = require('./email.service') as typeof import('./email.service');

function provider(name: string, isConfigured: () => boolean): EmailProvider {
  return { name, isConfigured, send: async () => ({ provider: name }) };
}

test('resolveProvider picks a single configured provider when none is requested', () => {
  const smtp = provider('smtp', () => true);
  const webhook = provider('webhook', () => false);
  const chosen = resolveProvider([smtp, webhook].filter((p) => p.isConfigured()));
  assert.equal(chosen.name, 'smtp');
});

test('resolveProvider prefers smtp when several providers are configured', () => {
  const smtp = provider('smtp', () => true);
  const webhook = provider('webhook', () => true);
  const chosen = resolveProvider([smtp, webhook]);
  assert.equal(chosen.name, 'smtp');
});

test('resolveProvider honours an explicit requested provider', () => {
  const smtp = provider('smtp', () => true);
  const webhook = provider('webhook', () => true);
  const chosen = resolveProvider([smtp, webhook], 'webhook');
  assert.equal(chosen.name, 'webhook');
});

test('resolveProvider throws 503 when nothing is configured', () => {
  assert.throws(
    () => resolveProvider([], undefined),
    (error: unknown) => error instanceof AppError && error.statusCode === 503 && error.message === 'Email delivery is not configured.',
  );
});

test('resolveProvider throws 500 for an unknown provider name', () => {
  const smtp = provider('smtp', () => true);
  assert.throws(
    () => resolveProvider([smtp], 'nespresso'),
    (error: unknown) => error instanceof AppError && error.statusCode === 500,
  );
});

test('smtp and webhook providers export their names', () => {
  assert.equal(smtpProvider.name, 'smtp');
  assert.equal(webhookProvider.name, 'webhook');
});