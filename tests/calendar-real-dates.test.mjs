import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calendar} from './helpers/calendar-dom.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/availability-2026-10-06.json',import.meta.url),'utf8'));
const setup=async t=>{const ctx=await calendar(fixture.dates);t.after(ctx.restore);return ctx;};
test('real booked weekdays stay solid red with notes and unchanged clickability',async t=>{
 const ctx=await setup(t);for(const date of ['2026-10-09','2026-10-12','2026-10-26','2026-10-30','2026-11-02','2026-11-06']){
  assert.equal(ctx.button(date).classList.contains('is-unavailable'),true);assert.equal(ctx.button(date).classList.contains('is-changeover'),false);assert.equal(ctx.note(date),'Bezet');assert.equal(ctx.button(date).parentElement.classList.contains('is-range'),false);assert.equal(ctx.button(date).getAttribute('aria-disabled'),'true');
 }
});
test('free Monday stays available; free Tue-Thu stay untinted outside selection',async t=>{
 const ctx=await setup(t);assert.equal(ctx.note('2026-11-09'),'Beschikbaar');assert.equal(ctx.button('2026-11-09').getAttribute('aria-disabled'),'false');
 for(const date of ['2026-11-03','2026-11-04','2026-11-05']){assert.equal(ctx.button(date).classList.contains('is-unavailable'),false);assert.equal(ctx.button(date).classList.contains('is-stay-interior'),false);}
});
test('real checkout day retains split and note until chosen as an olive endpoint',async t=>{
 const ctx=await setup(t);assert.equal(ctx.button('2026-11-16').classList.contains('is-changeover'),true);assert.equal(ctx.note('2026-11-16'),'Vertrekdag, aankomst mogelijk vanaf de middag');ctx.button('2026-11-16').click();assert.equal(ctx.button('2026-11-16').classList.contains('is-selected'),true);ctx.clear();assert.equal(ctx.button('2026-11-16').classList.contains('is-selected'),false);
});
for(const [start,end,inside,after] of [['2026-11-16','2026-11-20',['2026-11-17','2026-11-18','2026-11-19'],'2026-11-21'],['2026-11-20','2026-11-23',['2026-11-21','2026-11-22'],'2026-11-24']]){
 test(`real selected ${start} to ${end} bands only its selected dates`,async t=>{
  const ctx=await setup(t);ctx.button(start).click();ctx.button(end).emit('pointerenter',{pointerType:'mouse'});
  assert.equal(ctx.button(end).classList.contains('is-preview-end'),true);assert.equal(ctx.controls.get('mail').disabled,true);
  for(const date of inside)assert.equal(ctx.button(date).classList.contains('is-stay-interior'),true);
  ctx.button(end).click();assert.equal(ctx.button(end).classList.contains('is-selected'),true);assert.equal(ctx.button(end).classList.contains('is-preview-end'),false);assert.equal(ctx.button(after).classList.contains('is-stay-interior'),false);
 });
}
test('16 November is not a permitted departure; a preview never bypasses rules',async t=>{
 const ctx=await setup(t);ctx.button('2026-11-09').click();ctx.button('2026-11-16').emit('pointerenter',{pointerType:'mouse'});assert.equal(ctx.button('2026-11-16').classList.contains('is-preview-end'),false);ctx.button('2026-11-16').click();assert.match(ctx.summary(),/Kies een vertrekdag/);assert.equal(ctx.controls.get('mail').disabled,true);
});
