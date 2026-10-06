import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRequestMailto} from '../assets/request-email.js';
import {calendar,freeDates} from './helpers/calendar-dom.mjs';
const pretty=date=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
test('Dutch mailto subject and body include both dates, nights and availability question',()=>{
 const url=new URL(buildRequestMailto({arrival:'2026-11-16',departure:'2026-11-20',pretty,recipient:'requests@example.org'}));
 assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'requests@example.org');
 assert.equal(url.searchParams.get('subject'),'Aanvraag Aanwaaien: 16 november 2026 t/m 20 november 2026 (4 nachten)');
 assert.equal(url.searchParams.get('body'),'Hallo,\n\nIs Aanwaaien beschikbaar voor deze periode?\n\nAankomst: 16 november 2026\nVertrek: 20 november 2026\nAantal nachten: 4\n\nMet vriendelijke groet,');
});
test('night count crosses month boundaries and singular night is Dutch',()=>{
 const result=new URL(buildRequestMailto({arrival:'2026-10-30',departure:'2026-11-02',pretty,recipient:'requests@example.org'}));assert.match(result.searchParams.get('subject'),/3 nachten/);
 const single=new URL(buildRequestMailto({arrival:'2026-11-16',departure:'2026-11-17',pretty,recipient:'requests@example.org'}));assert.match(single.searchParams.get('subject'),/1 nacht\)/);
});
test('incomplete email details or reversed dates reject',()=>{
 assert.throws(()=>buildRequestMailto({arrival:'2026-11-16',departure:'2026-11-20',pretty}));
 assert.throws(()=>buildRequestMailto({arrival:'2026-11-20',departure:'2026-11-16',pretty,recipient:'requests@example.org'}));
});
test('visible address has one source and actions remain outside hidden calendar content',async t=>{
 const ctx=await calendar(freeDates());t.after(ctx.restore);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/data-calendar-mail[^>]*>Email ons voor een aanvraag<\/button>/);
 assert.equal(html.split(ctx.recipient).length-1,1);
 assert.equal(ctx.controls.get('email').href,`mailto:${ctx.recipient}`);
 const content=html.indexOf('<div data-calendar-content hidden>');
 const meta=html.indexOf('<div class="availability-meta">',content);
 const open=(html.slice(content,meta).match(/<div(?: |>|\n)/g)||[]).length;
 const closed=(html.slice(content,meta).match(/<\/div>/g)||[]).length;
 assert.equal(open,closed);
 assert.ok(html.indexOf('data-calendar-email',meta)>meta);
});
test('button remains disabled for arrival and preview; only committed dates launch email',async t=>{
 const ctx=await calendar(freeDates());t.after(ctx.restore);
 ctx.controls.get('mail').emit('click');assert.equal(ctx.mailtoClicks().length,0);
 ctx.button('2026-10-16').click();ctx.button('2026-10-19').emit('pointerenter',{pointerType:'mouse'});
 assert.equal(ctx.controls.get('mail').disabled,true);ctx.controls.get('mail').emit('click');assert.equal(ctx.mailtoClicks().length,0);
 ctx.button('2026-10-19').click();ctx.controls.get('mail').click();assert.equal(ctx.mailtoClicks().length,1);
 ctx.clear();assert.equal(ctx.controls.get('mail').disabled,true);assert.equal(ctx.controls.get('email').textContent,ctx.recipient);assert.equal(ctx.controls.get('email').href,`mailto:${ctx.recipient}`);
});
