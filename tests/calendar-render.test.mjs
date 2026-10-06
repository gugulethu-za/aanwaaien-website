import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {calendar,freeDates} from './helpers/calendar-dom.mjs';
const setup=async(t,options)=>{const ctx=await calendar(freeDates(),options);t.after(ctx.restore);return ctx;};
const mouse={pointerType:'mouse'};

test('only selection has a decorative full-height band; booked connectors remain deleted',async()=>{
 const css=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../assets/availability-calendar.js',import.meta.url),'utf8');
 assert.match(css,/\.availability-cell\.is-range:before\{[^}]*inset:6% 0;[^}]*pointer-events:none/);
 assert.doesNotMatch(css,/has-booked|has-selected|calendar-booked-selected|is-in-booked/);
 assert.doesNotMatch(js,/calendar-bands|bookedEdge|has-booked|has-selected|is-in-booked-stay/);
 await assert.rejects(access(new URL('../assets/calendar-bands.js',import.meta.url)));
 assert.match(css,/--calendar-booked:#d9b7ac/);
 assert.match(css,/--calendar-stay:#dce2cd/);
 assert.match(css,/is-stay-interior:not\(\.is-unavailable\)\{background:transparent/);
 assert.match(css,/is-preview-end:not\(\.is-unavailable\)\{outline:2px solid var\(--riet\)/);
 assert.match(css,/availability-summary \.availability-selection\{min-height:7em\}/);
});
test('valid hover previews circles and summary without committing or replacing buttons',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-16').click();
 const target=ctx.button('2026-10-19'),interior=ctx.button('2026-10-17');
 target.emit('pointerenter',mouse);
 assert.equal(ctx.button('2026-10-17'),interior);
 assert.equal(ctx.button('2026-10-16').classList.contains('is-selected'),true);
 assert.equal(target.classList.contains('is-preview-end'),true);
 for(const date of ['2026-10-17','2026-10-18'])assert.equal(ctx.button(date).classList.contains('is-stay-interior'),true);
 assert.match(ctx.summary(),/Vertrek: 19 oktober 2026.*3 nachten/);
 assert.equal(ctx.controls.get('mail').disabled,true);
 assert.equal(target.getAttribute('aria-pressed'),null);
 assert.equal(document.activeElement,ctx.button('2026-10-16'));
 target.emit('pointerleave');
 assert.equal(target.classList.contains('is-preview-end'),false);
 assert.equal(interior.classList.contains('is-stay-interior'),false);
 assert.match(ctx.summary(),/Kies een vertrekdag/);
});
test('invalid weekday, reverse date, blocked range and departure status never preview',async t=>{
 const dates=freeDates();dates.find(item=>item.date==='2026-10-22').status='unavailable';dates.find(item=>item.date==='2026-10-19').status='checkout_available';
 const ctx=await calendar(dates);t.after(ctx.restore);ctx.button('2026-10-16').click();
 for(const date of ['2026-10-17','2026-10-12','2026-10-19','2026-10-23']){
  ctx.button(date).emit('pointerenter',mouse);
  assert.equal(ctx.button(date).classList.contains('is-preview-end'),false);
  assert.match(ctx.summary(),/Kies een vertrekdag/);
 }
 assert.equal(ctx.note('2026-10-22'),'Bezet');
 assert.equal(ctx.note('2026-10-19'),'Vertrekdag, aankomst mogelijk vanaf de middag');
});
test('keyboard focus previews valid departure, moves without focus loss and rejects invalid dates',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-16').click();ctx.button('2026-10-19').focus();
 assert.equal(document.activeElement,ctx.button('2026-10-19'));
 assert.equal(ctx.button('2026-10-19').classList.contains('is-preview-end'),true);
 assert.match(ctx.summary(),/3 nachten/);
 ctx.months.emit('keydown',{target:ctx.button('2026-10-19'),key:'ArrowRight',preventDefault(){}});
 assert.equal(document.activeElement,ctx.button('2026-10-20'));
 assert.match(ctx.summary(),/Kies een vertrekdag/);
});
test('committed selection persists after hover and focus; clearing resets the band and summary',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-16').click();ctx.button('2026-10-19').emit('pointerenter',mouse);ctx.button('2026-10-19').click();
 ctx.button('2026-10-19').emit('pointerleave');ctx.button('2026-10-23').focus();
 for(const date of ['2026-10-16','2026-10-19'])assert.equal(ctx.button(date).classList.contains('is-selected'),true);
 for(const date of ['2026-10-17','2026-10-18'])assert.equal(ctx.button(date).classList.contains('is-stay-interior'),true);
 assert.equal(ctx.button('2026-10-23').classList.contains('is-preview-end'),false);
 assert.equal(ctx.button('2026-10-20').classList.contains('is-stay-interior'),false);
 assert.equal(ctx.controls.get('mail').disabled,false);
 const selectionBeforeMail=ctx.summary();
 ctx.controls.get('mail').click();
 assert.equal(ctx.bookingUrl(),undefined);
 assert.equal(ctx.mailtoClicks().length,1);
 assert.equal(ctx.mailtoClicks()[0].hidden,true);
 assert.equal(ctx.mailtoClicks()[0].connected,true);
 assert.equal(ctx.body.children.length,0);
 const request=new URL(ctx.mailtoClicks()[0].href);
 assert.equal(request.pathname,ctx.recipient);
 assert.match(request.searchParams.get('subject'),/16 oktober 2026.*19 oktober 2026.*3 nachten/);
 assert.match(request.searchParams.get('body'),/Aankomst: 16 oktober 2026/);
 assert.match(request.searchParams.get('body'),/Vertrek: 19 oktober 2026/);
 assert.match(request.searchParams.get('body'),/Aantal nachten: 3/);
 assert.equal(ctx.summary(),selectionBeforeMail);
 ctx.clear();
 for(const button of ctx.months.querySelectorAll('button[data-date]'))for(const name of ['is-selected','is-preview-end','is-stay-interior'])assert.equal(button.classList.contains(name),false);
 assert.equal(ctx.controls.get('mail').disabled,true);
 assert.equal(ctx.summary(),'Selecteer een beschikbare aankomstdag');
});
test('touch arrival/departure taps ignore pointer hover and focus preview',async t=>{
 const ctx=await setup(t,{mobile:true,hover:false});
 ctx.months.emit('pointerdown',{pointerType:'touch'});ctx.button('2026-10-16').click();
 ctx.button('2026-10-19').emit('pointerenter',{pointerType:'touch'});ctx.button('2026-10-19').focus();
 assert.match(ctx.summary(),/Kies een vertrekdag/);
 assert.equal(ctx.button('2026-10-19').classList.contains('is-preview-end'),false);
 ctx.button('2026-10-19').click();assert.match(ctx.summary(),/3 nachten/);assert.equal(ctx.controls.get('mail').disabled,false);assert.equal(ctx.button('2026-10-17').parentElement.classList.contains('is-range'),true);
});
test('clear also removes an uncommitted preview',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-16').click();ctx.button('2026-10-19').emit('pointerenter',mouse);ctx.clear();
 assert.equal(ctx.button('2026-10-19').classList.contains('is-preview-end'),false);assert.equal(ctx.button('2026-10-17').classList.contains('is-stay-interior'),false);
});
test('keyboard input restores preview after touch input',async t=>{
 const ctx=await setup(t,{mobile:true,hover:false});ctx.months.emit('pointerdown',{pointerType:'touch'});ctx.button('2026-10-16').click();ctx.root.emit('keydown');ctx.button('2026-10-19').focus();assert.match(ctx.summary(),/3 nachten/);
});
test('preview and committed bands survive week and month boundaries with mobile swipe',async t=>{
 const ctx=await setup(t,{mobile:true});ctx.button('2026-10-30').click();
 ctx.months.emit('touchstart',{changedTouches:[{clientX:280,clientY:200}]});ctx.months.emit('touchend',{changedTouches:[{clientX:80,clientY:205}]});
 assert.equal(ctx.months.children.length,1);ctx.button('2026-11-02').emit('pointerenter',mouse);assert.match(ctx.summary(),/3 nachten/);assert.equal(ctx.button('2026-11-01').classList.contains('is-stay-interior'),true);
 ctx.button('2026-11-02').click();ctx.controls.get('previous').click();assert.equal(ctx.button('2026-10-31').classList.contains('is-stay-interior'),true);assert.equal(ctx.button('2026-10-30').classList.contains('is-selected'),true);
});

