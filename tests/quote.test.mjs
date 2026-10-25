import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../src/config.mjs';
import {validateConfig,calculate,summary} from '../src/quote.mjs';
const copy=()=>structuredClone(config);
test('sample home has the independently calculated breakdown and rounded range',()=>{
 const q=calculate(config,config.defaults);
 assert.deepEqual(q.lines.map(l=>l.cents),[19800,2400,2000,1500]);
 assert.equal(q.totalCents,25700);assert.equal(q.lowCents,23000);assert.equal(q.highCents,28500);
});
test('minimum visit is applied and lower estimate stays at the minimum',()=>{
 const q=calculate(config,{area:500,floors:1,bedrooms:0,bathrooms:1,service:'standard'});
 assert.equal(q.totalCents,12000);assert.equal(q.lowCents,12000);assert.equal(q.highCents,13500);
 assert.equal(q.lines.at(-1).cents,6500);
});
test('invalid home details and unknown services are refused',()=>{
 for(const patch of [{area:499},{area:5001},{area:' '},{area:NaN},{floors:4},{bathrooms:0},{bedrooms:7},{service:'unknown'}])
  assert.throws(()=>calculate(config,{...config.defaults,...patch}));
});
test('configuration catches duplicate services and unapproved non-demo pricing',()=>{
 assert.equal(validateConfig(copy()).name,'Clearspace');
 const duplicate=copy();duplicate.services[1].id='standard';assert.throws(()=>validateConfig(duplicate));
 const live=copy();live.demo=false;live.enquiryUrl='https://example.com/enquire';assert.throws(()=>validateConfig(live),/Approve rates/);
});
test('estimate summary clearly identifies sample prices and no booking',()=>{
 const text=summary(config,calculate(config,config.defaults));
 assert.match(text,/demonstration/);assert.match(text,/USD/);assert.match(text,/Before sales tax/);assert.match(text,/No booking has been made/);
});
