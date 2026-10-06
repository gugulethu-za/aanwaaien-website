import assert from 'node:assert/strict';
let counter = 0;
class Element {
 constructor(){this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';}
 get classList(){return {
  contains:name=>this.className.split(' ').includes(name),
  add:(...names)=>{for(const name of names)if(!this.className.split(' ').includes(name))this.className+=` ${name}`;},
  toggle:(name,on)=>{const names=this.className.split(' ').filter(Boolean).filter(value=>value!==name);if(on)names.push(name);this.className=names.join(' ');}
 };}
 append(...children){for(const child of children)child.parentElement=this;this.children.push(...children);}
 prepend(...children){for(const child of children)child.parentElement=this;this.children.unshift(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this.attributes[name]=value;}
 getAttribute(name){return this.attributes[name]??null;}
 removeAttribute(name){delete this.attributes[name];}
 addEventListener(name,listener){this.listeners[name]=listener;}
 emit(name,event={}){this.listeners[name]?.(event);}
 click(){if(!this.disabled){this.focus();this.emit('click');}}
 focus(){if(document.activeElement===this)return;document.activeElement?.emit('blur');document.activeElement=this;this.emit('focus');}
 querySelectorAll(selector){
  const nodes=[];
  for(const child of this.children){if(selector==='button[data-date]'&&child.dataset.date)nodes.push(child);nodes.push(...child.querySelectorAll(selector));}
  return nodes;
 }
 querySelector(selector){const date=selector.match(/data-date="([^"]+)"/)?.[1];return this.querySelectorAll('button[data-date]').find(child=>child.dataset.date===date)??null;}
}
export async function calendar(dates,{mobile=false,hover=true}={}){
 const originals={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const controls=new Map(['content','loading','error','months','selection','mail','previous','next','clear'].map(name=>[name,new Element()]));
 const root=new Element();root.querySelector=selector=>controls.get(selector.match(/data-calendar-([^\]]+)/)?.[1]);
 const media={matches:mobile,addEventListener(name,listener){this.listener=listener;}};
 const hoverMedia={matches:hover};let bookingUrl;
 globalThis.document={querySelector:()=>root,createElement:()=>new Element(),activeElement:null};
 globalThis.window={matchMedia:query=>query==='(hover: hover)'?hoverMedia:media,location:{origin:'http://localhost',assign:url=>{bookingUrl=url;}}};
 globalThis.fetch=async url=>{assert.equal(url,'/api/availability');return {ok:true,json:async()=>({dates})};};
 await import(`../../assets/availability-calendar.js?test=${++counter}`);
 const months=controls.get('months');
 const button=date=>months.querySelector(`[data-date="${date}"]`);
 return {root,months,media,hoverMedia,controls,button,
  note:date=>months.children.flatMap(month=>month.children[0].children).find(cell=>cell.children[0]?.dataset.date===date)?.children.find(child=>child.className==='availability-note')?.textContent,
  summary:()=>controls.get('selection').textContent,
  bookingUrl:()=>bookingUrl,
  clear:()=>controls.get('clear').click(),
  restore:()=>Object.assign(globalThis,originals)
 };
}
export function freeDates(start='2026-10-01',end='2026-11-30'){
 const dates=[];for(let date=new Date(`${start}T00:00:00Z`);date.toISOString().slice(0,10)<=end;date.setUTCDate(date.getUTCDate()+1))dates.push({date:date.toISOString().slice(0,10),status:'available'});return dates;
}