test('departure-only Friday previews and commits without changing its availability',async t=>{
 const dates=freeDates();dates.find(item=>item.date==='2026-10-12').status='checkout_available';dates.find(item=>item.date==='2026-10-16').status='turnover';
 const ctx=await calendar(dates);t.after(ctx.restore);ctx.button('2026-10-12').click();ctx.button('2026-10-16').emit('pointerenter',{pointerType:'mouse'});
 assert.equal(ctx.button('2026-10-16').classList.contains('is-preview-end'),true);assert.match(ctx.summary(),/4 nachten/);ctx.button('2026-10-16').click();assert.equal(ctx.button('2026-10-16').classList.contains('is-selected'),true);
 const css=await readFile(new URL('../index.html',import.meta.url),'utf8');
 for(const rule of css.matchAll(/([^{}]+)\{([^{}]*linear-gradient[^{}]*)\}/g))for(const selector of rule[1].split(','))if(selector.includes('.availability-day')){
  assert.ok(selector.includes(':not(.is-selected)'));assert.ok(selector.includes(':not(.is-preview-end)'));assert.ok(selector.includes(':not(.is-stay-interior)'));
 }
});

test('moving from a valid hovered departure to an invalid date clears the preview',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-16').click();ctx.button('2026-10-19').emit('pointerenter',{pointerType:'mouse'});ctx.button('2026-10-17').emit('pointerenter',{pointerType:'mouse'});
 assert.equal(ctx.button('2026-10-19').classList.contains('is-preview-end'),false);assert.equal(ctx.button('2026-10-18').classList.contains('is-stay-interior'),false);assert.match(ctx.summary(),/Kies een vertrekdag/);
});

