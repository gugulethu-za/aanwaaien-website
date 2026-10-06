import test from 'node:test';
import assert from 'node:assert/strict';
import { canStay, isChangeover, isValidArrival } from '../assets/calendar-rules.js';
const fixture = () => new Map(Array.from({length: 15}, (_, i) => [`2026-10-${String(i + 5).padStart(2, '0')}`, 'available']));
test('only Monday and Friday allow arrival and departure', () => {
 const dates = fixture();
 assert.equal(isChangeover('2026-10-05'), true);
 assert.equal(isChangeover('2026-10-09'), true);
 assert.equal(isValidArrival(dates, '2026-10-06'), false);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), true);
 assert.equal(canStay(dates, '2026-10-09', '2026-10-12'), true);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-08'), false);
});
test('blocked or missing nights reject a range', () => {
 const dates = fixture();
 dates.set('2026-10-07', 'unavailable');
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), false);
 dates.delete('2026-10-07');
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), false);
});
test('checkout_available allows arrival but not departure', () => {
 const dates = fixture();
 dates.set('2026-10-05', 'checkout_available');
 assert.equal(isValidArrival(dates, '2026-10-05'), true);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), true);
 dates.set('2026-10-09', 'checkout_available');
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), false);
});
test('turnover allows departure but not arrival or intervening nights', () => {
 const dates = fixture();
 dates.set('2026-10-09', 'turnover');
 assert.equal(isValidArrival(dates, '2026-10-09'), false);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-09'), true);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-12'), false);
});
test('empty, reversed and zero-night stays are rejected', () => {
 const dates = fixture();
 assert.equal(canStay(dates, null, '2026-10-09'), false);
 assert.equal(canStay(dates, '2026-10-09', '2026-10-05'), false);
 assert.equal(canStay(dates, '2026-10-05', '2026-10-05'), false);
});
