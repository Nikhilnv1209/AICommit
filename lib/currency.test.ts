import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  currencyFractionDigits,
  currencyMultiplier,
  formatAmountFromMinorUnits,
  formatCreditPrice,
  normalizeCurrency,
} from './currency'

test('normalizes currency codes and rejects junk', () => {
  assert.equal(normalizeCurrency('INR'), 'inr')
  assert.equal(normalizeCurrency(' usd '), 'usd')
  assert.equal(normalizeCurrency('rupees'), 'usd')
  assert.equal(normalizeCurrency(undefined), 'usd')
})

test('knows the minor-unit exponent per currency', () => {
  assert.equal(currencyFractionDigits('usd'), 2)
  assert.equal(currencyFractionDigits('jpy'), 0)
  assert.equal(currencyFractionDigits('kwd'), 3)
  assert.equal(currencyMultiplier('usd'), 100)
  assert.equal(currencyMultiplier('jpy'), 1)
})

test('formats amounts from the smallest unit', () => {
  assert.equal(formatAmountFromMinorUnits(100, 'usd', 'en-US'), '$1.00')
  assert.equal(formatAmountFromMinorUnits(100, 'jpy', 'en-US'), '¥100')
  assert.equal(formatAmountFromMinorUnits(2599, 'usd', 'en-US'), '$25.99')
  assert.ok(formatAmountFromMinorUnits(100, 'inr', 'en-IN')?.includes('1.00'))
  assert.equal(formatAmountFromMinorUnits(null, 'usd'), null)
})

test('formats credit pack prices in the configured currency', () => {
  assert.equal(formatCreditPrice(50, 'usd', 50, 'en-US'), '$1.00')
  assert.equal(formatCreditPrice(100, 'usd', 50, 'en-US'), '$2.00')
  assert.equal(formatCreditPrice(500, 'usd', 50, 'en-US'), '$10.00')
})
