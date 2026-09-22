const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { backend } = require('./sheets-mock.cjs');

function create(b, overrides = {}) {
  const data = {
    requestId: crypto.randomUUID(), fingerprint: b.hash('test-order'), accessToken: crypto.randomBytes(32).toString('base64url'),
    order: { name: 'Client', email: 'client@example.test', type: 'Character Art', budget: '$100', description: '=IMPORTXML("test")', reference: '' }, ...overrides,
  };
  return { data, result: b.post('createOrder', data) };
}
function ready(seed) { const b = backend(seed); b.setup(); return b; }
function recover(b, address = 'client@example.test') {
  assert.equal(b.post('queueRecovery', { email: address, requestId: crypto.randomUUID() }).status, 'ok');
  b.ctx.processRecoveryQueue();
  return [...b.mail.at(-1).body.matchAll(/#recover=([\w-]+)/g)].map(m => m[1]);
}
test('migration preserves legacy data, can run twice and creates no mail', () => {
  const b = ready({ Orders: [['Timestamp','Id','Status','Name','Email','Type','Budget','Description','Reference','LastUpdated'],[new Date(),'legacy-id','In Progress','Client','client@example.test','Character Art','private-budget','private-details','private-reference',new Date()]], Reviews: [['Timestamp','Name','Rating','Text','Id'],[new Date(),'Client',5,'Legacy review','review-id']], Ratings: [['Timestamp','Rating'],[new Date(),5]], Stats: [['RatingSum',5],['RatingCount',1]] });
  b.setup();
  const row = b.records('Orders')[0];
  assert.equal(row.Id, 'legacy-id'); assert.equal(row.Status, 'In progress'); assert.equal(row.Description,'private-details');
  assert.equal(row.Number,'ART-00001'); assert.equal(b.mail.length,0); assert.equal(b.triggers.length,2);
  assert.equal(b.post('listReviews').ratingCount,1);
  const tokens = recover(b); assert.equal(tokens.length,1);
});
test('create is idempotent, refuses changed request and escapes spreadsheet formulas', () => {
  const b=ready(), {data,result}=create(b);
  b.ctx.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('Unavailable in web app'); };
  assert.equal(result.status,'ok'); assert.equal(result.emailSent,true);
  assert.equal(b.post('createOrder',data).number,result.number);
  assert.equal(b.records('Orders').length,1); assert.equal(b.mail.length,1);
  assert.equal(b.records('Orders')[0].Description[0],"'");
  assert.equal(b.post('createOrder',{...data,fingerprint:b.hash('different')}).code,409);
  assert(!JSON.stringify(b.records('Orders')).includes(data.accessToken));
});
test('mail failure preserves order and retry sends once without duplicating', () => {
  const b=ready(); b.setMailFails(true); const {data,result}=create(b);
  assert.equal(result.status,'ok'); assert.equal(result.emailSent,false);
  b.setMailFails(false); assert.equal(b.post('createOrder',data).emailSent,true);
  assert.equal(b.records('Orders').length,1); assert.equal(b.mail.length,1);
});
test('private tracking returns only public fields; old routes and GET cannot disclose data', () => {
  const b=ready(), {data}=create(b);
  const response=b.post('trackOrder',{tokenHash:b.hash(data.accessToken)});
  assert.deepEqual(Object.keys(response.order).sort(),['message','number','status','type','updatedAt']);
  assert(!JSON.stringify(response).includes('client@example.test'));
  assert.equal(b.post('trackOrder',{tokenHash:b.hash('wrong')}).code,404);
  for(const action of ['findOrder','getOrder','updateOrder','adminOrders','deleteReview','rating','review','']) assert.equal(b.post(action).code,400);
  assert.equal(JSON.parse(b.ctx.doGet({parameter:{action:'getOrder'}}).body).code,405);
  assert.equal(b.post('trackOrder',{secret:'wrong',tokenHash:b.hash(data.accessToken)}).code,403);
});
test('recovery request does not look up orders and responds identically to unknown email', () => {
  const b=ready(); create(b); b.reads.length=0;
  const known=b.post('queueRecovery',{email:'client@example.test',requestId:crypto.randomUUID()});
  const unknown=b.post('queueRecovery',{email:'nobody@example.test',requestId:crypto.randomUUID()});
  assert.deepEqual(known,unknown); assert(!b.reads.includes('Orders'));
  const sentBefore=b.mail.length; b.ctx.processRecoveryQueue(); assert.equal(b.mail.length,sentBefore+1);
});
test('retrying recovery after a lost response does not create another queue row or email', () => {
  const b=ready(); create(b);
  const data={email:'client@example.test',requestId:crypto.randomUUID()};
  assert.equal(b.post('queueRecovery',data).status,'ok');
  b.ctx.processRecoveryQueue();
  const sent=b.mail.length;
  assert.equal(b.post('queueRecovery',data).status,'ok');
  b.ctx.processRecoveryQueue();
  assert.equal(b.records('_RecoveryQueue').length,1); assert.equal(b.mail.length,sent);
  assert.equal(b.post('queueRecovery',{...data,email:'other@example.test'}).code,409);
});
test('recovery rotates one order, expires, works once, and creation retry cannot restore old token', () => {
  const b=ready(), first=create(b), second=create(b);
  const tokens=recover(b); assert.equal(tokens.length,2);
  assert.equal(b.post('trackOrder',{tokenHash:b.hash(first.data.accessToken)}).status,'ok');
  const accessHash=b.hash('new-secret');
  assert.equal(b.post('confirmRecovery',{tokenHash:b.hash(tokens[0]),accessHash}).status,'ok');
  assert.equal(b.post('confirmRecovery',{tokenHash:b.hash(tokens[0]),accessHash}).code,404);
  assert.equal(b.post('trackOrder',{tokenHash:b.hash(first.data.accessToken)}).code,404);
  assert.equal(b.post('trackOrder',{tokenHash:accessHash}).status,'ok');
  assert.equal(b.post('trackOrder',{tokenHash:b.hash(second.data.accessToken)}).status,'ok');
  b.post('createOrder',first.data); assert.equal(b.post('trackOrder',{tokenHash:b.hash(first.data.accessToken)}).code,404);
  b.set('Orders',1,'RecoveryExpires',Date.now()-1);
  assert.equal(b.post('confirmRecovery',{tokenHash:b.hash(tokens[1]),accessHash:b.hash('other')}).code,404);
  assert(!JSON.stringify(b.records('Orders')).includes(tokens[1]));
});
test('recovery retries after exhausted quota and never restores a consumed token on retry', () => {
  const b=ready(); create(b); b.setQuota(0);
  b.post('queueRecovery',{email:'client@example.test',requestId:crypto.randomUUID()});
  b.ctx.processRecoveryQueue(); assert.equal(b.records('_RecoveryQueue')[0].State,'Pending');
  b.setQuota(100); b.ctx.processRecoveryQueue();
  assert.equal(b.records('_RecoveryQueue')[0].State,'Processed'); assert.match(b.mail.at(-1).body,/#recover=/);
});
test('revoking access blocks tracking and recovery, persisted limits reject abuse', () => {
  const b=ready(), {data}=create(b); b.set('Orders',0,'AccessEnabled',false);
  assert.equal(b.post('trackOrder',{tokenHash:b.hash(data.accessToken)}).code,404);
  b.post('queueRecovery',{email:'client@example.test',requestId:crypto.randomUUID()}); b.ctx.processRecoveryQueue(); assert.equal(b.mail.length,1);
  let result; for(let i=0;i<121;i++) result=b.post('trackOrder',{tokenHash:b.hash('wrong')});
  assert.equal(result.code,429); assert(b.records('_RateLimits').length>0);
  b.setLocked(true);
  assert.equal(b.post('listReviews').status,'ok', 'Public reviews are readable while a write lock is held');
  assert.equal(b.post('confirmRecovery',{tokenHash:b.hash('recovery'),accessHash:b.hash('new')}).reason,'BACKEND_BUSY');
  b.setLocked(false);
});
test('review visibility drives both list and average, duplicate submissions count once', () => {
  const b=ready();
  const r={requestId:crypto.randomUUID(),name:'A',text:'=formula()',rating:5};
  b.post('createReview',r); b.post('createReview',r);
  assert.equal(b.post('createReview',{...r,text:'Different review'}).code,409);
  b.post('createReview',{...r,requestId:crypto.randomUUID(),rating:1});
  assert.equal(b.post('listReviews').avgRating,3); assert.equal(b.post('listReviews').ratingCount,2);
  b.set('Reviews',1,'Visible',false);
  assert.equal(b.post('listReviews').ratingCount,1); assert.equal(b.post('listReviews').avgRating,5);
});
test('multi-row manual public-field edits timestamp all affected orders', () => {
  const b=ready(); create(b); create(b);
  b.set('Orders',0,'LastUpdated',new Date(0)); b.set('Orders',1,'LastUpdated',new Date(0));
  b.ctx.onSheetEdit({source:b.spreadsheet,range:b.sheets.get('Orders').getRange(2,3,2,1)});
  assert(b.records('Orders').every(r=>r.LastUpdated.getTime()>0));
});

test('Netlify handlers validate inputs and integrate with simulated Apps Script without network', async () => {
  const b=ready(); const originalFetch=global.fetch; const originalEnv={...process.env};
  Object.assign(process.env,{APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',SITE_URL:'https://example.test',BACKEND_SECRET:b.properties.get('BACKEND_SECRET')});
  let calls=0;
  global.fetch=async (_url, options)=>{calls++;const data=JSON.parse(options.body);return {ok:true,json:async()=>b.post(data.action,data)};};
  const orders=require('../netlify/functions/orders').handler;
  const reviews=require('../netlify/functions/reviews').handler;
  const event=data=>({httpMethod:'POST',headers:{'x-nf-client-connection-ip':'192.0.2.1'},body:JSON.stringify(data)});
  try {
    assert.equal((await orders({httpMethod:'GET',headers:{}})).statusCode,405);
    const payload={action:'create',requestId:crypto.randomUUID(),name:'A',email:'client@example.test',type:'Character Art',description:'A portrait',termsAccepted:true};
    assert.equal((await orders(event({...payload,termsAccepted:false}))).statusCode,400);
    const first=await orders(event(payload)); assert.equal(first.statusCode,200); assert.equal(first.headers['Cache-Control'],'no-store');
    assert.equal((await orders(event(payload))).statusCode,200); assert.equal(b.records('Orders').length,1);
    const token=b.mail[0].body.match(/#token=([\w-]+)/)[1];
    assert.equal((await orders(event({action:'track',token}))).statusCode,200);
    assert.equal((await orders(event({action:'recover',email:'client@example.test'}))).statusCode,202);
    b.ctx.processRecoveryQueue(); const recovery=b.mail.at(-1).body.match(/#recover=([\w-]+)/)[1];
    const confirmed=await orders(event({action:'confirm',token:recovery})); assert.equal(confirmed.statusCode,200);
    assert.equal((await orders(event({action:'track',token:JSON.parse(confirmed.body).token}))).statusCode,200);
    assert.equal((await orders(event({action:'track',token}))).statusCode,404);
    assert.equal((await reviews(event({requestId:crypto.randomUUID(),rating:5,name:'A',text:'Lovely work'}))).statusCode,200);
    assert.equal(JSON.parse((await reviews({httpMethod:'GET',headers:{}})).body).ratingCount,1);
    delete process.env.BACKEND_SECRET; const before=calls;
    assert.equal((await orders(event(payload))).statusCode,503); assert.equal(calls,before);
  } finally { global.fetch=originalFetch; process.env=originalEnv; }
});