test('midweek preview and selection form one band with half-width endpoint cells',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-19').click();ctx.button('2026-10-23').emit('pointerenter',{pointerType:'mouse'});
 for(const date of ['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'])assert.equal(ctx.button(date).parentElement.classList.contains('is-range'),true);
 assert.equal(ctx.button('2026-10-19').parentElement.classList.contains('is-range-start'),true);
 assert.equal(ctx.button('2026-10-23').parentElement.classList.contains('is-range-end'),true);
 for(const date of ['2026-10-20','2026-10-21','2026-10-22']){
  assert.equal(ctx.button(date).classList.contains('is-stay-interior'),true);
  assert.equal(ctx.button(date).parentElement.classList.contains('is-range-left'),false);
  assert.equal(ctx.button(date).parentElement.classList.contains('is-range-right'),false);
 }
 assert.equal(ctx.button('2026-10-24').parentElement.classList.contains('is-range'),false);
 ctx.button('2026-10-23').click();assert.equal(ctx.button('2026-10-21').parentElement.classList.contains('is-range'),true);
 ctx.clear();for(const button of ctx.months.querySelectorAll('button[data-date]'))for(const name of ['is-range','is-range-start','is-range-end','is-range-left','is-range-right'])assert.equal(button.parentElement.classList.contains(name),false);
});
test('week-row and panel continuations are rounded without inventing endpoints',async t=>{
 const ctx=await setup(t);ctx.button('2026-10-30').click();ctx.button('2026-11-06').emit('pointerenter',{pointerType:'mouse'});
 for(const date of ['2026-10-31','2026-11-01','2026-11-02'])assert.equal(ctx.button(date).parentElement.classList.contains('is-range'),true);
 assert.equal(ctx.button('2026-10-31').parentElement.classList.contains('is-range-right'),true);
 assert.equal(ctx.button('2026-11-01').parentElement.classList.contains('is-range-left'),true);
 assert.equal(ctx.button('2026-11-01').parentElement.classList.contains('is-range-right'),true);
 assert.equal(ctx.button('2026-11-02').parentElement.classList.contains('is-range-left'),true);
 assert.equal(ctx.button('2026-11-02').parentElement.classList.contains('is-range-end'),false);
 ctx.button('2026-11-06').click();assert.equal(ctx.button('2026-11-01').parentElement.classList.contains('is-range'),true);
});
