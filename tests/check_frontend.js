'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'source', 'static', 'app.js'), 'utf8');
const jsonOrder = source.indexOf('response.status===401');
const parseOrder = source.indexOf('response.json()');
assert.ok(jsonOrder > 0 && parseOrder > jsonOrder, '401 redirect must happen before response.json()');
assert.ok(source.includes("'/login?next='"), 'expired sessions must return to the login page with a next target');
assert.ok(source.includes('newClaudePublicSafe'), 'new discussions need an explicit Claude opt-in');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.id = '';
    this.href = '';
    this.rel = '';
    this.target = '';
    this.type = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this[name] = value; }
}
function walk(node, out = []) {
  out.push(node);
  for (const child of node.children || []) walk(child, out);
  return out;
}

const location = {pathname: '/', search: '', href: 'https://command.example/'};
const replaced = [];
const context = {
  console,
  URL,
  URLSearchParams,
  TextEncoder,
  location,
  history: {replaceState(_s, _t, next) { location.pathname = next.split('?')[0]; location.search = next.includes('?') ? next.slice(next.indexOf('?')) : ''; }},
  sessionStorage: (() => { const bag = new Map(); return {getItem:k=>bag.get(k)||null, setItem:(k,v)=>bag.set(k,v), removeItem:k=>bag.delete(k)}; })(),
  localStorage: {getItem:()=>null, setItem(){}, removeItem(){}},
  document: {
    getElementById:()=>null,
    addEventListener(){},
    documentElement:{dataset:{}},
    createTextNode(text){ const node=new Element('#text'); node.textContent=String(text); return node; },
  },
  window: {location, addEventListener(){}},
  fetch() { throw new Error('unexpected fetch'); },
  setTimeout(){ return 0; },
  clearTimeout(){},
};
context.window.location = location;
vm.createContext(context);
vm.runInContext(source, context);
context.document.createElement = tag => new Element(tag);

(async () => {
const discussionId = 'ab'.repeat(16);
location.search = '?discussion=' + discussionId;
let fetched = false;
context.fetch = async () => ({
  status: 401,
  json() { fetched = true; return {error:'Admin login required'}; },
});
context.window.location.replace = value => replaced.push(value);
try {
  await context.api('/api/status');
  throw new Error('401 must not resolve as a normal response');
} catch (error) {
  assert.match(String(error.message || error), /Redirecting/);
}
assert.equal(fetched, false);
assert.equal(replaced.length, 1);
assert.ok(replaced[0].startsWith('/login?next='));
assert.ok(decodeURIComponent(replaced[0].split('next=')[1]).includes('discussion=' + discussionId));

const card = context.renderChatMessage({
  id: 'm1',
  agent: 'Claude',
  source: 'api:claude/critique',
  created_at: '2026-11-10T18:00:00Z',
  body: JSON.stringify({
    handoff: 'Use the published guide.',
    open_issues: [],
    grounding: {sources: [{uri:'https://example.com/visitor-guide', title:'Visitor guide', chunk_index:0}]},
  }),
}, {});
const links = walk(card).filter(node => node.tagName === 'A');
assert.equal(links.length, 1);
assert.equal(links[0].href, 'https://example.com/visitor-guide');
assert.equal(links[0].rel, 'noopener noreferrer');
const labels = walk(card).map(node => node.textContent).join('\n');
assert.ok(labels.includes('Cited sources'));
assert.ok(!labels.includes('http://insecure.example'));
console.log('frontend checks passed');
})().catch(error => { console.error(error); process.exit(1); });
