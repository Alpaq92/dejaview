// Debug helper: dump a multi-page document's component/INCL structure and probe
// how each shared Djbz dictionary decodes (standalone vs chained).
import { readFileSync } from 'node:fs';
import { DjVuDoc } from '../src/document.js';
import { decodeJB2Dict } from '../src/jb2.js';

const doc = new DjVuDoc(new Uint8Array(readFileSync(process.argv[2])));
console.log(`pages=${doc.pageCount} components=${doc.id2form.size}`);

const djbzForms = [];
for (const [id, form] of doc.id2form) {
  const chunks = form.children.filter((c) => !c.isForm).map((c) => c.id);
  const incls = form.childrenWith('INCL').map((c) => new TextDecoder().decode(c.bytes).replace(/[\s\0]+$/, ''));
  if (chunks.includes('Djbz') || form.formType === 'DJVI') {
    console.log(`  ${form.formType} "${id}" [${chunks.join(',')}]${incls.length ? ' INCL→' + JSON.stringify(incls) : ''}`);
  }
  if (chunks.includes('Djbz')) djbzForms.push([id, form]);
}

console.log('\nstandalone Djbz decode probe:');
const dicts = {};
for (const [id, form] of djbzForms) {
  try {
    const d = decodeJB2Dict(form.child('Djbz').bytes, null);
    dicts[id] = d;
    console.log(`  "${id}": OK, shapeCount=${d.shapeCount}`);
  } catch (e) {
    console.log(`  "${id}": FAIL — ${e.message}`);
  }
}
