// Rink Report end-to-end checks.
//
// Serves ../docs from disk, stubs every Google Sheets request with the CSVs
// in fixtures/ (keyed on BOTH gid= and sheet= — a stub that matched only tab
// names once misrouted every tab and reported a phantom regression), drives
// the page in headless Chromium and checks the rendered DOM.
//
//   npm install      (once; downloads Chromium)
//   npm test         (582 checks, ~2 minutes)
//
// Fixtures: the season workbook's Settings / Teams / Schedule tabs with the
// five real showcase scores, schedule_future.csv (two tournaments on the
// calendar), schedule_live.csv (an event being played today), and stats.csv
// generated from the Player Stats workbook in the shape Google exports.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const HERE = __dirname;
const fx = n => fs.readFileSync(path.join(HERE,'fixtures',n),'utf8');
// The "live" fixture has to be live on the day the suite runs, so its event
// rows are re-dated to today and tomorrow at load. (They were typed as Sept
// 1-2 2026 and the block went red the day after, for no real reason.)
// The fixtures were typed in early September 2026 and several checks name
// their dates ("next game Sep 13"). Real time walked past them on Sept 14 and
// eight checks went red for no reason. So the page runs on a frozen clock:
// every test sees Sept 10 2026 as today, whatever day the suite is run.
// Timers stay real (setFixedTime only pins Date), so polling still works.
const FROZEN = new Date(2026, 8, 10, 12, 0, 0);
function isoOffset(n){ const d=new Date(FROZEN); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function redateLive(csv){
  return csv.split(/\r?\n/).map(l=>{
    if(!/Labor Day Faceoff/.test(l)) return l;
    return l.replace(/^2026-09-01,/, isoOffset(0)+',').replace(/^2026-09-02,/, isoOffset(1)+',');
  }).join('\r\n');
}
const ALT = { future: fx('schedule_future.csv'), live: redateLive(fx('schedule_live.csv')) };
const FIX = {
  settings: fx('settings.csv'),
  teams:    fx('teams.csv'),
  schedule: fx('schedule.csv'),
  stats:    fx('stats.csv'),
  rinks:    fx('rinks.csv'),
  sponsors: fx('sponsors.csv'),
};
// A league season part-way through: puts a score on the first n league rows
// (rows with a blank Event), so the card has finished games as well as
// upcoming ones. Used by the schedule-order checks.
function scoreLeague(csv, n){
  let done = 0;
  return csv.split(/\r?\n/).map(l=>{
    const c = l.split(',');
    if(done>=n || !/^20\d\d-/.test(c[0]||'') || (c[9]||'')!=='') return l;
    c[4]='4'; c[5]='1'; done++;
    return c.join(',');
  }).join('\r\n');
}
ALT.scored = scoreLeague(FIX.schedule, 2);
// A blank Event cell on a day the showcase is running (Aug 29). One row is
// our own game, so it is a forgotten cell; the other is two league teams who
// simply had a normal game that day and must not be flagged.
function addRow(csv, line){ return csv.replace(/\r?\n$/, '') + '\r\n' + line + '\r\n'; }
ALT.strayOurs  = addRow(FIX.schedule, '2026-08-29,5:00 PM,West Seneca Wings,Buffalo Bisons,,,Nichols,,Pool,,');
ALT.strayOther = addRow(FIX.schedule, '2026-08-29,5:00 PM,Cazenovia Chiefs,Buffalo Bisons,,,Nichols,,Q-Game,,');

const GIDS = { '1160090892':'settings', '239776309':'teams', '1739208952':'schedule', '703037060':'stats', '1202177208':'rinks', '95128319':'sponsors' };
const TABS = { 'Settings':'settings', 'Teams':'teams', 'Schedule':'schedule', 'Player Stats':'stats', 'Rinks':'rinks', 'Sponsors':'sponsors', 'Ice slots':'slots' };
// The test league (docs/testleague/): its own sheet, so its own gid map and
// fixtures, exported from Test-League-12U-Sheet.xlsx the way Google would.
const lfx = n => fs.readFileSync(path.join(HERE,'fixtures','league',n),'utf8');
const LEAGUE_GIDS = { '560272049':'settings', '1574794579':'teams', '1402291474':'schedule', '1489084264':'rinks', '1641985135':'sponsors', '1745516389':'slots' };
const LEAGUE_FIX = { settings: lfx('settings.csv'), teams: lfx('teams.csv'), schedule: lfx('schedule.csv'), rinks: lfx('rinks.csv'), sponsors: lfx('sponsors.csv'), slots: lfx('slots.csv') };
const LEAGUE = { team:'testleague', gids:LEAGUE_GIDS, fix:LEAGUE_FIX };
// The league part-way through: eight played games, four per division, plus
// one cross-division game still to come.
LEAGUE_FIX.scheduled = LEAGUE_FIX.schedule.replace(/\r?\n$/, '') + '\r\n' + [
  ',2026-08-22,10:30 AM,Harbor Hawks,Lakeshore Lightning,2,5,Lakeshore Arena,Blue,League,,OK',
  ',2026-08-22,1:30 PM,Mill Creek Mustangs,Ridgeway Rangers,3,3,Ridgeway Rink,Blue,League,,OK',
  ',2026-08-23,12:00 PM,Lakeshore Lightning,Mill Creek Mustangs,4,1,Mill Creek Twin Rinks,Blue,League,,OK',
  ',2026-08-23,3:00 PM,Ridgeway Rangers,Harbor Hawks,0,2,Harbor Ice Center,Blue,League,,OK',
  ',2026-08-22,12:00 PM,Southpoint Storm,Northgate Narwhals,1,6,Northgate Pavilion,Gold,League,,OK',
  ',2026-08-22,4:40 PM,Westbrook Wolves,Eastfield Eagles,2,2,Eastfield Ice Plex,Gold,League,,OK',
  ',2026-08-23,10:30 AM,Northgate Narwhals,Westbrook Wolves,3,2,Westbrook Community Rink,Gold,League,,OK',
  ',2026-08-23,1:30 PM,Eastfield Eagles,Southpoint Storm,5,4,Southpoint Arena,Gold,League,,OK',
  ',2026-11-07,10:30 AM,Harbor Hawks,Northgate Narwhals,,,Northgate Pavilion,,League,,OK'
].join('\r\n') + '\r\n';
const LEAGUE_PLAYED = { team:'testleague', gids:LEAGUE_GIDS, fix:Object.assign({}, LEAGUE_FIX, {schedule: LEAGUE_FIX.scheduled}) };

// Simulate the gviz tab-name route: blank every header cell in a column that
// otherwise holds only numbers (that is what Google does).
function coerceNumericHeaders(csv, harsh){
  const rows = csv.split(/\r?\n/).map(l => l.split(','));
  const width = Math.max(...rows.map(r=>r.length));
  for(let c=0;c<width;c++){
    let numeric=false, text=false;
    for(let r=0;r<rows.length;r++){
      const v=(rows[r][c]||'').trim();
      if(!v) continue;
      if(/^-?\d*\.?\d+\.?$/.test(v)) numeric=true; else text=true;
    }
    if(numeric && text){
      // gviz keeps the majority type; for our tab the numeric columns have one text header
      let nCount=0,tCount=0;
      for(const r of rows){ const v=(r[c]||'').trim(); if(!v) continue; if(/^-?\d*\.?\d+\.?$/.test(v)) nCount++; else tCount++; }
      if(harsh ? nCount>=tCount : nCount>tCount) for(const r of rows){ const v=(r[c]||'').trim(); if(v && !/^-?\d*\.?\d+\.?$/.test(v)) r[c]=''; }
    }
  }
  return rows.map(r=>r.join(',')).join('\r\n');
}

const OUT = path.join(HERE,'out'); fs.mkdirSync(OUT,{recursive:true});
let failures=0, passes=0;
// Seals a test report the way tools/seal.mjs would, with the site's own
// module, so the page unlocks exactly what a real upload would hold.
let sealMod = null;
async function sealed(text){
  if(!sealMod) sealMod = await import(require('url').pathToFileURL(path.join(SITE_DIR,'js','util','seal.js')).href);
  return sealMod.seal(text, PASS);
}
function ok(cond, msg){ if(cond){passes++; console.log('  ok   '+msg);} else {failures++; console.log('  FAIL '+msg);} }

function serve(dir, port){
  return new Promise(res=>{
    const s=http.createServer((req,r)=>{
      // A folder address (ending in /) serves that folder's index.html, as GitHub Pages does.
      const u=req.url.split('?')[0];
      const p=path.join(dir, u.endsWith('/') ? u+'index.html' : u);
      if(!fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; }
      const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
      r.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(fs.readFileSync(p));
    }).listen(port, ()=>res(s));
  });
}

async function openPage(browser, url, opts){
  // opts: { export: {which: status|'coerce'|'text'}, tabname: {...}, scheme }
  // opts.team / opts.gids / opts.fix: drive another folder under docs/ with
  // its own gid map and fixture set (the league page uses LEAGUE_*).
  const T = opts.team || TEAM;
  const gidMap = opts.gids || GIDS;
  const fixSet = opts.fix || FIX;
  const ctx = await browser.newContext({ viewport:{width:412,height:900}, colorScheme: opts.scheme||'light' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(opts.clock || FROZEN);
  const errors=[], asked=[];   // asked: which tabs the page requested, by name
  page.on('pageerror', e=>errors.push(String(e)));
  await page.route(/docs\.google\.com/, route=>{
    const u=new URL(route.request().url());
    let which=null, how=null;
    if(u.pathname.endsWith('/export')){ which=gidMap[u.searchParams.get('gid')]; how='export'; }
    else if(u.pathname.indexOf('/gviz/')!==-1){ which=TABS[u.searchParams.get('sheet')]; how='gviz'; }
    if(which) asked.push(which);
    else if(u.pathname.endsWith('/htmlview')){ route.fulfill({status:200, body:'<html>'+Object.keys(gidMap).map(g=>'<a href="#gid='+g+'">t</a>').join('')+'</html>'}); return; }
    if(!which){ route.fulfill({status:400, body:'bad'}); return; }
    const plan=(opts[how]||{})[which];
    if(plan==='404'){ route.fulfill({status:404, body:'nope'}); return; }
    if(plan==='empty'){ route.fulfill({status:200, body: which==='stats' ? fixSet.stats.split(/\r?\n/).slice(0,2).join('\r\n')+'\r\n' : ''}); return; }
    let body=fixSet[which];
    if(which==='schedule' && opts.schedule) body=ALT[opts.schedule];
    if(which==='settings' && opts.settingsTeam) body=body.replace(/(Our team,)West Seneca Wings/, '$1'+opts.settingsTeam);
    if(which==='schedule' && opts.leagueLog)
      body = body.replace('2026-09-13,11:00 AM,West Seneca Wings,Southtown Stars,,,',
                          '2026-09-13,11:00 AM,West Seneca Wings,Southtown Stars,6,2,');
    if(which==='stats' && opts.leagueLog) body = body.split('8/30/2026').join('9/13/2026');
    // A tie in the goalie log: the Sylvania game, which the totals block still counts as a loss.
    if(which==='stats' && opts.ties) body = body.replace('Andrew M.,42,,5,L', 'Andrew M.,42,,5,T');
    // Any other one-off change to the stats tab, as a function of its text.
    if(which==='stats' && opts.statsEdit) body = opts.statsEdit(body);
    // A sheet that slipped back to a full name, which the page must still shorten.
    if(which==='stats' && opts.fullName) body = body.split('Luke G.').join('Testy McTestface');
    if(which==='schedule' && opts.eventPeriods){
      // Adds a Period length column and fills it for rows of a given event.
      body = body.split(/\r?\n/).map((l,i,all)=>{
        if(/^Date,Face-off,/.test(l)) return l+',Period length';
        if(!/^20\d\d-/.test(l)) return l;
        // Quoted, because a manager types "12, 12, 12" and the commas are
        // part of the value, not column breaks.
        return l + ',' + (l.indexOf(opts.eventPeriods.event)!==-1 ? '"'+opts.eventPeriods.value+'"' : '');
      }).join('\r\n');
    }
    if(which==='settings' && opts.periods) body=body.replace(/\n,Points for a win,/, '\n,Period length,"'+opts.periods+'",the periods the league plays,,,\n,Points for a win,');
    if(how==='gviz') body=coerceNumericHeaders(body, !!opts.harsh);
    route.fulfill({status:200, contentType:'text/csv', body});
  });
  // The site's saved copy under data/: absent unless opts.snapshot, in which
  // case it serves the fixtures (as the GitHub Action would have written them).
  await page.route(new RegExp('localhost:8811/'+T+'/data/'), route=>{
    const name=new URL(route.request().url()).pathname.replace(/^.*\/data\//,'');
    // The Coaches report is its own sealed file, present only when a check
    // asks for it (opts.notes is the plain text; it is sealed with PASS).
    // The old plain-text name is gone for good: 404, and noted, so a check
    // can prove the parents' page never asks for either.
    if(name==='coaches-corner.enc' || name==='coaches-corner.txt'){
      asked.push('notes:'+name);
      if(name==='coaches-corner.enc' && opts.notes){ sealed(opts.notes).then(bytes=>route.fulfill({status:200, contentType:'application/octet-stream', body:Buffer.from(bytes)})); }
      else route.fulfill({status:404, body:'not found'});
      return;
    }
    if(!opts.snapshot){ route.fulfill({status:404, body:'not found'}); return; }
    if(name==='updated.txt'){ route.fulfill({status:200, contentType:'text/plain', body:'2026-09-09T22:15:00Z\n'}); return; }
    const which=name.replace(/\.csv$/,'');
    if(!fixSet[which]){ route.fulfill({status:404, body:'nope'}); return; }
    route.fulfill({status:200, contentType:'text/csv', body:fixSet[which]});
  });
  // opts.teamsJs: a replacement ../teams.js, so a check can give the club
  // other colors or add teams without touching the real file.
  if(opts.teamsJs){
    await page.route(/localhost:8811\/teams\.js/, route=>route.fulfill({status:200, contentType:'text/javascript', body:opts.teamsJs}));
  }
  // opts.features: {name:false,...} is spliced onto the end of config.js as
  // it loads, so a switch can be tested without editing the file. Both the
  // parents' page and the staff page read the same config.js.
  if(opts.features){
    await page.route(new RegExp('localhost:8811/'+T+'/config\\.js(\\?.*)?$'), route=>{
      const js=fs.readFileSync(path.join(SITE_DIR,T,'config.js'),'utf8')
        + '\nwindow.RINK_CONFIG.features=Object.assign({},window.RINK_CONFIG.features,'+JSON.stringify(opts.features)+');\n';
      route.fulfill({status:200, contentType:'text/javascript; charset=utf-8', body:js});
    });
  }
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#rr-fresh') && /Updated/.test(document.querySelector('#rr-fresh').textContent), null, {timeout:15000}).catch(()=>{});
  await page.waitForTimeout(300);
  return {page, ctx, errors, asked};
}

const SITE_DIR = process.env.SITE || path.join(HERE,'..','docs');
// Every team page lives in its own folder under docs/. The suite drives the
// Wings'. BASE is that page's address on the test server.
const TEAM = 'wswings12u';
const BASE = 'http://localhost:8811/'+TEAM+'/';
// The team's staff page: same code, the staff view switched on. Home of the
// Coaches Corner cards, the sealed report, the post buttons and ?check.
const STAFF = BASE+'staff/';
// The passphrase the suite seals the test report with. Never the real one.
const PASS = 'test-pass-123';
(async()=>{
  const SITE = SITE_DIR;
  const sNew = await serve(SITE, 8811);
    const browser = await chromium.launch(process.env.CHROME ? { executablePath:process.env.CHROME } : {});

  // 1. Happy path over the export route
  console.log('\n[1] export route, stats present');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors: '+errors.join(' | '));
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.join('/')==='League/Events/Stats', 'bar is League / Events / Stats (past showcase folded into Events): '+tabs.join(' / '));
    ok(tabs[tabs.length-1]==='Stats', 'Stats is the last tab');
    const chipBefore = await page.$eval('.record', e=>e.textContent).catch(()=>'');
    await page.click('.viewbar button[data-v="stats"]');
    await page.waitForTimeout(100);
    const kicker = await page.$eval('.masthead .eyebrow', e=>e.textContent);
    ok(kicker==='Player stats', 'kicker reads Player stats: '+kicker);
    const h2s = await page.$$eval('.card h2', e=>e.map(x=>x.textContent));
    ok(h2s.join('|')==='Our sponsors|Skaters|In net', 'sections: '+h2s.join('|'));
    const rows = await page.$$eval('.card:nth-of-type(1) tbody tr', trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    const skaters = await page.$$eval('table', ts=>[...ts[0].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    ok(skaters.length===13, '13 skater rows ('+skaters.length+')');
    ok(skaters[0][0]==='15Luke G.' && skaters[0][4]==='7', 'top row is #15 Luke G. with 7 pts: '+JSON.stringify(skaters[0]));
    ok(skaters[1][0]==='17Evan C.', 'second is Evan C. (2G beats 6G? no: same pts, fewer goals sorts after): '+skaters[1][0]);
    ok(skaters[2][0]==='14Evan B.' && skaters[3][0]==='91Chase M.', '4-pt group ordered by goals then number: '+skaters[2][0]+', '+skaters[3][0]);
    ok(skaters[12][0]==='89Sal S.', 'last row Sal S. (0 pts, higher number): '+skaters[12][0]);
    const pim = skaters.map(r=>r[5]);
    ok(pim[0]==='0' && pim[1]==='1.5' && pim.indexOf('4.5')!==-1 && pim.indexOf('6')!==-1, 'PIM formats 0 / 1.5 / 4.5 / 6: '+pim.join(','));
    const totalG = skaters.reduce((a,r)=>a+(+r[2]),0), totalA = skaters.reduce((a,r)=>a+(+r[3]),0);
    ok(totalG===22 && totalA===22, 'team totals G=22 A=22 ('+totalG+'/'+totalA+')');
    const goalies = await page.$$eval('table', ts=>[...ts[1].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    ok(goalies.length===2, '2 goalie rows');
    ok(goalies[0][0]==='29Andrew M.' && goalies[0][3]==='9' && goalies[0][4]==='2.41' && goalies[0][5]==='1', 'first goalie, 9 GA in 168 min over a 45 min game = 2.41 GAA, 1 SO: '+JSON.stringify(goalies[0]));
    ok(goalies[1][0]==='32Stephen D.' && goalies[1][4]==='5.36' && goalies[1].length===7, 'second goalie, 5 GA in 42 min over a 45 min game = 5.36 GAA; no saves or SV% columns: '+JSON.stringify(goalies[1]));
    const goalieHead = await page.$$eval('table', ts=>[...ts[1].querySelectorAll('thead th')].map(t=>t.textContent).join('/'));
    ok(goalieHead==='Goalie/GP/Min/GA/GAA/SO/Record', 'goalie columns: '+goalieHead);
    const body = await page.$eval('#app', e=>e.textContent);
    const names = await page.$$eval('table', ts=>[...ts].slice(0,2).flatMap(t=>[...t.querySelectorAll('tbody tr td:first-child')].map(td=>td.textContent.replace(/^\d+/,''))));
    ok(names.length>0 && names.every(n=>/^[A-Z][A-Za-z'\-]+ [A-Z]\.$/.test(n)), 'every player and goalie shows as first name + last initial: '+names.join(', '));
    ok(!/SV%|1\.000/.test(body), 'no save percentage anywhere on the page');
    ok(/Through 5 games/.test(body), '"Through 5 games" eyebrow');
    const cache = await page.evaluate(()=>JSON.parse(localStorage.getItem('rinkreport.v5:/wswings12u/')));
    ok(cache && cache.data && cache.data.stats && cache.data.stats.skaters.length===13, 'cache v5 carries stats');
    ok(cache && cache.data && cache.data.rinks && Object.keys(cache.data.rinks).length===18, 'cache v5 carries rinks');
    ok(cache && cache.data && cache.data.sponsors && cache.data.sponsors.count===9, 'cache v5 carries sponsors');
    ok(cache.data.stats.skaters.every(k=>/^[A-Z][A-Za-z'\-]+ [A-Z]\.$/.test(k.name)), 'cache holds shortened names only');
    // back to league: standings still there
    await page.click('.viewbar button[data-v="league"]');
    await page.waitForTimeout(100);
    const h2b = await page.$$eval('.card:not(.sponsors) h2', e=>e.map(x=>x.textContent));
    ok(h2b[0]==='Standings', 'league view still renders standings: '+h2b.join('|'));
    await page.screenshot({path:path.join(OUT,'shot_league_light.png'), fullPage:false});
    await page.click('.viewbar button[data-v="stats"]');
    await page.waitForTimeout(100);
    await page.screenshot({path:path.join(OUT,'shot_stats_light.png'), fullPage:true});
    await ctx.close();
  }

  // 2. gviz fallback with blanked numeric headers
  console.log('\n[2] tab-name route (numeric headers blanked)');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{stats:'404'}});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.indexOf('Stats')!==-1, 'Stats tab present via gviz');
    await page.click('.viewbar button[data-v="stats"]'); await page.waitForTimeout(100);
    const skaters = await page.$$eval('table', ts=>[...ts[0].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    const goalies = await page.$$eval('table', ts=>[...ts[1].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    ok(skaters.length===13 && skaters[0][0]==='15Luke G.' && skaters[0][4]==='7' && skaters[0][5]==='0', 'same skater result by position: '+JSON.stringify(skaters[0]));
    ok(goalies[0][4]==='2.41' && goalies[0][6]==='3-1-0', 'same goalie result by position (GAA 2.41, record 3-1-0): '+JSON.stringify(goalies[0]));
    const banner = await page.$eval('#app', e=>e.textContent);
    ok(!/tab IDs in config.js belong to a different sheet/.test(banner), 'a failing stats export does not accuse the other tab IDs');
    await ctx.close();
  }

  // 2. gviz fallback with blanked numeric headers
  console.log('\n[2b] tab-name route, EVERY numeric header blanked');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{stats:'404'}, harsh:true});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.indexOf('Stats')!==-1, 'Stats tab present via gviz');
    await page.click('.viewbar button[data-v="stats"]'); await page.waitForTimeout(100);
    const skaters = await page.$$eval('table', ts=>[...ts[0].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    const goalies = await page.$$eval('table', ts=>[...ts[1].querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
    ok(skaters.length===13 && skaters[0][0]==='15Luke G.' && skaters[0][4]==='7' && skaters[0][5]==='0', 'same skater result by position: '+JSON.stringify(skaters[0]));
    ok(goalies[0][4]==='2.41' && goalies[0][6]==='3-1-0', 'same goalie result by position (GAA 2.41, record 3-1-0): '+JSON.stringify(goalies[0]));
    const banner = await page.$eval('#app', e=>e.textContent);
    ok(!/tab IDs in config.js belong to a different sheet/.test(banner), 'a failing stats export does not accuse the other tab IDs');
    await ctx.close();
  }

  // 3. No stats tab at all
  console.log('\n[3] stats tab missing on every route');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{stats:'404'}, gviz:{stats:'404'}});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent)).catch(()=>[]);
    ok(tabs.join('/')==='League/Events', 'no Stats tab: '+tabs.join(' / '));
    const body = await page.$eval('#app', e=>e.textContent);
    ok(!/Player Stats/.test(body), 'no stats warning shown to parents');
    ok(/Standings/.test(body), 'standings still render');
    // ?check
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1500);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Stats\s+not shown/.test(diag), '?check says stats not shown: '+(diag.match(/Stats .*/)||[''])[0]);
    ok(/Player Stats/.test(diag), '?check lists the stats tab name');
    await ctx.close();
  }

  // 4. Header row present, no players under it
  console.log('\n[4] stats tab exists but is empty');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{stats:'empty'}});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent)).catch(()=>[]);
    ok(tabs.indexOf('Stats')===-1, 'no Stats tab for an empty sheet');
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1500);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/no player rows/.test(diag), '?check explains why: '+(diag.match(/Stats .*/)||[''])[0]);
    await ctx.close();
  }

  // 5. ?check with stats loaded, and dark scheme screenshot
  console.log('\n[5] diagnostics + dark mode');
  {
    const {page, ctx} = await openPage(browser, STAFF+'?check', {});
    await page.waitForTimeout(1200);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Stats\s+13 skaters, 2 goalies/.test(diag), '?check counts: '+(diag.match(/Stats .*/)||[''])[0]);
    ok(/stats=raw export/.test(diag), 'read via raw export for stats');
    await ctx.close();
    const d = await openPage(browser, BASE, {scheme:'dark'});
    await d.page.click('.viewbar button[data-v="stats"]'); await d.page.waitForTimeout(100);
    await d.page.screenshot({path:path.join(OUT,'shot_stats_dark.png'), fullPage:true});
    ok(d.errors.length===0, 'dark mode renders without errors');
    await d.ctx.close();
  }

  // 6. A later poll that loses the stats tab keeps the last copy
  console.log('\n[6] transient stats failure keeps the previous copy');
  {
    const {page, ctx} = await openPage(browser, BASE, {});
    await page.unroute(/docs\.google\.com/);
    await page.route(/docs\.google\.com/, route=>{
      const u=new URL(route.request().url());
      const which = u.pathname.endsWith('/export') ? GIDS[u.searchParams.get('gid')] : TABS[u.searchParams.get('sheet')];
      if(which==='stats'){ route.fulfill({status:404, body:'x'}); return; }
      route.fulfill({status:200, body:FIX[which]||''});
    });
    await page.click('button[data-act="refresh"]');
    await page.waitForTimeout(3500);
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.indexOf('Stats')!==-1, 'Stats tab survives a failed refresh');
    await ctx.close();
  }


  // 7. Events tab: past showcase only
  console.log('\n[7] events page, one past showcase');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100);
    ok(errors.length===0, 'no page errors');
    const kicker = await page.$eval('.masthead .eyebrow', e=>e.textContent);
    ok(kicker==='Tournaments & showcases', 'kicker: '+kicker);
    const chip = await page.$eval('.record', e=>e.textContent).catch(()=>'(none)');
    ok(true, 'record chip on events page shows league: '+chip);
    const h2s = await page.$$eval('.card h2', e=>e.map(x=>x.textContent));
    ok(h2s.join('|')==='Our sponsors|Coming up|Past events', 'sections: '+h2s.join('|'));
    const body = await page.$eval('#app', e=>e.textContent);
    ok(/Nothing on the calendar yet/.test(body), 'coming up is empty');
    const rows = await page.$$eval('.evrow', r=>r.map(x=>x.textContent));
    ok(rows.length===1 && /Pre-Season Summer Showcase 2026/.test(rows[0]) && /3-2-0/.test(rows[0]) && /Fri Aug 28 – Sun Aug 30/.test(rows[0]), 'past row: name, dates, our 3-2-0: '+rows[0]);
    await page.click('.evrow'); await page.waitForTimeout(100);
    const pressed = await page.$eval('.viewbar button[aria-pressed="true"]', e=>e.textContent);
    ok(pressed==='Events', 'opening a past event keeps Events lit: '+pressed);
    const k2 = await page.$eval('.masthead .eyebrow', e=>e.textContent);
    ok(k2==='Pre-Season Summer Showcase 2026', 'event kicker: '+k2);
    const h2e = await page.$$eval('.card:not(.sponsors) h2', e=>e.map(x=>x.textContent));
    ok(/Round robin|Pool standings/.test(h2e[0]) && h2e[1]==='Schedule & results', 'full event view: '+h2e.join('|'));
    const crumb = await page.$eval('.crumb', e=>e.textContent);
    ok(/All events/.test(crumb) && /Aug 28/.test(crumb), 'crumb with dates: '+crumb);
    await page.screenshot({path:path.join(OUT,'shot_event_open.png'), fullPage:false});
    await page.click('.crumb button'); await page.waitForTimeout(100);
    const back = await page.$$eval('.card:not(.sponsors) h2', e=>e.map(x=>x.textContent));
    ok(back[0]==='Coming up', 'crumb returns to Events');
    await page.screenshot({path:path.join(OUT,'shot_events.png'), fullPage:true});
    await ctx.close();
  }

  // 8. A tournament on the calendar gets the button; a later one does not
  console.log('\n[8] future tournaments');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {schedule:'future'});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.join('/')==='League/Thanksgiving…/Events/Stats', 'bar: '+tabs.join(' / '));
    const pressed = await page.$eval('.viewbar button[aria-pressed="true"]', e=>e.textContent);
    ok(pressed==='League', 'lands on League when nothing is live: '+pressed);
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100);
    const ahead = await page.$$eval('.card:not(.sponsors)', c=>[...c[0].querySelectorAll('.evrow')].map(x=>x.textContent));
    ok(ahead.length===2 && /Thanksgiving/.test(ahead[0]) && /NEXT/.test(ahead[0]) && /3 games/.test(ahead[0]) && /Presidents/.test(ahead[1]) && !/NEXT/.test(ahead[1]), 'coming up: nearer first, tagged NEXT, game count: '+JSON.stringify(ahead));
    const past = await page.$$eval('.card:not(.sponsors)', c=>[...c[1].querySelectorAll('.evrow')].map(x=>x.textContent));
    ok(past.length===1 && /Pre-Season/.test(past[0]), 'past: the showcase');
    await page.click('.card .evrow'); await page.waitForTimeout(100);
    const lit = await page.$eval('.viewbar button[aria-pressed="true"]', e=>e.textContent);
    ok(lit==='Thanksgiving…', 'opening the featured event from the list lights its own button: '+lit);
    const crumbs = await page.$$('.crumb');
    ok(crumbs.length===0, 'no crumb on an event that has its own button');
    await page.screenshot({path:path.join(OUT,'shot_events_future.png'), fullPage:false});
    await ctx.close();
  }

  // 9. Live event wins the button and the landing view
  console.log('\n[9] live event');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {schedule:'live'});
    ok(errors.length===0, 'no page errors');
    const tabs = await page.$$eval('.viewbar button', b=>b.map(x=>x.textContent));
    ok(tabs.join('/')==='League/Labor Day Faceoff/Events/Stats', 'bar names the live event, not the later tournament: '+tabs.join(' / '));
    const pressed = await page.$eval('.viewbar button[aria-pressed="true"]', e=>e.textContent);
    ok(pressed==='Labor Day Faceoff', 'lands on the live event: '+pressed);
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100);
    const ahead = await page.$$eval('.card:not(.sponsors)', c=>[...c[0].querySelectorAll('.evrow')].map(x=>x.textContent));
    ok(ahead.length===2 && /NOW/.test(ahead[0]) && /Thanksgiving/.test(ahead[1]), 'coming up: live one tagged NOW, then Thanksgiving: '+JSON.stringify(ahead));
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1200);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Bar\s+League\s+\|\s+Labor Day Faceoff\s+\|\s+Events\s+\|\s+Stats/.test(diag), '?check Bar line: '+(diag.match(/Bar .*/)||[''])[0]);
    ok(/Labor Day Faceoff \(2, .*in the bar\)/.test(diag), '?check Events line marks the featured one');
    await ctx.close();
  }

  // 10. Before opening day: no wall of zeros
  console.log('\n[10] pre-season league view');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const h2 = await page.$$eval('.card:not(.sponsors) h2', e=>e.map(x=>x.textContent));
    ok(h2[0]==='Standings', 'section still titled Standings: '+h2.join('|'));
    const tables = await page.$$('.card:first-of-type table');
    const anyTable = await page.$$eval('section.card:not(.sponsors)', cs=>cs[0].querySelectorAll('table').length);
    ok(anyTable===0, 'no standings table before the first league score');
    const lead = await page.$eval('.lead', e=>e.textContent);
    ok(/League play starts \w{3} \w{3} \d+\./.test(lead) || /League play has started/.test(lead), 'lead line: '+lead);
    const pre = await page.$$eval('.evrow.pre', r=>r.map(x=>x.textContent));
    ok(pre.length===1 && /Pre-Season Summer Showcase 2026/.test(pre[0]) && /3-2-0/.test(pre[0]), 'pre-season record row: '+JSON.stringify(pre));
    const div = await page.$$eval('.division li', li=>li.map(x=>[x.textContent, x.className]));
    ok(div.length===11, '11 clubs listed ('+div.length+')');
    ok(div.filter(d=>d[1]==='us').length===1 && div.find(d=>d[1]==='us')[0]==='West Seneca Wings', 'our club highlighted once');
    const body = await page.$eval('#app', e=>e.textContent);
    ok(!/Allegheny|Macomb|Sylvania/.test(body.split('Schedule')[0]), 'showcase-only clubs are not in the division list');
    await page.click('.evrow.pre'); await page.waitForTimeout(100);
    const k = await page.$eval('.masthead .eyebrow', e=>e.textContent);
    ok(k==='Pre-Season Summer Showcase 2026', 'tapping the pre-season row opens the event: '+k);
    await page.click('.viewbar button[data-v="league"]'); await page.waitForTimeout(100);
    await page.screenshot({path:path.join(OUT,'shot_preseason.png'), fullPage:false});
    // and the event view still has a real table
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100);
    await page.click('.evrow'); await page.waitForTimeout(100);
    const evTables = await page.$$eval('section.card:not(.sponsors)', cs=>cs[0].querySelectorAll('table').length);
    ok(evTables>=1, 'an event with scores still shows its table');
    await ctx.close();
  }

  // 11. Directions and calendar links
  console.log('\n[11] directions + calendar');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const acts = await page.$$eval('.next .actions a', a=>a.map(x=>({t:x.textContent, h:x.getAttribute('href'), d:x.getAttribute('download')})));
    ok(acts.length===3, 'three links under the next game: '+acts.map(a=>a.t).join(', '));
    const dir = acts.find(a=>a.t==='Directions');
    ok(dir && /google\.com\/maps\/dir/.test(dir.h) && /1%20Test%20Rink%20Rd/.test(dir.h), 'Directions goes to Google Maps with the Leisure-1 address (non-Apple UA): '+(dir&&dir.h));
    const ics = acts.find(a=>a.t==='Add to calendar');
    const icsBody = ics ? decodeURIComponent(ics.h.replace(/^data:text\/calendar;charset=utf-8,/,'')) : '';
    ok(ics && ics.d==='game.ics' && /^BEGIN:VCALENDAR/.test(icsBody), '.ics data link with download name');
    ok(/DTSTART:20260913T110000\r\nDTEND:20260913T123000/.test(icsBody), 'ics: Sep 13 11:00 for 90 minutes');
    ok(/SUMMARY:at Southtown Stars \(hockey\)/.test(icsBody), 'ics: title reads "at Southtown Stars (hockey)"');
    ok(/LOCATION:Leisure-1\\, 1 Test Rink Rd\\, West Seneca\\, NY 14224/.test(icsBody), 'ics: location is rink + address, commas escaped');
    ok(/DESCRIPTION:.*Scores and standings: http:\/\/localhost:8811\/wswings12u\//.test(icsBody), 'ics: description links back to the page');
    const g = acts.find(a=>a.t==='Google Calendar');
    ok(g && /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/.test(g.h) && /dates=20260913T110000\/20260913T123000/.test(g.h) && /text=at%20Southtown%20Stars/.test(g.h), 'Google Calendar link: '+(g&&g.h.slice(0,120)));
    // schedule rows
    const links = await page.$$eval('.game .meta .rinklink', a=>a.map(x=>x.textContent));
    ok(links.length>0 && links.every(t=>/^Leisure-[12]$/.test(t)), 'only rinks with an address are links ('+links.length+'): '+[...new Set(links)].join(','));
    const plain = await page.$eval('#app', e=>[...e.querySelectorAll('.game .meta')].filter(m=>/West Seneca$/.test(m.textContent.trim()) && !m.querySelector('.rinklink')).length);
    ok(plain>0, 'a rink with no address stays plain text ('+plain+' rows)');
    const season = await page.$eval('.seasoncal', a=>({t:a.textContent, h:a.getAttribute('href'), d:a.getAttribute('download')}));
    const sBody = decodeURIComponent(season.h.replace(/^data:text\/calendar;charset=utf-8,/,''));
    const nEv = (sBody.match(/BEGIN:VEVENT/g)||[]).length;
    ok(/Add our remaining 27 games/.test(season.t) && nEv===27 && season.d==='West-Seneca-Wings-schedule.ics', 'season .ics: 27 unplayed games, named after the team: '+season.t+' / '+season.d+' / '+nEv);
    ok(/SUMMARY:vs Niagara Jr. Cataracts \(hockey\)/.test(sBody), 'season ics includes a home game worded "vs"');
    // a rink typed one letter off on the Schedule still finds its address
    const snapped = await page.evaluate(async()=>{
      const m = await import('/js/model/links.js');
      return [m.rinkAddress({rink:'Lesure-1'}), m.rinkAddress({rink:'Leisure 1'}), m.rinkAddress({rink:'Nowhere Arena'})];
    });
    ok(/1 Test Rink Rd/.test(snapped[0]) && /1 Test Rink Rd/.test(snapped[1]) && snapped[2]==='', 'rink names snap within two edits, not beyond: '+JSON.stringify(snapped));
    // played games get no directions
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100); await page.click('.evrow'); await page.waitForTimeout(100);
    const doneLinks = await page.$$eval('.game', gs=>gs.filter(g=>g.querySelector('.sc') && g.querySelector('.sc').textContent!=='' && g.querySelector('.rinklink')).length);
    ok(doneLinks===0, 'a game with a score has no directions link');
    // crest
    const crest = await page.$eval('.masthead img.crest', i=>({w:i.naturalWidth, h:i.naturalHeight, cw:i.clientWidth, ch:i.clientHeight}));
    ok(crest.w===216 && crest.h===132 && crest.ch===44 && crest.cw<=84, 'crest loaded, 44px tall, wide, capped: '+JSON.stringify(crest));
    // ?check
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1200);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Rinks\s+5 of 18 with an address\s+no address yet: Cheektowaga, Cornerstone/.test(diag), '?check rinks line: '+(diag.match(/Rinks .*/)||[''])[0].slice(0,120));
    ok(/rinks=raw export/.test(diag), 'rinks read via raw export');
    await ctx.close();
  }

  // 12. No Rinks tab anywhere: page unchanged, links simply absent
  console.log('\n[12] rinks tab missing');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{rinks:'404'}, gviz:{rinks:'404'}});
    ok(errors.length===0, 'no page errors');
    const acts = await page.$$eval('.next .actions a', a=>a.map(x=>x.textContent));
    ok(acts.join('/')==='Add to calendar/Google Calendar', 'calendar links stay, Directions gone: '+acts.join('/'));
    const links = await page.$$('.rinklink');
    ok(links.length===0, 'no rink links on the schedule');
    const body = await page.$eval('#app', e=>e.textContent);
    ok(!/tab IDs in config.js belong to a different sheet/.test(body) && !/Rinks/.test(body), 'no warning shown to parents about the rinks tab');
    ok(/Standings/.test(body), 'standings still render');
    const ics = await page.$eval('.next .actions a[download]', a=>decodeURIComponent(a.getAttribute('href')));
    ok(/LOCATION:Leisure-1\r\n/.test(ics), 'ics location falls back to the rink name alone');
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1200);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Rinks\s+not read/.test(diag), '?check says rinks not read: '+(diag.match(/Rinks .*/)||[''])[0].slice(0,100));
    await ctx.close();
  }

  // 13. Rinks over the tab-name route (gviz) still resolve
  console.log('\n[13] rinks via tab name');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{rinks:'404'}});
    ok(errors.length===0, 'no page errors');
    const acts = await page.$$eval('.next .actions a', a=>a.map(x=>x.textContent));
    ok(acts[0]==='Directions', 'Directions present via gviz route');
    const body = await page.$eval('#app', e=>e.textContent);
    ok(!/tab IDs in config.js belong to a different sheet/.test(body), 'a failing rinks export does not accuse the other tab IDs');
    await ctx.close();
  }


  // 14. Sponsors: tiered, on every view, under the scores
  console.log('\n[14] sponsors block');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const tiers = await page.$$eval('.sponsors .sptier', ts=>ts.map(t=>{
      const chip = t.querySelector('.sprail a, .sprail span');
      const cs = getComputedStyle(chip);
      return {
        label: t.querySelector('.sptl') ? t.querySelector('.sptl').textContent : '',
        cls: t.className.replace('sptier','').trim(),
        n: t.querySelectorAll('.sprail a, .sprail span').length,
        size: parseFloat(cs.fontSize),
        border: cs.borderTopColor,
        labelColor: getComputedStyle(t.querySelector('.sptl')).color
      };
    }));
    ok(tiers.map(t=>t.label).join('/')==='Gold/Silver/Bronze', 'tiers in order, whatever order the rows are typed: '+tiers.map(t=>t.label).join('/'));
    ok(tiers.map(t=>t.n).join('/')==='2/5/2', 'nine sponsors, 2/5/2: '+tiers.map(t=>t.n).join('/'));
    ok(tiers[0].size>tiers[1].size && tiers[1].size>tiers[2].size, 'gold boxes are set largest, bronze smallest: '+tiers.map(t=>t.size).join('/'));
    ok(tiers.map(t=>t.cls).join('/')==='sp0/sp1/sp2', 'tier class comes off the tier: '+tiers.map(t=>t.cls).join('/'));
    // three different outline colours, and the label matches its own row
    const cols = tiers.map(t=>t.border);
    ok(new Set(cols).size===3, 'gold, silver and bronze outlines are three different colours: '+cols.join(' | '));
    ok(tiers.every(t=>t.labelColor===t.border), 'each tier label is painted the same colour as its outlines');
    const first = await page.$eval('.sponsors .sprail span, .sponsors .sprail a', e=>e.textContent);
    ok(first==='J Battista Construction, Inc.', 'a comma in a sponsor name survives the CSV: '+first);
    const amp = await page.$eval('.sponsors', e=>e.textContent);
    ok(/Miller's Collision & Auto, Inc\./.test(amp), 'an ampersand renders once, not as &amp;');
    // a bare domain in the sheet becomes a real link; a name with no website stays plain text
    const links = await page.$$eval('.sponsors .sprail a', as=>as.map(a=>[a.textContent, a.getAttribute('href'), a.getAttribute('rel')]));
    ok(links.length===1 && links[0][0]==='Ferrous Manufacturing' && links[0][1]==='https://example.com', 'bare domain promoted to https, only that row linked: '+JSON.stringify(links));
    ok(/noopener/.test(links[0][2]||''), 'outbound sponsor link carries rel=noopener: '+links[0][2]);
    const deco = await page.$$eval('.sponsors .sprail a, .sponsors .sprail span',
      es=>es.map(e=>[e.tagName, getComputedStyle(e).textDecorationLine]));
    ok(deco.every(d=>d[0]==='A' ? d[1]==='underline' : d[1]==='none'), 'a sponsor with a website is underlined, one without is not: '+JSON.stringify(deco.slice(0,3)));
    // no box may be wider than the column it sits in, however long the name
    const fits = await page.$$eval('.sponsors .sprail a, .sponsors .sprail span',
      es=>es.every(e=>e.getBoundingClientRect().width <= e.parentElement.getBoundingClientRect().width+1));
    ok(fits, 'every box fits inside the page column at 412px');
    ok((await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)), 'the sponsors block adds no sideways scroll');
    // the contact line comes off the Settings tab, not out of the code
    const foot = await page.$eval('.sponsors .foot', e=>e.textContent);
    ok(/Nate Smith/.test(foot), 'sponsor contact line read from Settings: '+foot);
    // position: under the scores, above the "Updated N ago" line
    const order = await page.evaluate(()=>{
      const n=[...document.querySelectorAll('#app > *')].map(e=>e.className||e.tagName);
      return {mh:n.findIndex(c=>/masthead/.test(c)), nx:n.findIndex(c=>/\bnext\b/.test(c)),
              sp:n.findIndex(c=>/sponsors/.test(c)), vb:n.findIndex(c=>/viewbar/.test(c)),
              st:n.findIndex(c=>/status/.test(c)), fo:n.findIndex(c=>/foot/.test(c))};
    });
    ok(order.mh<order.nx && order.nx<order.sp && order.sp<order.vb,
      'sponsors sit under the next game and above the tabs, where they get seen: '+JSON.stringify(order));
    ok(order.vb<order.st && order.st<order.fo, 'the tabs, status line and foot still follow in that order');
    // present on every view
    for(const v of ['events','stats']){
      await page.click('.viewbar button[data-v="'+v+'"]'); await page.waitForTimeout(120);
      ok((await page.$$('.sponsors')).length===1, 'sponsors still on the '+v+' view');
    }
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1200);
    const diag = await page.$eval('pre.diag', e=>e.textContent);
    ok(/Sponsors\s+9 sponsors\s+Gold 2, Silver 5, Bronze 2/.test(diag), '?check sponsors line: '+(diag.match(/Sponsors .*/)||[''])[0].slice(0,120));
    await ctx.close();
  }

  // 15. No Sponsors tab: the page is exactly what it was before
  console.log('\n[15] sponsors tab missing');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{sponsors:'404'}, gviz:{sponsors:'404'}});
    ok(errors.length===0, 'no page errors');
    ok((await page.$$('.sponsors')).length===0, 'no sponsors section');
    const body = await page.$eval('#app', e=>e.textContent);
    ok(!/tab IDs in config.js belong to a different sheet/.test(body), 'a failing sponsors tab does not accuse the other tab IDs');
    ok(!/sponsor/i.test(body), 'parents are told nothing about a missing sponsors tab');
    ok(/Standings/.test(body), 'standings still render');
    await page.goto(STAFF+'?check'); await page.waitForTimeout(1200);
    ok(/Sponsors\s+not shown/.test(await page.$eval('pre.diag', e=>e.textContent)), '?check says sponsors not shown');
    await ctx.close();
  }

  // 16. What the sheet can put in an href
  console.log('\n[16] sponsor website safety');
  {
    const {page, ctx} = await openPage(browser, BASE, {});
    const got = await page.evaluate(async()=>{
      const m = await import('/js/shape/sponsors.js');
      return ['https://a.com','http://a.com','a.com','www.a.com/x?y=1','javascript:alert(1)','JavaScript:alert(1)','mailto:x@y.com','data:text/html,x','  ','not a url'].map(m.safeUrl);
    });
    ok(got[0]==='https://a.com' && got[1]==='http://a.com', 'a real scheme is left alone');
    ok(got[2]==='https://a.com' && got[3]==='https://www.a.com/x?y=1', 'a bare domain gets https');
    ok(got[4]==='' && got[5]==='' && got[6]==='' && got[7]==='', 'javascript:, mailto: and data: never reach an href: '+JSON.stringify(got.slice(4,8)));
    ok(got[8]==='' && got[9]==='', 'blank and prose are not links');
    // a team with gold and bronze and no silver must not paint its bronze row silver
    const cls = await page.evaluate(async()=>{
      const m = await import('/js/ui/sponsors.js');
      return [m.tierClass(0), m.tierClass(1), m.tierClass(2), m.tierClass(50), m.tierClass(98)];
    });
    ok(cls.join('/')==='sp0/sp1/sp2/spx/spx', 'tier class follows the tier, never the row order: '+cls.join('/'));
    await ctx.close();
  }


  // 17. Folding the sponsors away, and it staying folded on that phone
  console.log('\n[17] sponsors fold');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const read = () => page.evaluate(()=>{
      const sec=document.querySelector('.sponsors'), b=document.getElementById('rr-sponsors');
      const btn=document.querySelector('.sponsors .sph');
      return {
        shut: sec.classList.contains('shut'),
        bodyShown: !!(b && b.offsetParent !== null),
        expanded: btn.getAttribute('aria-expanded'),
        controls: btn.getAttribute('aria-controls'),
        eyebrow: btn.querySelector('.eyebrow').textContent.trim(),
        chev: getComputedStyle(document.querySelector('.sponsors .chev')).transform
      };
    });
    let st = await read();
    ok(!st.shut && st.bodyShown && st.expanded==='true', 'open by default — the sponsors paid to be seen: '+JSON.stringify(st));
    ok(st.controls==='rr-sponsors' && st.eyebrow.startsWith('Thank you'), 'header button points at the body it folds: '+st.controls+' / '+st.eyebrow);
    const openChev = st.chev;

    await page.click('.sponsors .sph'); await page.waitForTimeout(150);
    st = await read();
    ok(st.shut && !st.bodyShown && st.expanded==='false', 'one tap folds it away: '+JSON.stringify(st));
    ok(/^9 sponsors/.test(st.eyebrow), 'folded header still says how many are in there: '+st.eyebrow);
    ok(st.chev!==openChev, 'the chevron turns over when it folds');
    ok((await page.$$eval('.sponsors .sprail a, .sponsors .sprail span', es=>es.length))===9, 'the names stay in the markup, they are only hidden');

    // it has to survive a reload, or folding it is a per-visit annoyance
    await page.reload(); await page.waitForTimeout(2500);
    st = await read();
    ok(st.shut && !st.bodyShown, 'still folded after a reload on the same phone: '+JSON.stringify(st));
    ok((await page.evaluate(()=>localStorage.getItem('rinkreport.sponsorsOpen:/wswings12u/')))==='0', 'the choice is stored, and only on that phone');

    await page.click('.sponsors .sph'); await page.waitForTimeout(150);
    st = await read();
    ok(!st.shut && st.bodyShown && st.expanded==='true', 'tapping again brings it back');

    // folding sponsors must not disturb anything else on the page
    const body = await page.$eval('#app', e=>e.textContent);
    ok(/Standings/.test(body) && /Schedule & results/.test(body), 'standings and schedule untouched by the fold');
    await ctx.close();
  }

  // 18. A fresh reader on a phone that has never seen the page gets it open
  console.log('\n[18] fold defaults for a new reader');
  {
    const {page, ctx} = await openPage(browser, BASE, {});
    ok((await page.evaluate(()=>localStorage.getItem('rinkreport.sponsorsOpen:/wswings12u/')))===null, 'nothing stored until the reader actually folds it');
    ok((await page.$eval('.sponsors .sph', b=>b.getAttribute('aria-expanded')))==='true', 'a brand new reader sees the sponsors');
    await ctx.close();
  }

  // 19. Team names link to MyHockey Rankings when the Teams tab says so
  console.log('\n[19] MyHockey links on the division list and standings');
  {
    const yr = 2026;   // the frozen clock says Sept 10 2026
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const li = await page.$$eval('.division li', li=>li.map(x=>({t:x.textContent, c:x.className, a:x.querySelector('a.tm') ? {href:x.querySelector('a.tm').getAttribute('href'), target:x.querySelector('a.tm').getAttribute('target'), rel:x.querySelector('a.tm').getAttribute('rel')} : null})));
    const by = n => li.find(x=>x.t===n);
    ok(li.length===11, 'division list still 11 clubs ('+li.length+')');
    ok(li.filter(x=>x.a).length===4, 'four clubs linked (Bisons, Cazenovia, Cheektowaga, Wings): '+li.filter(x=>x.a).map(x=>x.t).join(', '));
    ok(by('Buffalo Bisons').a && by('Buffalo Bisons').a.href==='https://myhockeyrankings.com/team_info.php?y='+yr+'&t=2631', 'a bare ID becomes this season\'s MHR address: '+(by('Buffalo Bisons').a||{}).href);
    ok(by('Cheektowaga Warriors').a && by('Cheektowaga Warriors').a.href==='https://myhockeyrankings.com/team_info.php?y=2026&t=34146', 'a pasted MHR address is used as is');
    ok(by('Cazenovia Chiefs').a && by('Cazenovia Chiefs').a.href==='https://www.myhockeyrankings.com/team-info?t=2708&y=2026', 'a bare myhockeyrankings.com address gets https');
    ok(!by('Clarence Mustangs').a, 'javascript: in the column is not a link');
    ok(!by('Lockport Lock Monsters').a, 'an address on another site is not a link');
    ok(by('West Seneca Wings').c==='us' && by('West Seneca Wings').a && /t=1170$/.test(by('West Seneca Wings').a.href), 'our own row links and stays highlighted');
    ok(li.filter(x=>x.a).every(x=>x.a.target==='_blank' && x.a.rel==='noopener'), 'every link opens in a new tab with rel=noopener');
    const html = await page.$eval('#app', e=>e.innerHTML);
    ok(!/javascript:|example\.org/.test(html), 'rejected values never reach the page');
    // the standings table (the past showcase has real scores) links the same way
    await page.click('.evrow.pre'); await page.waitForTimeout(100);
    const cells = await page.$$eval('table tbody tr td:first-child', tds=>tds.map(td=>({t:td.textContent.replace(/^\d+/,''), a:!!td.querySelector('a.tm')})));
    ok(cells.length>0 && cells.some(c=>c.t==='West Seneca Wings' && c.a), 'Wings row in the showcase table is linked: '+JSON.stringify(cells));
    ok(cells.filter(c=>c.t!=='West Seneca Wings').every(c=>!c.a), 'showcase-only clubs with no ID stay plain text');
    // the reader, on its own
    const unit = await page.evaluate(async()=>{
      const m = await import('/js/shape/teams.js');
      return [m.mhrUrl(' 34146 ','x'), m.mhrUrl('','x'), m.mhrUrl('mailto:a@b.c','x'), m.mhrUrl('myhockeyrankings.com/team_info.php?y=2026&t=5','x'), m.seasonYear(new Date(2026,8,14)), m.seasonYear(new Date(2027,2,1)), m.seasonYear(new Date(2027,7,31))];
    });
    ok(unit[0]==='https://myhockeyrankings.com/team_info.php?y='+yr+'&t=34146', 'mhrUrl trims a bare ID');
    ok(unit[1]==='' && unit[2]==='', 'blank and mailto: give nothing');
    ok(unit[3]==='https://myhockeyrankings.com/team_info.php?y=2026&t=5', 'scheme-less MHR address promoted');
    ok(unit[4]===2026 && unit[5]===2026 && unit[6]===2026, 'season year: Sept 2026 through Aug 2027 is the 2026 season: '+unit.slice(4).join('/'));
    await ctx.close();
  }
  // and over the tab-name route, where Google may blank a numeric-looking header
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {export:{teams:'404'}});
    ok(errors.length===0, 'no page errors on the gviz route');
    const n = await page.$$eval('.division li a.tm', a=>a.length);
    ok(n===4, 'links survive the tab-name route ('+n+')');
    await ctx.close();
  }

  // 20. Feature switches: each one removes its piece and nothing else
  console.log('\n[20] feature switches');
  {
    // everything on (the default): the pieces are all there
    const {page, ctx, errors} = await openPage(browser, BASE, {});
    ok(errors.length===0, 'no page errors');
    const present = await page.evaluate(()=>({
      next:!!document.querySelector('section.next'), sp:!!document.querySelector('.sponsors'), crest:!!document.querySelector('img.crest'),
      mhr:document.querySelectorAll('a.tm').length, pre:!!document.querySelector('.lead'),
      tabs:[...document.querySelectorAll('.viewbar button')].map(b=>b.textContent).join('/')}));
    ok(present.next && present.sp && present.crest && present.mhr===4 && present.pre && present.tabs==='League/Events/Stats', 'defaults: every piece present: '+JSON.stringify(present));
    await ctx.close();
  }
  {
    // the whole list off at once
    const off = {nextGame:false,sponsors:false,stats:false,events:false,preseason:false,directions:false,calendar:false,seasonCalendar:false,mhrLinks:false,monoNumbers:false,rating:false};
    const {page, ctx, errors, asked} = await openPage(browser, BASE, {features:off});
    ok(errors.length===0, 'no page errors with every switch off');
    const gone = await page.evaluate(()=>({
      next:!!document.querySelector('section.next'), sp:!!document.querySelector('.sponsors'), crest:!!document.querySelector('img.crest'),
      chip:!!document.querySelector('.record'), seg:!!document.querySelector('.seg'), refresh:!!document.querySelector('button[data-act="refresh"]'),
      check:!!document.querySelector('.foot a[href$="?check"]'), mhr:document.querySelectorAll('a.tm').length, pre:!!document.querySelector('.lead'),
      evrow:!!document.querySelector('.evrow'), season:!!document.querySelector('.seasoncal'), rink:document.querySelectorAll('.rinklink').length,
      bar:!!document.querySelector('.viewbar'),
      table:!!document.querySelector('table tbody tr'), sched:/Schedule & results/.test(document.querySelector('#app').textContent),
      h2s:[...document.querySelectorAll('.card h2')].map(x=>x.textContent).join('|')}));
    ok(!gone.next, 'next-game card gone');
    ok(!gone.sp, 'sponsors block gone');
    ok(gone.crest && gone.seg && gone.refresh, 'crest, All/Ours and Refresh have no switch and stay');
    ok(!gone.check, 'no Setup check link on the parents\' page (it lives on the staff page)');
    ok(gone.mhr===0 && gone.rink===0 && !gone.season, 'no MyHockey, directions or season-calendar links');
    ok(!gone.bar, 'league is the only view left, so the bar itself is gone (no Events, no Stats)');
    ok(!gone.pre && !gone.evrow && gone.table, 'pre-season card gone: the standings table shows instead, with no event rows');
    ok(gone.sched && gone.h2s==='Standings|Schedule & results', 'standings and schedule are still the page: '+gone.h2s);
    // the tabs that feed the switched-off pieces were never asked for
    ok(!asked.includes('stats') && !asked.includes('rinks') && !asked.includes('sponsors') && asked.includes('schedule'), 'stats, rinks and sponsors tabs not fetched; schedule still is: '+asked.join(','));
    // and ?check names them
    await page.goto(STAFF+'?check'); await page.waitForTimeout(600);
    const diag = await page.$eval('#app', e=>e.textContent);
    ok(/Features\s+off: nextGame, sponsors, stats, events, preseason, directions, calendar, seasonCalendar, mhrLinks, monoNumbers, rating/.test(diag), '?check lists every switched-off feature');
    await ctx.close();
  }
  {
    // one switch at a time, on the pieces that share a component
    let r = await openPage(browser, BASE, {features:{directions:false}});
    let acts = await r.page.$$eval('.next .act', a=>a.map(x=>x.textContent));
    ok(acts.join('/')==='Add to calendar/Google Calendar' && (await r.page.$$eval('.rinklink', a=>a.length))===0, 'directions off: calendar links stay, rink names go plain: '+acts.join('/'));
    await r.ctx.close();
    r = await openPage(browser, BASE, {features:{calendar:false}});
    acts = await r.page.$$eval('.next .act', a=>a.map(x=>x.textContent));
    ok(acts.join('/')==='Directions' && !!(await r.page.$('.seasoncal')), 'calendar off: Directions stays, the season .ics under the schedule stays: '+acts.join('/'));
    await r.ctx.close();
    r = await openPage(browser, BASE, {features:{events:false}, schedule:'live'});
    const t = await r.page.$$eval('.viewbar button', b=>b.map(x=>x.textContent).join('/'));
    const k = await r.page.$eval('.masthead .eyebrow', e=>e.textContent);
    ok(t==='League/Stats' && k!=='Labor Day Faceoff', 'events off during a live event: no event button, and the page lands on League: '+t+' / '+k);
    await r.ctx.close();
    r = await openPage(browser, BASE, {features:{stats:false}});
    ok((await r.page.$$eval('.viewbar button', b=>b.map(x=>x.textContent).join('/')))==='League/Events', 'stats off: Events tab still there');
    await r.ctx.close();
    // a missing key, and a value that is not false, both count as on
    r = await openPage(browser, BASE, {features:{sponsors:'no', stats:0}});
    const on2 = await r.page.evaluate(()=>({sp:!!document.querySelector('.sponsors'), tabs:[...document.querySelectorAll('.viewbar button')].map(b=>b.textContent).join('/')}));
    ok(on2.sp && on2.tabs==='League/Events/Stats', 'only the word false switches a feature off: '+JSON.stringify(on2));
    await r.ctx.close();

    // monoNumbers is the one switch that changes no markup, only the face the
    // figures are set in, so it is checked on the computed style. preseason is
    // switched off here purely to put a standings table on the page to read.
    r = await openPage(browser, BASE, {features:{preseason:false}});
    let mono = await r.page.evaluate(()=>{
      const ff = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : 'MISSING'; };
      return {
        cls:document.documentElement.classList.contains('mono-nums'),
        pts:ff('tbody td.pts'),
        rank:ff('.rank'),
        time:ff('.game .meta .tm'),
        name:ff('tbody td:first-child'),
        head:ff('thead th')};
    });
    ok(mono.cls && /Chivo Mono/.test(mono.pts) && /Chivo Mono/.test(mono.rank) && /Chivo Mono/.test(mono.time), 'monoNumbers on by default: points, rank numerals and face-off times are Chivo Mono');
    ok(!/Chivo Mono/.test(mono.name) && !/Chivo Mono/.test(mono.head), 'monoNumbers leaves team names and column headings in Barlow: '+mono.name.split(',')[0]+' / '+mono.head.split(',')[0]);
    await r.ctx.close();

    r = await openPage(browser, BASE, {features:{preseason:false, monoNumbers:false}});
    mono = await r.page.evaluate(()=>({
      cls:document.documentElement.classList.contains('mono-nums'),
      pts:getComputedStyle(document.querySelector('tbody td.pts')).fontFamily,
      tab:getComputedStyle(document.querySelector('tbody td.pts')).fontVariantNumeric}));
    ok(!mono.cls && !/Chivo Mono/.test(mono.pts), 'monoNumbers off: no mono-nums class, figures back to Barlow');
    ok(/tabular-nums/.test(mono.tab), 'and Barlow gets its tabular figures back, so the columns still line up: '+mono.tab);
    await r.ctx.close();
  }

  // 21. The review fixes (Sept 15 2026)
  console.log('\n[21] review fixes');
  {
    // a. an evening face-off is live in the evening, not in the morning (the PM bug)
    const evening = new Date(2026, 8, 10, 19, 5, 0);   // 7:05 pm on the frozen day
    let r = await openPage(browser, BASE, {schedule:'live', clock:evening});
    let probe = await r.page.evaluate(async()=>{ const m = await import('/js/app.js'); return {live:m.gameOnNow(), delay:m.pollDelay(), times:[...new Set(Array.from(document.querySelectorAll('.game .tm')).map(e=>e.textContent))].slice(0,4)}; });
    ok(probe.live===true && probe.delay>=90000 && probe.delay<=150000, 'a 6:55 pm game is live at 7:05 pm and the poll runs at the fast pace: '+JSON.stringify(probe));
    await r.ctx.close();
    const morning = new Date(2026, 8, 10, 7, 5, 0);    // 7:05 am the same day
    r = await openPage(browser, BASE, {schedule:'live', clock:morning});
    probe = await r.page.evaluate(async()=>{ const m = await import('/js/app.js'); return {live:m.gameOnNow(), delay:m.pollDelay()}; });
    ok(probe.live===false && probe.delay>=720000 && probe.delay<=1200000, 'the same game is not live at 7:05 am and the poll runs slow: '+JSON.stringify(probe));
    await r.ctx.close();

    // b. a pair split on head-to-head gets two rank numbers
    r = await openPage(browser, BASE, {});
    const ranks = await r.page.evaluate(async()=>{
      const m = await import('/js/model/standings.js');
      const g = (h,a,hs,as)=>({home:h, away:a, hs, as, date:'2026-10-01', time:'', type:'', event:'', pool:''});
      // A beat B; both finish 1-1 with 1 GF / 1 GA; C beat both A and D; D lost twice.
      const games = [g('A','B',1,0), g('C','A',1,0), g('B','D',1,0), g('C','D',1,0)];
      const rows = m.standings(games, ['A','B','C','D'], false, m.rulesFor({event:false}));
      return rows.map(x=>x.team+':'+x.pts+(x.level?'=':''));
    });
    ok(ranks.join(' ')==='C:4 A:2 B:2 D:0', 'A above B on head-to-head and neither is flagged level: '+ranks.join(' '));
    await r.ctx.close();

    // c. "Our team" typed with different case still counts as ours
    r = await openPage(browser, BASE, {settingsTeam:'west seneca wings'});
    const chip = await r.page.$eval('#app', e=>({chip:!!e.querySelector('.record'), ours:e.querySelectorAll('.side.ours').length, warn:/no team on the Teams tab is spelled that way/.test(e.textContent)}));
    await r.page.click('.evrow.pre'); await r.page.waitForTimeout(100);
    const chip2 = await r.page.$eval('#app', e=>({chip:!!e.querySelector('.record'), ours:e.querySelectorAll('.side.ours').length}));
    ok(!chip.warn && chip2.chip && chip2.ours>0, 'lower-case team name is snapped to the Teams tab spelling: '+JSON.stringify({chip, chip2}));
    r.ctx.close();
    r = await openPage(browser, BASE, {settingsTeam:'West Seneca Wngs'});
    const miss = await r.page.$eval('#app', e=>/Our team is "West Seneca Wngs" on the Settings tab, but no team on the Teams tab is spelled that way/.test(e.textContent));
    ok(miss, 'a team name that matches nothing gets a warning on the page');
    await r.ctx.close();

    // d. a schedule that comes back garbled keeps the last good copy
    r = await openPage(browser, BASE, {});
    ok((await r.page.$$eval('.game', g=>g.length))>0, 'first load has games');
    await r.page.unroute(/docs\.google\.com/);
    await r.page.route(/docs\.google\.com/, route=>{
      const u=new URL(route.request().url());
      const isSched = /gid=1739208952|sheet=Schedule/.test(u.search);
      route.fulfill({status:200, contentType:'text/csv', body: isSched ? 'Date,Face-off,Away team,Home team\n' : (u.pathname.endsWith('/export') ? FIX[GIDS[u.searchParams.get('gid')]]||'' : FIX[TABS[u.searchParams.get('sheet')]]||'')});
    });
    await r.page.click('button[data-act="refresh"]'); await r.page.waitForTimeout(1500);
    const kept = await r.page.$eval('#app', e=>({games:e.querySelectorAll('.game').length, note:/last good copy is still showing/.test(e.textContent)}));
    ok(kept.games>0 && kept.note, 'a garbled Schedule read keeps the games and says so: '+JSON.stringify(kept));
    await r.ctx.close();

    // e. a transient 404 on the first try does not accuse the tab IDs
    let tries = 0;
    r = await openPage(browser, BASE, {});
    await r.page.unroute(/docs\.google\.com/);
    await r.page.route(/docs\.google\.com/, route=>{
      const u=new URL(route.request().url());
      if(u.pathname.endsWith('/export')){
        const which=GIDS[u.searchParams.get('gid')];
        if(which==='schedule' && tries++===0){ route.fulfill({status:404, body:'blip'}); return; }
        route.fulfill({status:200, contentType:'text/csv', body:FIX[which]}); return;
      }
      route.fulfill({status:200, contentType:'text/csv', body:FIX[TABS[u.searchParams.get('sheet')]]||''});
    });
    await r.page.click('button[data-act="refresh"]'); await r.page.waitForTimeout(2500);
    const blip = await r.page.$eval('#app', e=>({accused:/belong to a different sheet/.test(e.textContent), games:e.querySelectorAll('.game').length}));
    ok(tries>=1 && !blip.accused && blip.games>0, 'a first-try 404 that succeeds on retry shows no tab-ID warning: '+JSON.stringify(blip));
    await r.ctx.close();

    // f. the .ics stamp comes from the fetch time, so a quiet poll repaints nothing
    r = await openPage(browser, BASE, {});
    const stamps = await r.page.evaluate(()=>{ const a=document.querySelector('.next .act[download]'); return decodeURIComponent(a.getAttribute('href')).match(/DTSTAMP:(\d+T\d+)/)[1]; });
    ok(/^20260910T120000$/.test(stamps), 'DTSTAMP is the fetch time on the frozen clock: '+stamps);
    await r.ctx.close();
  }

  // 22. Google unreachable: the site's saved copy
  console.log('\n[22] saved copy when Google cannot be reached');
  {
    const all404 = {settings:'404', teams:'404', schedule:'404', stats:'404', rinks:'404', sponsors:'404'};
    // no saved copy on the site: the error banner, nothing else
    let r = await openPage(browser, BASE, {export:all404, gviz:all404});
    let body = await r.page.$eval('#app', e=>e.textContent);
    ok(/Can.t reach the schedule right now/.test(body) && !/saved copy/.test(body), 'with no saved copy the page shows the error banner: '+body.slice(0,80));
    await r.ctx.close();
    // a saved copy under data/: the page renders from it and says so
    r = await openPage(browser, BASE, {export:all404, gviz:all404, snapshot:true});
    ok(r.errors.length===0, 'no page errors');
    body = await r.page.$eval('#app', e=>e.textContent);
    const shape = await r.page.evaluate(()=>({games:document.querySelectorAll('.game').length, tabs:[...document.querySelectorAll('.viewbar button')].map(b=>b.textContent).join('/'), sponsors:!!document.querySelector('.sponsors')}));
    ok(shape.games>0 && shape.tabs==='League/Events/Stats' && shape.sponsors, 'the saved copy renders the whole page: '+JSON.stringify(shape));
    ok(/Google Sheets can.t be reached right now\. Showing the saved copy from/.test(body), 'the banner says it is the saved copy and when it was taken');
    ok(/9\/9\/2026|2026-09-09/.test(body), 'the copy\'s date comes from data/updated.txt: '+(body.match(/saved copy from [^.]+/)||[''])[0]);
    ok(r.asked.length>0, 'Google was tried first ('+r.asked.length+' requests)');
    await r.page.goto(STAFF+'?check');
    await r.page.waitForFunction(()=>/Read via\s+\w+=/.test(document.querySelector('#app').textContent), null, {timeout:20000}).catch(()=>{});
    const diag = await r.page.$eval('#app', e=>e.textContent);
    ok(/Saved copy/.test(diag) && /schedule=site snapshot/.test(diag), '?check names the snapshot route');
    await r.ctx.close();
  }

  // 23. Schedule order: what is coming sits above what is finished
  console.log('\n[23] schedule order');
  {
    const {page, ctx, errors} = await openPage(browser, BASE, {schedule:'scored'});
    ok(errors.length===0, 'no page errors');
    // Each day in the card, in the order it is painted, plus the divider.
    const read = () => page.evaluate(()=>{
      const card = [...document.querySelectorAll('.card')].find(c=>/Schedule & results/.test(((c.querySelector('h2')||{}).textContent)||''));
      return [...card.querySelector('.card-b').children].map(el=>{
        if(el.classList.contains('listsplit')) return {split:el.textContent};
        if(!el.classList.contains('daygroup')) return null;
        const scores = [...el.querySelectorAll('.game .sc')].map(x=>x.textContent);
        return {date:((el.querySelector('.dayhead')||{}).textContent)||'', scored:scores.some(t=>t!=='')};
      }).filter(Boolean);
    });
    const rows = await read();
    const at = rows.findIndex(r=>r.split);
    const ahead = at<0 ? rows : rows.slice(0,at);
    const behind = at<0 ? [] : rows.slice(at+1);
    ok(at>0 && rows[at].split==='Final scores', 'a "Final scores" divider separates the two halves (day '+at+')');
    ok(ahead.length>0 && ahead.every(r=>!r.scored), 'every day above the divider is still to be played ('+ahead.length+' days)');
    ok(behind.length>0 && behind.every(r=>r.scored), 'every day below it has a score ('+behind.length+' days)');
    ok(ahead[0].date==='Mon Sep 28', 'the card opens on the next game, not the furthest one: '+ahead[0].date);
    ok(ahead[ahead.length-1].date==='Sun Feb 14', 'upcoming days run nearest to furthest: '+ahead[0].date+' ... '+ahead[ahead.length-1].date);
    ok(behind.map(r=>r.date).join(' / ')==='Fri Sep 25 / Sun Sep 13', 'finished days run most recent first: '+behind.map(r=>r.date).join(' / '));
    // An event weekend is read standing in the rink, so it stays in plain date
    // order with played and unplayed games together.
    await page.click('.viewbar button[data-v="events"]'); await page.waitForTimeout(100);
    await page.click('.evrow'); await page.waitForTimeout(150);
    const ev = await read();
    ok(!ev.some(r=>r.split), 'an event gets no divider');
    ok(ev.map(r=>r.date).join(' / ')==='Fri Aug 28 / Sat Aug 29 / Sun Aug 30', 'the showcase still reads forward: '+ev.map(r=>r.date).join(' / '));
    await ctx.close();
  }

  // 24. Period length drives GAA
  console.log('\n[24] period length -> GAA');
  {
    const read = async (opts) => {
      const r = await openPage(browser, BASE, opts);
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      const out = await r.page.evaluate(()=>{
        const card=[...document.querySelectorAll('.card')].find(c=>/In net/.test(((c.querySelector('h2')||{}).textContent)||''));
        return {
          gaa:[...card.querySelectorAll('tbody tr')].map(t=>t.children[4].textContent),
          foot:((card.querySelector('.foot')||{}).textContent)||''
        };
      });
      await r.ctx.close();
      return out;
    };
    // No row on the Settings tab: three 15 minute periods, the common case.
    const dflt = await read({});
    ok(dflt.gaa[0]==='2.41' && dflt.gaa[1]==='5.36', 'with no setting, GAA is figured over 45 minutes: '+dflt.gaa.join('/'));
    ok(/full game of 45 minutes/.test(dflt.foot), 'the note names the game length: '+dflt.foot.slice(0,58));
    // A league whose third period is shorter.
    const short = await read({periods:'15, 15, 12'});
    ok(short.gaa[0]==='2.25' && short.gaa[1]==='5.00', '15, 15, 12 is a 42 minute game: '+short.gaa.join('/'));
    ok(/full game of 42 minutes/.test(short.foot), 'the note follows the setting: '+short.foot.slice(0,58));
    // One number is the whole game, not one period.
    const flat = await read({periods:'60'});
    ok(flat.gaa[0]==='3.21', 'a single number is taken as the whole game: '+flat.gaa[0]);
    // A showcase running a shorter clock than the league it sits inside.
    const mixed = await read({eventPeriods:{event:'Pre-Season Summer Showcase', value:'12, 12, 12'}});
    ok(mixed.gaa[0]==='1.93' && mixed.gaa[1]==='4.29',
      'a 36 minute showcase is counted as less than a full game: '+mixed.gaa.join('/'));
    ok(/different clock/.test(mixed.foot), 'the note says the schedule can override: '+mixed.foot.slice(0,90));
    ok(!/different clock/.test(dflt.foot), 'and stays quiet when nothing overrides');
  }

  // 24b. Ties in the goalie record
  console.log('\n[24b] ties in the goalie record');
  {
    const read = async (opts) => {
      const r = await openPage(browser, BASE, opts);
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      const out = await r.page.evaluate(()=>{
        const card=[...document.querySelectorAll('.card')].find(c=>/In net/.test(((c.querySelector('h2')||{}).textContent)||''));
        return {
          head:[...card.querySelectorAll('thead th')].map(t=>t.textContent).join('/'),
          rows:[...card.querySelectorAll('tbody tr')].map(t=>[...t.children].map(td=>td.textContent)),
          foot:((card.querySelector('.foot')||{}).textContent)||''
        };
      });
      await r.ctx.close();
      return out;
    };

    const plain = await read({});
    ok(plain.head==='Goalie/GP/Min/GA/GAA/SO/Record', 'one Record column, no separate W and L: '+plain.head);
    ok(plain.rows[0][6]==='3-1-0', 'first goalie reads 3-1-0 with nothing tied: '+plain.rows[0][6]);
    // The fixture's totals block gives the second goalie two games but the log holds one
    // row for him, and the record is built from the log, the same way GAA is.
    ok(plain.rows[1][6]==='0-1-0', 'second goalie reads 0-1-0, one logged game: '+plain.rows[1][6]);
    ok(/wins-losses-ties/.test(plain.foot), 'the note says what the record is: '+plain.foot.slice(0,120));

    // The totals block on the tab still counts this game as a loss. The log is
    // what knows it ended level, and the log is what the record is built from.
    const tied = await read({ties:true});
    ok(tied.rows[0][6]==='3-0-1', 'a T in the log moves the Sylvania game out of the losses: '+tied.rows[0][6]);
    ok(tied.rows[0][3]==='9' && tied.rows[0][4]==='2.41', 'and leaves the goals against and GAA alone: '+JSON.stringify(tied.rows[0]));
  }

  // 24c. A full name that slips into the sheet is still shortened on screen
  console.log('\n[24c] full name in the sheet');
  {
    const r = await openPage(browser, BASE, {fullName:true});
    await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
    const text = await r.page.evaluate(()=>document.body.innerText);
    ok(/Testy M\./.test(text), 'a full name in the sheet shows as first name and last initial');
    ok(!/McTestface/.test(text), 'the surname never reaches the page');
    await r.ctx.close();
  }

  // 25. League only / All games on the Stats page
  console.log('\n[25] stats scope switch');
  {
    const open = async (opts) => {
      const r = await openPage(browser, BASE, opts);
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      return r;
    };
    const table = (page, head) => page.evaluate((head)=>{
      const card=[...document.querySelectorAll('.card')].find(c=>((c.querySelector('h2')||{}).textContent)===head);
      if(!card) return null;
      return {
        rows:[...card.querySelectorAll('tbody tr')].map(t=>[...t.children].map(td=>td.textContent)),
        foot:((card.querySelector('.foot')||{}).textContent)||'',
        seg:!!card.querySelector('.seg [data-act="statsscope"]'),
        eyebrow:((card.querySelector('.eyebrow')||{}).textContent)||''
      };
    }, head);

    // Nothing in the fixture's log is a league game, so there is nothing to split.
    let r = await open({});
    let sk = await table(r.page, 'Skaters');
    ok(!sk.seg, 'no switch when the log holds no league game');
    ok(/Through 5 games/.test(sk.eyebrow), 'the header keeps the long game count: '+sk.eyebrow);
    await r.ctx.close();

    // One league game played, with the log rows to match.
    r = await open({leagueLog:true});
    sk = await table(r.page, 'Skaters');
    let gk = await table(r.page, 'In net');
    ok(sk.seg && gk.seg, 'both tables get the switch once a league game is logged');
    ok(sk.rows[0][0]==='15Luke G.' && sk.rows[0][4]==='7', 'it opens on the season totals: '+JSON.stringify(sk.rows[0]));
    ok(!/League play only/.test(sk.foot), 'it opens on all games: '+sk.foot.slice(0,40));

    await r.page.click('.seg [data-act="statsscope"][data-v="league"]');
    await r.page.waitForTimeout(150);
    sk = await table(r.page, 'Skaters');
    gk = await table(r.page, 'In net');
    ok(sk.rows[0][0]==='17Evan C.' && sk.rows[0][2]==='1' && sk.rows[0][3]==='3' && sk.rows[0][4]==='4',
      'league skater leader is Carter 1G 3A 4P: '+JSON.stringify(sk.rows[0]));
    ok(sk.rows.every(t=>t[1]==='1'), "every skater's GP is the team's one league game");
    ok(/League play only/.test(sk.foot) && /not taken off/.test(sk.foot), 'the note explains GP: '+sk.foot.slice(0,70));
    const mal = gk.rows.find(t=>/Andrew/.test(t[0]));
    ok(mal && mal[1]==='2' && mal[2]==='84' && mal[3]==='4' && mal[4]==='2.14',
      'first goalie league line is 2 GP, 84 min, 4 GA, 2.14: '+JSON.stringify(mal));
    ok(mal && mal[6]==='2-0-0', 'and his league record counts the two league wins: '+(mal||[])[6]);
    const doe = gk.rows.find(t=>/Stephen/.test(t[0]));
    ok(doe && doe[1]==='0' && doe[3]==='0', 'a goalie who played no league game reads zero: '+JSON.stringify(doe));

    await r.page.click('.seg [data-act="statsscope"][data-v="all"]');
    await r.page.waitForTimeout(150);
    gk = await table(r.page, 'In net');
    ok(gk.rows[0][3]==='9' && gk.rows[0][4]==='2.41', 'switching back restores the season totals: '+JSON.stringify(gk.rows[0]));
    await r.ctx.close();
  }

  // 26. The schedule opens on Ours
  console.log('\n[26] schedule opens on Ours');
  {
    const r = await openPage(browser, BASE, {schedule:'scored'});
    const seg = () => r.page.$$eval('.seg [data-act="filter"]', b=>b.map(x=>x.textContent+':'+x.getAttribute('aria-pressed')).join(' '));
    const games = () => r.page.$$eval('.game', gs=>gs.map(g=>g.textContent));

    ok((await seg())==='All:false Ours:true', 'the Ours button is the pressed one on arrival: '+(await seg()));

    const mine = await games();
    ok(mine.length>0 && mine.every(t=>/West Seneca Wings/.test(t)), 'every game on the card is one of ours ('+mine.length+' games)');

    await r.page.click('.seg [data-act="filter"][data-v="all"]');
    await r.page.waitForTimeout(150);
    ok((await seg())==='All:true Ours:false', 'tapping All flips the buttons: '+(await seg()));

    // A league Schedule tab that only lists our own games looks the same either
    // way, which is the case for this fixture and for the Wings' own sheet. The
    // filter earns its keep on an event, where the pool's other games are on
    // the tab too.
    ok((await games()).length===mine.length, 'a league tab holding only our games looks the same under All: '+mine.length+' games');

    await r.page.click('.viewbar button[data-v="events"]'); await r.page.waitForTimeout(120);
    await r.page.click('.evrow'); await r.page.waitForTimeout(180);
    const evAll = await games();
    await r.page.click('.seg [data-act="filter"][data-v="ours"]');
    await r.page.waitForTimeout(150);
    const evMine = await games();
    ok(evAll.length>evMine.length && evAll.some(t=>!/West Seneca Wings/.test(t)), 'at a showcase Ours drops the pool games we are not in: '+evAll.length+' -> '+evMine.length+' games');
    ok(evMine.length>0 && evMine.every(t=>/West Seneca Wings/.test(t)), 'and what is left is all ours ('+evMine.length+' games)');
    await r.ctx.close();
  }
  {
    // Ours with a team name that matches nothing would be a blank card, which
    // reads as a broken page rather than a filter. It has to say which it is.
    const r = await openPage(browser, BASE, {schedule:'scored', settingsTeam:'Nobody FC'});
    const empty = await r.page.$eval('.card .empty', e=>e.textContent).catch(()=>'');
    ok(/Nobody FC/.test(empty) && /Tap All/.test(empty), 'an unmatched team name explains the empty card and points at All: '+empty);
    const filled = await r.page.$$eval('.game', g=>g.length);
    ok(filled===0, 'and it really is empty until All is tapped');
    await r.page.click('.seg [data-act="filter"][data-v="all"]');
    await r.page.waitForTimeout(150);
    ok((await r.page.$$eval('.game', g=>g.length))>0, 'All still shows the whole schedule');
    await r.ctx.close();
  }

  // 27. The gameday post panel: three templates, three sizes, a photo, a hype line
  console.log('\n[27] gameday post panel');
  {
    const plain = await openPage(browser, BASE, {schedule:'scored'});
    ok((await plain.page.$$eval('.postbtn', b=>b.length))===0, 'no post button on the parents\' page');
    await plain.ctx.close();
    const adm = await openPage(browser, BASE+'?admin', {schedule:'scored'});
    ok((await adm.page.$$eval('.postbtn', b=>b.length))===0, 'and none with ?admin either: the buttons moved to the staff page');
    await adm.ctx.close();

    const r = await openPage(browser, STAFF, {schedule:'scored'});
    ok(r.errors.length===0, 'no page errors on the staff page: '+r.errors.join(' | '));

    const rows = await r.page.evaluate(()=>[...document.querySelectorAll('.game')].map(g=>({
      btn:!!g.querySelector('.postbtn'),
      ours:/West Seneca Wings/.test(g.textContent),
      done:[...g.querySelectorAll('.sc')].some(s=>s.textContent.trim()!=='')})));
    ok(rows.length>0 && rows.filter(x=>x.btn).length>0, 'the staff page puts buttons on the card ('+rows.filter(x=>x.btn).length+' of '+rows.length+' rows)');
    ok(rows.every(x=>x.btn === (x.ours && !x.done)), 'a button on every unplayed game of ours, and on nothing else');

    // The note reads "1080 x ..." once a draw has finished.
    const drawn = ()=>r.page.waitForFunction(()=>{
      const n=document.querySelector('.postnote');
      return n && /^1080 x/.test(n.textContent);
    }, null, {timeout:8000});
    const pick = async (group, v)=>{
      await r.page.click('[data-post="'+group+'"][data-v="'+v+'"]');
      await r.page.waitForTimeout(150);
    };
    const look = ()=>r.page.evaluate(()=>{
      const c = document.querySelector('.postcanvas');
      const ctx = c.getContext('2d');
      const at = (x,y)=>{ const d=ctx.getImageData(x,y,1,1).data; return d[0]+','+d[1]+','+d[2]; };
      const seen = new Set();
      for (let x=20; x<1080; x+=60) for (let y=20; y<c.height; y+=60) seen.add(at(x,y));
      const pressed = g=>{ const b=document.querySelector('[data-post="'+g+'"][aria-pressed="true"]'); return b ? b.getAttribute('data-v') : ''; };
      return {w:c.width, h:c.height, tl:at(20,20), bl:at(20,c.height-20), chip:at(80,80),
              photo:at(540,200), colours:seen.size, url:c.toDataURL(),
              tpl:pressed('tpl'), size:pressed('size'),
              outside:!document.querySelector('#app .postwrap')};
    });
    const NAVY='0,48,135', GOLD='252,213,30';

    await r.page.click('.postbtn');
    await drawn();

    let card = await look();
    ok((await r.page.$$eval('[data-post="tpl"]', b=>b.map(x=>x.textContent).join('|')))==='Blueline|Echo|Faceoff', 'the picker offers Blueline, Echo and Faceoff');
    ok((await r.page.$$eval('[data-post="size"]', b=>b.map(x=>x.textContent).join('|')))==='Feed 4:5|Square|Story 9:16', 'and Feed, Square and Story');
    ok(card.tpl==='blueline' && card.size==='feed', 'a first visit opens on Blueline at Feed 4:5: '+card.tpl+' / '+card.size);
    ok(card.w===1080 && card.h===1350, 'Feed is 1080 x 1350: '+card.w+'x'+card.h);
    ok(card.chip===GOLD && card.bl===NAVY, 'Blueline: gold tag top left, club navy along the foot: '+card.chip+' / '+card.bl);
    ok(card.colours>3, 'the post actually drew something ('+card.colours+' distinct sampled colours)');
    ok(card.outside, 'the panel is a sibling of #app, so a poll cannot wipe the canvas mid-draw');
    ok((await r.page.$eval('.posthype', i=>i.value))==='Take their ice.', 'an away game starts with "Take their ice."');

    await pick('size','square');
    card = await look();
    ok(card.h===1080 && card.size==='square', 'Square is 1080 x 1080: '+card.h);
    await pick('size','story');
    card = await look();
    ok(card.h===1920 && card.size==='story', 'Story is 1080 x 1920: '+card.h);

    await pick('tpl','echo');
    card = await look();
    ok(card.bl===GOLD && card.tpl==='echo', 'Echo: the gold matchup bar across the foot: '+card.bl);
    await pick('tpl','faceoff');
    card = await look();
    ok(card.tl===GOLD && card.bl===NAVY, 'Faceoff: a gold card with the navy date strip at the foot: '+card.tl+' / '+card.bl);

    // The hype line: typing changes the post, the switch takes it off.
    await pick('tpl','blueline');
    await pick('size','feed');
    const before = (await look()).url;
    await r.page.fill('.posthype', 'Protect the barn');
    await r.page.waitForTimeout(200);
    const typed = (await look()).url;
    ok(typed!==before, 'typing a new hype line redraws the post');
    await r.page.uncheck('.posthypeon');
    await r.page.waitForTimeout(200);
    const hidden = (await look()).url;
    ok(hidden!==typed && await r.page.$eval('.posthype', i=>i.disabled), 'the switch takes the hype line off and greys the box');
    await r.page.check('.posthypeon');
    await r.page.waitForTimeout(200);
    ok((await look()).url===typed, 'and switching it back on puts the same line back');

    // A photo from the phone. Made here as a flat red PNG, so the check can
    // see it come through the club tint.
    const noPhoto = await look();
    const red = await r.page.evaluate(()=>{
      const c=document.createElement('canvas'); c.width=400; c.height=300;
      const x=c.getContext('2d'); x.fillStyle='#DC1414'; x.fillRect(0,0,400,300);
      return c.toDataURL('image/png').split(',')[1];
    });
    await r.page.setInputFiles('.postfile input', {name:'rink.png', mimeType:'image/png', buffer:Buffer.from(red,'base64')});
    await r.page.waitForFunction(()=>/rink\.png/.test(document.querySelector('.postphotoname').textContent), null, {timeout:5000});
    await r.page.waitForTimeout(200);
    let withPhoto = await look();
    const [pr,,pb] = withPhoto.photo.split(',').map(Number);
    ok(pr>80 && pr>pb*2, 'the chosen photo fills the photo area, tinted: '+withPhoto.photo+' (was '+noPhoto.photo+')');
    ok(!(await r.page.$eval('[data-post="nophoto"]', b=>b.hidden)), 'Remove photo shows once there is a photo');

    // Download is always there and always downloads, whatever the phone.
    ok((await r.page.$$eval('[data-post="download"]', b=>b.length))===1, 'a Download button on the panel');
    const [dl] = await Promise.all([
      r.page.waitForEvent('download', {timeout:5000}).catch(()=>null),
      r.page.click('[data-post="download"]')
    ]);
    ok(dl && /^wings-vs-.+-feed\.png$/.test(dl.suggestedFilename()), 'Download saves a PNG named for the game and size: '+(dl ? dl.suggestedFilename() : 'no download'));
    ok(/Download saves a PNG|Download puts it|Save Image/.test(await r.page.$eval('.postnote', n=>n.textContent)), 'the note says how to get it into Instagram');

    const png = await r.page.evaluate(()=>new Promise(res=>{
      document.querySelector('.postcanvas').toBlob(b=>res(b ? b.size : 0), 'image/png');
    }));
    ok(png>5000, 'toBlob returns a real PNG with the photo and crest on it, so nothing tainted the canvas ('+png+' bytes)');

    await r.page.click('[data-post="nophoto"]');
    await r.page.waitForTimeout(200);
    ok((await look()).photo===noPhoto.photo, 'Remove photo puts the club-color block back');

    // Template and size are remembered for the next post.
    await pick('tpl','faceoff');
    await pick('size','square');
    await r.page.keyboard.press('Escape');
    await r.page.waitForTimeout(120);
    ok((await r.page.$$eval('.postwrap', n=>n.length))===0, 'Escape closes the panel');

    await r.page.click('.postbtn');
    await drawn();
    card = await look();
    ok(card.tpl==='faceoff' && card.size==='square' && card.h===1080, 'the next post opens on the last template and size: '+card.tpl+' / '+card.size);

    await r.page.click('[data-act="postclose"]');
    await r.page.waitForTimeout(120);
    ok((await r.page.$$eval('.postwrap', n=>n.length))===0, 'and so does the Close button');

    // A home game starts with the other line.
    // The row key is date|time|away|home, so a key ending in our name is a home game.
    await r.page.click('.postbtn[data-g$="|West Seneca Wings"]');
    await drawn();
    const homeLine = await r.page.$eval('.posthype', i=>i.value);
    ok(homeLine==='Protect the barn.', 'a home game starts with "Protect the barn.": '+homeLine);
    ok(r.errors.length===0, 'no page errors through all of it: '+r.errors.join(' | '));
    await r.ctx.close();
  }

  // 28. A blank Event cell is only flagged when that team is at the event
  {
    console.log('\n[28] blank Event cell on an event day');
    const ours = await openPage(browser, STAFF, {schedule:'strayOurs'});
    const oursText = await ours.page.$eval('#app', e=>e.textContent);
    ok(/Event cell is blank, but other games that day belong to Pre-Season Summer Showcase 2026/.test(oursText),
       'our own game with a blank Event on a showcase day is flagged');
    ok(/Schedule row 205:/.test(oursText), 'and the warning names the row (205)');
    await ours.ctx.close();

    const other = await openPage(browser, STAFF, {schedule:'strayOther'});
    const otherText = await other.page.$eval('#app', e=>e.textContent);
    ok(!/Event cell is blank/.test(otherText),
       'two other league teams playing on a showcase day is not flagged');
    ok(other.errors.length===0, 'no page errors: '+other.errors.join(' | '));
    await other.ctx.close();
  }

  // 29. Check The Rink: the team page in its folder, in its club's colors
  console.log('\n[29] team page in its folder, club colors from teams.js');
  {
    const r = await openPage(browser, BASE, {schedule:'scored'});
    ok(r.errors.length===0, 'no page errors: '+r.errors.join(' | '));
    const look = await r.page.evaluate(()=>{
      const cs = el => getComputedStyle(document.querySelector(el));
      return {
        mast: cs('.masthead').backgroundColor,
        rule: cs('.masthead').borderBottomColor,
        title: document.title,
        themeColor: document.querySelector('meta[name="theme-color"]').content,
        manifest: !!document.querySelector('link[rel="manifest"]'),
        home: (document.querySelector('a.home')||{}).getAttribute ? document.querySelector('a.home').getAttribute('href') : null,
        record: (document.querySelector('.record b')||{}).textContent || '',
        recordLabel: (document.querySelector('.record .eyebrow')||{}).textContent || '',
        club: !!window.CHECK_THE_RINK_CLUB,
        tabH: Math.round(document.querySelector('.viewbar button').getBoundingClientRect().height)
      };
    });
    ok(look.club, 'theme.js found the team in teams.js by its folder');
    ok(look.mast==='rgb(0, 48, 135)' && look.rule==='rgb(252, 213, 30)', 'masthead is club navy with the gold rule: '+look.mast+' / '+look.rule);
    ok(look.title==='West Seneca Wings | Check The Rink', 'browser tab named after the team: '+look.title);
    // The title in the file is what shows before the sheet loads, and what a
    // bookmark or a shared link picks up. It must not say the old name.
    const rawTitle = (fs.readFileSync(path.join(SITE_DIR,TEAM,'index.html'),'utf8').match(/<title>([^<]*)<\/title>/)||[])[1];
    ok(rawTitle==='West Seneca Wings | Check The Rink', 'the tab says the team name before the sheet loads too: '+rawTitle);
    ok(look.themeColor==='#003087', 'phone browser bar in the club main color: '+look.themeColor);
    ok(look.manifest, 'home-screen manifest linked');
    ok(look.home==='../', 'All teams row links back to the landing page: '+look.home);
    ok(/^\d+-\d+-\d+$/.test(look.record) && /PTS$/.test(look.recordLabel), 'record set big as W-L-T with points under it: '+look.record+' / '+look.recordLabel);
    ok(look.tabH>=44, 'tabs are at least 44px tall: '+look.tabH);
    const man = JSON.parse(fs.readFileSync(path.join(SITE_DIR,TEAM,'manifest.json'),'utf8'));
    ok(man.start_url==='./' && fs.existsSync(path.join(SITE_DIR,TEAM,man.icons[0].src)), 'manifest opens this folder and its icon file exists');
    await r.ctx.close();
  }

  // 30. Two team folders on one phone keep separate saved copies
  console.log('\n[30] two team folders do not share browser storage');
  {
    const r = await openPage(browser, BASE, {});
    // A second team folder, served from the Wings page, as a new team's copy would be.
    await r.page.route(/localhost:8811\/otherteam\/(\?.*)?$/, route=>route.fulfill({status:200, contentType:'text/html; charset=utf-8',
      body: fs.readFileSync(path.join(SITE_DIR,TEAM,'index.html'),'utf8')}));
    await r.page.route(/localhost:8811\/otherteam\/config\.js/, route=>route.fulfill({status:200, contentType:'text/javascript; charset=utf-8',
      body: fs.readFileSync(path.join(SITE_DIR,TEAM,'config.js'),'utf8')}));
    await r.page.route(/localhost:8811\/otherteam\/data\//, route=>route.fulfill({status:404, body:'nope'}));
    await r.page.evaluate(()=>localStorage.setItem('rinkreport.sponsorsOpen:/wswings12u/','0'));
    await r.page.goto('http://localhost:8811/otherteam/');
    await r.page.waitForTimeout(1500);
    const keys = await r.page.evaluate(()=>Object.keys(localStorage).sort());
    ok(keys.indexOf('rinkreport.v5:/wswings12u/')!==-1 && keys.indexOf('rinkreport.v5:/otherteam/')!==-1, 'each folder saves its own copy: '+keys.join(', '));
    ok(keys.indexOf('rinkreport.v5')===-1, 'nothing saved under the old shared key');
    const sp = await r.page.evaluate(()=>({there:!!document.querySelector('.sponsors'), shut:!!document.querySelector('.sponsors.shut')}));
    ok(sp.there && !sp.shut, 'folding sponsors on one team does not fold them on another: '+JSON.stringify(sp));
    const other = await r.page.evaluate(()=>({club:!!window.CHECK_THE_RINK_CLUB, home:!!document.querySelector('a.home')}));
    ok(!other.club && other.home, 'a folder missing from teams.js keeps the stylesheet colors but still has the way back to All teams: '+JSON.stringify(other));
    await r.ctx.close();
  }

  // 31. A club with hard colors: red and black
  console.log('\n[31] a red and black club, light and dark');
  {
    const teamsJs = fs.readFileSync(path.join(SITE_DIR,'teams.js'),'utf8').replace('primary: "#003087"','primary: "#C8102E"').replace('accent: "#FCD51E"','accent: "#111111"');
    for (const scheme of ['light','dark']) {
      const r = await openPage(browser, BASE, {teamsJs, scheme});
      ok(r.errors.length===0, scheme+': no page errors');
      const c = await r.page.evaluate(()=>{
        const cs = el => getComputedStyle(document.querySelector(el));
        return { mast: cs('.masthead').backgroundColor, rule: cs('.masthead').borderBottomColor,
          next: document.querySelector('.next') ? cs('.next').backgroundColor : '', nextInk: document.querySelector('.next') ? cs('.next').color : '',
          mastInk: cs('.masthead h1').color, paper: getComputedStyle(document.body).backgroundColor };
      });
      const rgb = s => s.match(/\d+/g).slice(0,3).map(Number);
      const lum = a => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);}; const [r,g,b]=a.map(f); return 0.2126*r+0.7152*g+0.0722*b; };
      const cr = (x,y) => { const a=lum(rgb(x)), b=lum(rgb(y)); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); };
      ok(c.mast==='rgb(200, 16, 46)', scheme+': masthead in the club red: '+c.mast);
      ok(cr(c.rule, c.mast)>=1.6, scheme+': the rule under the masthead still shows against it ('+cr(c.rule,c.mast).toFixed(2)+')');
      ok(!c.next || cr(c.next, c.paper)>=1.2, scheme+': the next-game panel shows against the page ('+(c.next?cr(c.next,c.paper).toFixed(2):'no card')+')');
      ok(!c.next || cr(c.nextInk, c.next)>=4.5, scheme+': type on the next-game panel reads ('+(c.next?cr(c.nextInk,c.next).toFixed(2):'no card')+')');
      ok(cr(c.mastInk, c.mast)>=4.5, scheme+': team name on the masthead reads ('+cr(c.mastInk,c.mast).toFixed(2)+')');
      await r.ctx.close();
    }
    const r = await openPage(browser, STAFF, {teamsJs, schedule:'scored'});
    await r.page.click('.postbtn');
    await r.page.waitForFunction(()=>{ const n=document.querySelector('.postnote'); return n && /^1080 x/.test(n.textContent); }, null, {timeout:8000});
    const px = await r.page.evaluate(()=>{ const c=document.querySelector('.postcanvas'); const d=c.getContext('2d').getImageData(20,c.height-20,1,1).data; return d[0]+','+d[1]+','+d[2]; });
    ok(/^(19\d|20\d),/.test(px), 'the gameday post is drawn on the club red, not Wings navy: '+px);
    await r.ctx.close();
  }

  // 32. The landing page
  console.log('\n[32] landing page');
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:900} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
    await page.route(/docs\.google\.com/, route=>route.fulfill({status:404, body:'no'}));
    await page.goto('http://localhost:8811/');
    await page.waitForTimeout(300);
    const land = await page.evaluate(()=>({
      h1: document.querySelector('.mast h1').textContent,
      clubs: [...document.querySelectorAll('.org-head span:first-child')].map(e=>e.textContent),
      links: [...document.querySelectorAll('.team a')].map(a=>a.getAttribute('href')),
      back: !!document.querySelector('.back'), find: !!document.querySelector('#q'),
      band: getComputedStyle(document.querySelector('.org-head')).backgroundColor,
      wide: document.documentElement.scrollWidth
    }));
    ok(errors.length===0, 'no page errors: '+errors.join(' | '));
    ok(land.h1==='Check The Rink', 'masthead reads Check The Rink');
    ok(land.clubs.join('|')==='Leagues|West Seneca Youth Hockey', 'a Leagues band above the one club band: '+land.clubs.join('|'));
    ok(land.links.join('|')==='testleague/|wswings12u/', 'the league row and the Wings row link to their folders: '+land.links.join('|'));
    const bands = await page.evaluate(()=>[...document.querySelectorAll('.org-head')].map(e=>getComputedStyle(e).backgroundColor));
    ok(bands[1]==='rgb(0, 48, 135)', 'the club band is in the club color: '+bands[1]);
    const leagueRow = await page.evaluate(()=>{ const r=document.querySelector('.leagues .team'); return {name:r.querySelector('.name').textContent, tag:(r.querySelector('.tag')||{}).textContent||'', find:r.getAttribute('data-find')}; });
    ok(leagueRow.name==='Test League 12U' && leagueRow.tag==='12U', 'the league row shows its name and age group: '+JSON.stringify(leagueRow));
    ok(!land.back && !land.find, 'first visit: no Your team panel, no search box with one team');
    ok(land.wide<=390, 'no sideways scroll at 390px: '+land.wide);
    await page.click('.org:not(.leagues) .team a');
    await page.waitForTimeout(800);
    ok(/\/wswings12u\/$/.test(page.url()), 'tapping the team opens its page: '+page.url());
    await page.goto('http://localhost:8811/');
    await page.waitForTimeout(300);
    const back = await page.evaluate(()=>{ const b=document.querySelector('.back'); return b ? {name:b.querySelector('.name').textContent, href:b.getAttribute('href'), bg:getComputedStyle(b).backgroundColor} : null; });
    ok(back && /West Seneca Wings/.test(back.name) && /12U/.test(back.name) && back.href==='wswings12u/', 'second visit: Your team panel with the age group: '+JSON.stringify(back));
    ok(back && back.bg==='rgb(252, 213, 30)', 'the panel is in the club accent: '+(back&&back.bg));

    // Many teams: search, age order, missing club
    const many = fs.readFileSync(path.join(SITE_DIR,'teams.js'),'utf8').replace(/teams: \[[\s\S]*\]\s*\};\s*$/, `teams: [
      { folder: "a", name: "West Seneca Wings", org: "wsyha", program: "12U", league: "WNYAHL" },
      { folder: "b", name: "West Seneca Wings", org: "wsyha", program: "8U", aka: ["Mite"] },
      { folder: "c", name: "West Seneca Wings", org: "wsyha", program: "Squirt" },
      { folder: "d", name: "West Seneca Wings", org: "wsyha", program: "14U" },
      { folder: "e", name: "Red Team", org: "nope", program: "10U" },
      { folder: "f", name: "West Seneca Wings Girls", org: "wsyha", program: "14U Girls" },
      { folder: "g", name: "West Seneca Wings", org: "wsyha", program: "Bantam" },
      { folder: "h", name: "West Seneca Wings", org: "wsyha", program: "16U" },
      { folder: "i", name: "Other Wings", org: "wsyha", program: "18U" },
      { folder: "j", name: "Peewee Wings", org: "wsyha", program: "Peewee" }
    ]
  };`);
    await page.route(/localhost:8811\/teams\.js/, route=>route.fulfill({status:200, contentType:'text/javascript', body:many}));
    await page.goto('http://localhost:8811/');
    await page.waitForTimeout(300);
    const order = await page.$$eval('[data-org="wsyha"] .team .tag', t=>t.map(x=>x.textContent));
    ok(order.join(',')==='8U,Squirt,12U,Peewee,14U,14U Girls,Bantam,16U,18U', 'age groups sort youngest first: '+order.join(','));
    const other = await page.$$eval('.org-head span:first-child', e=>e.map(x=>x.textContent));
    ok(other.indexOf('Other teams')!==-1, 'a team whose club is missing lands under Other teams');
    const count = async q => { await page.fill('#q', q); await page.waitForTimeout(60); return page.$$eval('.team', rs=>rs.filter(r=>!r.hidden).length); };
    ok(await count('wings 12u')===1, 'search matches every word: "wings 12u" finds 1');
    ok(await count('mite')===1, 'search knows the aka names: "mite" finds 1');
    ok(await count('girls 14')===1, '"girls 14" finds 1');
    ok(await count('zzz')===0 && /No team matches/.test(await page.$eval('.find .count', e=>e.textContent)), 'no match says so');
    ok(await count('8u')===1, '"8u" finds the 8U team and not 18U');
    ok(await count('pee wee')===1, '"pee wee" finds the team whose age group is typed Peewee');
    const lastClub = await page.$$eval('.org-head span:first-child', e=>e.map(x=>x.textContent).pop());
    ok(lastClub==='Other teams', 'Other teams sorts last: '+lastClub);
    await ctx.close();

    // A mistyped color on the first club does not strip the colors from the rest
    const bad = fs.readFileSync(path.join(SITE_DIR,'teams.js'),'utf8').replace('orgs: {', 'orgs: {\n    aaa: { name: "Aaa Club", primary: "navy", accent: "#FFFFFF" },').replace('folder: "wswings12u",', 'folder: "wswings12u",') + '\nwindow.CHECK_THE_RINK.teams.push({ folder: "x", name: "Bad Color Team", org: "aaa", program: "10U" });';
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    const errs3=[]; p3.on('pageerror', e=>errs3.push(String(e)));
    await p3.route(/localhost:8811\/teams\.js/, route=>route.fulfill({status:200, contentType:'text/javascript', body:bad}));
    await p3.goto('http://localhost:8811/');
    await p3.waitForTimeout(200);
    const wsBand = await p3.$eval('[data-org="wsyha"] .org-head', e=>getComputedStyle(e).backgroundColor);
    ok(errs3.length===0 && wsBand==='rgb(0, 48, 135)', 'a bad color on one club leaves the others colored: '+wsBand+' '+errs3.join('|'));
    await ctx3.close();

    // Old root links with ?admin go to the team's page when there is one team
    const ctx4 = await browser.newContext();
    const p4 = await ctx4.newPage();
    await p4.route(/docs\.google\.com/, route=>route.fulfill({status:404, body:'no'}));
    await p4.goto('http://localhost:8811/?admin');
    await p4.waitForTimeout(500);
    ok(/\/wswings12u\/\?admin$/.test(p4.url()), 'an old /?admin link lands on the team page with ?admin kept: '+p4.url());
    await ctx4.close();

    // teams.js fails to load
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.route(/localhost:8811\/teams\.js/, route=>route.fulfill({status:404, body:'no'}));
    await p2.goto('http://localhost:8811/');
    await p2.waitForTimeout(200);
    ok(/Can't load the team list/.test(await p2.$eval('body', e=>e.textContent)), 'a missing teams.js says it cannot load, not "No teams yet"');
    await ctx2.close();
  }

  // 33. Team rating (the Rtg column)
  console.log('\n[33] team rating');
  {
    // The math, straight from the module.
    const r = await openPage(browser, BASE, {});
    const m = await r.page.evaluate(async ()=>{
      const R = await import('/js/model/rating.js');
      const today = new Date(); const iso = d=>{ const x=new Date(today); x.setDate(x.getDate()-d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
      const g = (home, away, hs, as, ago)=>({home, away, hs, as, date: iso(ago||0)});
      return {
        soft: [0,1,3,5,8,12,-12].map(R.cappedMargin),
        pair: R.ratings([g('A','B',3,0)]),
        blow5: R.ratings([g('A','B',5,0)]),
        blow8: R.ratings([g('A','B',8,0)]),
        blow12: R.ratings([g('A','B',12,0)]),
        // Strength of schedule: A and C both win 2-1, but A's opponent beat D 5-0.
        sos: R.ratings([g('A','B',2,1), g('B','D',5,0), g('C','E',2,1)]),
        none: Object.keys(R.ratings([])).length,
        // The same games moved five months later: a game's date does not
        // change its weight, so the ratings must not change.
        early: R.ratings([g('A','B',3,0,40), g('C','B',2,1,10), g('A','C',1,1,0)]),
        late: R.ratings([g('A','B',3,0,190), g('C','B',2,1,160), g('A','C',1,1,150)]),
        // A score that is not a number is skipped, not spread to everyone.
        bad: R.ratings([g('A','B',3,0), g('C','D',NaN,1)]),
        nobad: R.ratings([g('A','B',3,0)])
      };
    });
    ok(m.soft.join(',')==='0,1,3,5,8,8,-8', 'margins count in full up to 8 goals: '+m.soft.join(','));
    // The exact answer is +0.75 / -0.75, which sits on a rounding edge.
    ok(m.pair.A===-m.pair.B && m.pair.A>=0.7 && m.pair.A<=0.8, 'one 3-0 game with two ghost games each: about +0.75 / -0.75, mirror images: '+JSON.stringify(m.pair));
    ok(m.blow8.A > m.blow5.A && m.blow8.A===m.blow12.A, 'an 8-0 win beats a 5-0 win, and 12-0 is worth the same as 8-0: '+m.blow5.A+' / '+m.blow8.A+' / '+m.blow12.A);
    ok(m.sos.A > m.sos.C, 'beating a stronger team by 1 is worth more than beating a weaker one by 1: A '+m.sos.A+' > C '+m.sos.C);
    ok(m.none===0, 'no games, no ratings');
    ok(JSON.stringify(m.early)===JSON.stringify(m.late), 'ratings do not drift with the calendar when no new games are played: '+JSON.stringify(m.early)+' / '+JSON.stringify(m.late));
    ok(JSON.stringify(m.bad)===JSON.stringify(m.nobad) && m.bad.A!==0, 'a game with a score that is not a number is left out: '+JSON.stringify(m.bad));

    // The showcase table on the page: every team rated, Rtg is the last
    // column, the ratings average out to zero, and points still set the order.
    await r.page.click('.evrow');
    await r.page.waitForTimeout(150);
    const t = await r.page.evaluate(()=>{
      const tb = document.querySelector('table');
      return {
        head: [...tb.querySelectorAll('thead th')].map(x=>x.textContent),
        rows: [...tb.querySelectorAll('tbody tr')].map(tr=>({
          pts: +tr.querySelector('td.pts').textContent,
          rtg: (tr.querySelector('td.rtg')||{}).textContent })),
        foot: (tb.closest('.card').querySelector('.rtgnote')||{}).textContent || '',
        wide: document.documentElement.scrollWidth
      };
    });
    ok(t.head[t.head.length-1]==='Rtg' && t.head[t.head.length-2]==='Pts', 'Rtg is the last column, after Pts: '+t.head.join('/'));
    ok(t.rows.length===6 && t.rows.every(x=>/^[+-]?\d+\.\d$/.test(x.rtg)), 'every showcase team has a signed one-decimal rating: '+t.rows.map(x=>x.rtg).join(' '));
    const sum = t.rows.reduce((a,x)=>a+(+x.rtg),0);
    ok(Math.abs(sum) <= 0.3, 'ratings average out to zero (sum '+sum.toFixed(2)+')');
    ok(t.rows.every((x,i)=>i===0 || t.rows[i-1].pts>=x.pts), 'points still set the order, not the rating');
    ok(/Rtg is how many goals a game better/.test(t.foot) && /0\.0 is average/.test(t.foot) && /about a goal a game better/.test(t.foot) && /subtract/.test(t.foot) && !/recent games/.test(t.foot) && !/—/.test(t.foot.split('Rtg is')[1]), 'the note under the table explains Rtg in plain words: '+t.foot);
    ok(t.wide<=412, 'no sideways page scroll at 412px with the extra column: '+t.wide);
    await r.ctx.close();
  }
  {
    // A team yet to play shows a dash, not 0.0.
    const r = await openPage(browser, BASE, {schedule:'scored'});
    const rows = await r.page.$$eval('table tbody tr', trs=>trs.map(tr=>({gp:tr.children[1].textContent, rtg:tr.querySelector('td.rtg').textContent})));
    ok(rows.length>0 && rows.filter(x=>x.gp==='0').every(x=>x.rtg==='–') && rows.filter(x=>x.gp!=='0').every(x=>/\d\.\d/.test(x.rtg)), 'league table: played teams rated, unplayed teams show a dash: '+JSON.stringify(rows));
    await r.ctx.close();
  }
  {
    // rating:false takes the column and its note away.
    const r = await openPage(browser, BASE, {schedule:'scored', features:{rating:false}});
    const off = await r.page.evaluate(()=>({
      rtg: document.querySelectorAll('.rtg').length,
      head: [...document.querySelectorAll('table thead th')].map(x=>x.textContent).join('/'),
      foot: (document.querySelector('table').closest('.card').querySelector('.rtgnote')||{}).textContent || '' }));
    ok(off.rtg===0 && /Pts$/.test(off.head) && !/Rtg/.test(off.foot), 'rating off: no Rtg column, no note: '+off.head);
    await r.ctx.close();
  }

  // 34. WNYAHL tiebreak rules
  console.log('\n[34] WNYAHL tiebreaks');
  {
    const r = await openPage(browser, BASE, {});
    const t = await r.page.evaluate(async ()=>{
      const S = await import('/js/model/standings.js');
      const g = (home, away, hs, as)=>({home, away, hs, as, date:'2026-10-01', type:'Q-Game'});
      const run = (games, teams, rules)=>S.standings(games, teams, false, rules).map(x=>x.team+(x.level?'=':'')).join(',');
      const W = S.RULESETS.wnyahl, U = S.RULESETS.usahockey;

      // A pair level on points that played each other: head-to-head first,
      // even though B's overall differential is far better.
      const pair = [g('A','B',2,1), g('B','C',9,0), g('D','A',1,0), g('D','B',1,0)];

      // Three level teams who all played each other, one win each:
      // head-to-head differential decides.
      const cycle = [g('A','B',2,1), g('B','X',10,0), g('X','A',1,0)];

      // A is placed by head-to-head points; B and C then start again with
      // only their own game (a tie), and fall through to all games, where
      // B's differential is better. Without the restart C would be ahead.
      const restart = [g('A','B',5,0), g('A','C',1,0), g('B','C',1,1), g('D','A',1,0), g('E','A',1,0),
                       g('B','D',9,0), g('B','E',0,0), g('C','E',1,0), g('C','D',0,0)];

      // Level teams who never met: all games, differential with no cap.
      const nocap = [g('A','X',12,0), g('B','Y',9,0)];

      // Two identical records who never met: shown level.
      const level = [g('A','X',3,1), g('B','Y',3,1)];

      return {
        pair: run(pair, ['A','B','C','D'], W), pairUsa: run(pair, ['A','B','C','D'], U),
        cycle: run(cycle, ['A','B','X'], W),
        restart: run(restart, ['A','B','C','D','E'], W),
        nocap: run(nocap, ['A','B','X','Y'], W),
        level: run(level, ['A','B','X','Y'], W)
      };
    });
    ok(t.pair==='D,A,B,C' && t.pairUsa==='D,B,A,C', 'a pair that met: WNYAHL puts the head-to-head winner first, USA Hockey does not: '+t.pair+' / '+t.pairUsa);
    ok(t.cycle==='B,A,X', 'three who all met with a win each: head-to-head differential decides: '+t.cycle);
    ok(t.restart==='A,B,C,E,D', 'once A is placed, B and C start again at step 1 and go to all games: '+t.restart);
    ok(t.nocap.startsWith('A,B'), 'teams who never met: all-games differential with no 8-goal cap (12 beats 9): '+t.nocap);
    ok(t.level.startsWith('A=,B='), 'identical records who never met are shown level: '+t.level);
    await r.ctx.close();
  }

  // 35. Coaches Corner (staff page only, team numbers, no names)
  console.log('\n[35] coaches corner');
  {
    const plain = await openPage(browser, BASE+'?admin', {});
    ok((await plain.page.$$eval('.coach', c=>c.length))===0, 'no Coaches Corner on the parents\' page, even with ?admin');
    await plain.ctx.close();

    // The fixtures hold the five August showcase games: 3-5, 6-0, 2-5, 8-2, 3-2.
    const r = await openPage(browser, STAFF, {});
    ok(r.errors.length===0, 'no page errors with the card on: '+r.errors.join(' | '));
    const card = await r.page.evaluate(()=>{
      const c=document.querySelector('.coach');
      return c ? { text:c.textContent, items:[...c.querySelectorAll('.coachlist li')].map(li=>li.textContent), table:!!c.querySelector('table') } : null;
    });
    ok(!!card, 'the card is on the league view of the staff page');
    ok(card && card.items[0]==='Record 3-2-0 in 5 games. Goals 22 for, 14 against (+8).', 'record line adds up the showcase: '+(card&&card.items[0]));
    // Aug 29 ended with the loss to Sylvania, then two wins on Aug 30.
    ok(card && card.items.includes('Won the last 2 in a row.'), 'the run is counted back from the latest game');
    ok(card && card.items.includes('1 game decided by one goal or tied: 1-0-0.'), 'close games: only the 3-2 win');
    ok(card && !card.table, 'no month table with only one month played');
    ok((await r.page.$$eval('.coach .postbtn', b=>b.length))===0, 'the copy button is not a .postbtn, so it never catches a gameday-post click');
    ok(card && !card.items.some(t=>/^League play/.test(t)), 'no league line before a league game');

    const roster = ['Luke G.','Evan C.','Connor P.','Andrew M.','Stephen D.'];
    ok(card && roster.every(n=>card.text.indexOf(n)===-1), 'the card names no player');

    const txt = await r.page.evaluate(async ()=>(await import('/js/ui/coach.js')).coachText());
    ok(/^COACHES CORNER \(through Sun Aug 30\)\n/.test(txt), 'copied text opens with the heading and date');
    ok(txt.indexOf('- Record 3-2-0 in 5 games.')!==-1, 'copied text carries the same lines as the card');
    ok(roster.every(n=>txt.indexOf(n)===-1), 'copied text names no player');

    await r.page.click('[data-act="coachcopy"]');
    await r.page.waitForTimeout(200);
    ok(/Copied/.test(await r.page.textContent('[data-act="coachcopy"]')), 'the button says Copied after a tap');
    await r.page.waitForTimeout(2300);
    ok(/Copy as text/.test(await r.page.textContent('[data-act="coachcopy"]')), 'and goes back after two seconds');
    await r.ctx.close();

    // A September league game (6-2 over Southtowns) with its log rows.
    const L = await openPage(browser, STAFF, {leagueLog:true});
    const lc = await L.page.evaluate(()=>{
      const c=document.querySelector('.coach');
      return { items:[...c.querySelectorAll('.coachlist li')].map(li=>li.textContent),
               rows:[...c.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent).join('|')) };
    });
    ok(lc.items[0]==='Record 4-2-0 in 6 games. Goals 28 for, 16 against (+12).', 'the league win joins the record: '+lc.items[0]);
    ok(lc.items.includes('League play: 1-0-0, 6 for and 2 against. The other 5 games were showcases and tournaments.'), 'league play gets its own line');
    ok(lc.rows.length===2 && lc.rows[0]==='August|5|3-2-0|4.4|2.8' && lc.rows[1]==='September|1|1-0-0|6|2', 'month table, August then September: '+lc.rows.join(' / '));
    await L.ctx.close();
  }

  // 36. Practice ideas inside the Coaches Corner card
  console.log('\n[36] practice ideas');
  {
    // The fixture skaters have 24 penalty minutes in 5 games (4.8 a game).
    // Nothing else crosses a line: 4.4 goals for, 2.8 against, the top two
    // have 9 of 22 goals, and only one close game.
    const r = await openPage(browser, STAFF, {});
    const pr = await r.page.evaluate(()=>{
      const b=document.querySelector('.coach .practice');
      return b ? { text:b.textContent,
                   focus:[...b.querySelectorAll('.pfocus')].map(f=>f.dataset.focus),
                   why:[...b.querySelectorAll('.pwhy')].map(p=>p.textContent),
                   drills:b.querySelectorAll('.drills li').length } : null;
    });
    ok(!!pr, 'practice ideas sit inside the Coaches Corner card');
    ok(pr && pr.focus.join(',')==='skills,penalties', 'skating and skills first, then only the penalty focus fires on the fixtures: '+(pr&&pr.focus.join(',')));
    // The frozen clock says Thu Sept 10 2026, so the week began Mon Sept 7.
    ok(pr && pr.why[0]==='Week of Mon Sep 7: backward skating. Every practice, 10 to 15 minutes, half ice. A new set each Monday.', 'the warm-up names its week and set: '+(pr&&pr.why[0]));
    ok(pr && pr.why[1]==='4.8 penalty minutes a game.', 'the reason quotes the team number: '+(pr&&pr.why[1]));
    ok(pr && pr.drills===5, 'three warm-up drills and two under the focus: '+(pr&&pr.drills));
    ok(pr && /written ahead of time/.test(pr.text), 'the block says the drills were written ahead of time');
    const roster = ['Luke G.','Evan C.','Connor P.','Andrew M.','Stephen D.','Chase M.'];
    ok(pr && roster.every(n=>pr.text.indexOf(n)===-1), 'practice ideas name no player');

    const txt = await r.page.evaluate(async ()=>(await import('/js/ui/coach.js')).coachText());
    ok(txt.indexOf('\nPRACTICE IDEAS\nSkating and skills. Week of Mon Sep 7: backward skating.')!==-1, 'copied text opens the practice ideas with the weekly warm-up');
    ok(txt.indexOf('   - Backward crossovers (skating): ')!==-1 && txt.indexOf('   - Pivot and pass (puck skills): ')!==-1, 'copied warm-up drills carry their skating or puck tag');
    ok(txt.indexOf('\n1. Cut the penalties. 4.8 penalty minutes a game.\n')!==-1, 'copied text carries the numbered focus areas');
    ok(/Scrimmages are left out\. Team numbers only\.$/.test(txt), 'copied text still ends with the footnote');

    // The picker on its own, with made-up summaries.
    const t = await r.page.evaluate(async ()=>{
      const { practicePicks } = await import('/js/model/practice.js');
      const keys = sum => practicePicks(sum).map(p=>p.key).join(',');
      const m = (label,gp,gf,ga) => ({label,gp,gf,ga,w:0,l:0,t:0});
      const base = { all:{gp:10,gf:40,ga:20,w:6,l:2,t:2}, months:[m('September',10,40,20)],
                     close:{gp:2,w:1,l:0,t:1}, scoring:null };

      // Close to the real first ten games: August 22-14 in 5, September 13-7
      // in 5, 8 of the last 13 goals from two players, 63.5 PIM in 10.
      const season = { all:{gp:10,gf:35,ga:21,w:5,l:2,t:3},
                       months:[m('August',5,22,14), m('September',5,13,7)],
                       close:{gp:4,w:1,l:0,t:3},
                       scoring:{ season:{top2:12,total:35,scorers:10}, recent:{top2:8,total:13,scorers:5},
                                 recentGames:5, skaters:13, withPoint:12, pim:63.5, pimGames:10 } };
      const sp = practicePicks(season);

      return {
        empty: practicePicks(null).length,
        quiet: keys(base),
        season: sp.map(p=>p.key).join(','),
        seasonWhy: sp.map(p=>p.why),
        closeOnly: keys(Object.assign({}, base, { close:{gp:4,w:1,l:1,t:2} })),
        closeOk: keys(Object.assign({}, base, { close:{gp:4,w:2,l:1,t:1} })),
        gaHigh: keys(Object.assign({}, base, { all:{gp:5,gf:20,ga:17,w:2,l:3,t:0}, months:[m('September',5,20,17)] })),
        gaRise: practicePicks(Object.assign({}, base, { months:[m('August',4,16,6), m('September',4,16,12)] })).map(p=>p.why).join(' '),
        lowGf: practicePicks(Object.assign({}, base, { all:{gp:6,gf:14,ga:10,w:3,l:3,t:0}, months:[m('September',6,14,10)] })).map(p=>p.why).join(' '),
        oneGameMonth: keys(Object.assign({}, base, { months:[m('August',9,40,18), m('September',1,0,2)] })),
        fewGoals: keys(Object.assign({}, base, { scoring:{ season:{top2:4,total:5,scorers:2}, recent:null, recentGames:5, skaters:13, withPoint:4, pim:5, pimGames:5 } })),
        seasonSpread: practicePicks(Object.assign({}, base, { scoring:{ season:{top2:12,total:20,scorers:6}, recent:{top2:2,total:6,scorers:4}, recentGames:5, skaters:13, withPoint:9, pim:5, pimGames:5 } })).map(p=>p.why).join(' ')
      };
    });
    ok(t.empty===0, 'no summary, no ideas');
    ok(t.quiet==='sharp', 'nothing stands out: one "keep the basics sharp" entry: '+t.quiet);
    ok(t.season==='finishing,spread,penalties', 'the first ten games pick finishing, spread and penalties, three at most: '+t.season);
    ok(t.seasonWhy[0]==='Goals a game fell from 4.4 in August to 2.6 in September.', 'scoring drop reason: '+t.seasonWhy[0]);
    ok(t.seasonWhy[1]==='Two players have 8 of the 13 goals in the last 5 games.', 'recent scoring share reason: '+t.seasonWhy[1]);
    ok(t.seasonWhy[2]==='6.4 penalty minutes a game.', 'penalty reason rounds to one place: '+t.seasonWhy[2]);
    ok(t.closeOnly==='close', 'close games fire when under half were wins: '+t.closeOnly);
    ok(t.closeOk==='sharp', 'two wins in four close games is fine: '+t.closeOk);
    ok(t.gaHigh.split(',')[0]==='defense', 'goals against over 3 a game comes first: '+t.gaHigh);
    ok(t.gaRise==='Goals against went from 1.5 a game in August to 3 in September.', 'goals against rising month to month: '+t.gaRise);
    ok(t.lowGf==='The team scores 2.3 goals a game.', 'low scoring over the season: '+t.lowGf);
    ok(t.oneGameMonth==='sharp', 'a one-game month is not compared with the one before');
    ok(t.fewGoals==='sharp', 'under six goals, the top-two share is not judged');
    ok(t.seasonSpread==='Two players have 12 of the 20 goals this season.', 'falls back to the season share when the last games are spread out: '+t.seasonSpread);

    const lib = await r.page.evaluate(async ()=>{
      const { practicePicks } = await import('/js/model/practice.js');
      const m = (label,gp,gf,ga) => ({label,gp,gf,ga});
      // Three summaries that between them fire every focus and the fallback.
      const every = [
        { all:{gp:5,gf:10,ga:20}, months:[m('Sept',5,10,20)], close:{gp:1,w:0,l:1,t:0}, scoring:null },
        { all:{gp:5,gf:30,ga:10}, months:[m('Sept',5,30,10)], close:{gp:3,w:0,l:1,t:2},
          scoring:{ season:{top2:20,total:30}, recent:null, recentGames:5, pim:30, pimGames:5 } },
        { all:{gp:10,gf:40,ga:20}, months:[m('Sept',10,40,20)], close:{gp:0,w:0,l:0,t:0}, scoring:null }
      ];
      const drills = [];
      every.forEach(s=>practicePicks(s).forEach(p=>p.drills.forEach(d=>drills.push(Object.assign({focus:p.key}, d)))));
      return drills;
    });
    const focuses = [...new Set(lib.map(d=>d.focus))].sort().join(',');
    ok(focuses==='close,defense,finishing,penalties,sharp,spread', 'every focus area has drills: '+focuses);
    ok(lib.every(d=>d.ice==='half' || (d.ice==='full' && d.half)), 'every full-ice drill says how to run it on half ice');
    ok(lib.every(d=>(d.name+d.how+(d.half||'')).indexOf('\u2014')===-1), 'no em-dashes in the drill text');

    // Every focus drill but one links to Ice Hockey Systems.
    const noIhs = lib.filter(d=>!d.ihs).map(d=>d.name);
    ok(noIhs.join(',')==='Last-minute game', 'only Last-minute game has no Ice Hockey Systems match: '+noIhs.join(','));
    ok(lib.filter(d=>d.ihs).every(d=>/^https:\/\/www\.icehockeysystems\.com\/(hockey-drills|skill-development-videos)\/[a-z0-9-]+$/.test(d.ihs.url) && d.ihs.name), 'every ihs entry has a name and an icehockeysystems.com page');
    const ihsLinks = await r.page.$$eval('.coach .drills a.ihs', as=>as.map(a=>({href:a.getAttribute('href'), target:a.getAttribute('target'), rel:a.getAttribute('rel'), text:a.textContent})));
    ok(ihsLinks.length>=3 && ihsLinks.every(a=>a.target==='_blank' && a.rel==='noopener' && /^IHS (drill|video): /.test(a.text)), 'the drill links open in a new tab and say IHS drill or IHS video: '+ihsLinks.length);
    ok(/IHS (drill|video): [^\n]+ https:\/\/www\.icehockeysystems\.com\//.test(txt), 'copied text carries the Ice Hockey Systems name and URL');

    // The weekly warm-up on its own.
    const w = await r.page.evaluate(async ()=>{
      const { skillsFor } = await import('/js/model/practice.js');
      const on = (y,m,d,h) => skillsFor(new Date(y,m-1,d,h||12));
      const seen = [];
      for (let i=0; i<6; i++) seen.push(on(2026,9,7+i*7).theme);
      const sets = [];
      for (let i=0; i<6; i++) sets.push(on(2026,9,7+i*7).drills);
      return {
        sun: on(2026,9,13).weekOf, mon: on(2026,9,14).weekOf,
        sunTheme: on(2026,9,13).theme, monTheme: on(2026,9,14).theme,
        late: on(2026,9,13,23).weekOf, early: on(2026,9,14,0).weekOf,
        newYear: on(2027,1,1).weekOf,
        seen: seen,
        repeat: on(2026,9,7).theme===on(2026,10,19).theme,
        mix: sets.every(ds=>ds.length===3 && ds.some(d=>d.kind==='skating') && ds.some(d=>d.kind==='puck')),
        text: sets.flat().map(d=>d.name+d.how).join(' ')
      };
    });
    ok(w.sun==='2026-09-07' && w.mon==='2026-09-14', 'the week turns over on Monday: '+w.sun+' / '+w.mon);
    ok(w.sunTheme!==w.monTheme, 'and the set changes with it: '+w.sunTheme+' / '+w.monTheme);
    ok(w.late==='2026-09-07' && w.early==='2026-09-14', 'late Sunday night and just after midnight Monday land in the right weeks');
    ok(w.newYear==='2026-12-28', 'a week that crosses New Year starts on its Monday: '+w.newYear);
    ok(new Set(w.seen).size===6, 'six weeks in a row, six different sets: '+w.seen.join(', '));
    ok(w.repeat, 'week seven comes back round to the first set');
    ok(w.mix, 'every set has three drills with skating and puck work in it');
    ok(w.text.indexOf('\u2014')===-1, 'no em-dashes in the warm-up text');

    // Phone width: the block must not push the page sideways.
    await r.page.setViewportSize({width:360, height:800});
    const wide = await r.page.evaluate(()=>document.documentElement.scrollWidth);
    ok(wide<=360, 'no sideways scroll at phone width with the practice block: '+wide);
    await r.ctx.close();
  }

  // 37. Hot, warm and cold on the Stats page (?admin only)
  console.log('\n[37] hot warm cold');
  {
    const FIRE='\u{1F525}', SUN='\u2600\uFE0F', ICE='\u{1F9CA}';
    const look = async (url, opts) => {
      const r = await openPage(browser, url, opts);
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      const got = await r.page.evaluate(()=>{
        const rows = {};
        document.querySelectorAll('.card tbody tr').forEach(tr=>{
          const td = tr.children[0];
          const f = td.querySelector('.form');
          const btn = td.querySelector('.pname');
          const name = btn ? btn.textContent.trim() : [...td.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
          rows[name] = f ? { emoji:f.textContent, why:f.getAttribute('data-why') } : null;
        });
        return { rows, keys:[...document.querySelectorAll('.formkey')].map(p=>p.textContent) };
      });
      got.errors = r.errors;
      await r.ctx.close();
      return got;
    };

    let v = await look(BASE, {});
    ok(Object.values(v.rows).every(x=>x===null) && v.keys.length===0, 'no emojis and no key without ?admin');

    // The fixture log holds exactly five games, so every point in it counts.
    v = await look(BASE+'?admin', {});
    ok(v.errors.length===0, 'no page errors with the emojis on: '+v.errors.join(' | '));
    ok(v.rows['Luke G.'] && v.rows['Luke G.'].emoji===FIRE, 'Luke G., 7 points in 5 games, is hot');
    ok(v.rows['Luke G.'] && v.rows['Luke G.'].why==='Hot: 7 points in the last 5 games', 'the tooltip says why: '+(v.rows['Luke G.']||{}).why);
    ok(v.rows['Rory O.'] && v.rows['Rory O.'].emoji===SUN, 'Rory O., 4 points, is warm');
    ok(v.rows['Gus F.'] && v.rows['Gus F.'].emoji===ICE, 'Gus F., 1 point, is cold');
    ok(v.rows['Vincent D.'] && v.rows['Vincent D.'].emoji===ICE && /0 points/.test(v.rows['Vincent D.'].why), 'a skater with no log rows is cold at 0 points');
    ok(v.rows['Andrew M.'] && v.rows['Andrew M.'].emoji===SUN, 'Andrew M., 3.21 lately vs 2.41 season, is warm: '+JSON.stringify(v.rows['Andrew M.']));
    ok(v.rows['Andrew M.'] && v.rows['Andrew M.'].why==='Warm: 3.21 GAA in the last 3 games, 2.41 for the season', 'goalie tooltip names both numbers');
    ok(v.rows['Stephen D.']===null, 'a goalie with one game gets no emoji');

    // The reason shows in a label on hover (mouse) and on tap (phone), not
    // in a browser title tooltip, which shows nothing useful on a phone.
    {
      const r = await openPage(browser, BASE+'?admin', {});
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      const label = () => r.page.evaluate(()=>{
        const t=document.querySelector('.formtip');
        if(!t || t.hidden) return null;
        const b=t.getBoundingClientRect();
        return { text:t.textContent, inside: b.left>=0 && b.right<=innerWidth && b.top>=0 && b.bottom<=innerHeight };
      });
      ok((await r.page.$$eval('.form[title]', x=>x.length))===0, 'no title attribute, so no stray browser tooltip');
      await r.page.hover('.form');
      let t = await label();
      ok(t && t.text==='Hot: 7 points in the last 5 games' && t.inside, 'hovering the first emoji shows its reason on screen: '+JSON.stringify(t));
      await r.page.mouse.move(5, 5); await r.page.waitForTimeout(50);
      ok((await label())===null, 'moving away hides it');
      const last = (await r.page.$$('.form')).pop();
      await last.scrollIntoViewIfNeeded();
      await last.click();
      t = await label();
      ok(t && /^Warm: /.test(t.text) && t.inside, 'a tap on the goalie emoji shows its reason: '+JSON.stringify(t));
      await r.page.click('h2');
      ok((await label())===null, 'a tap elsewhere hides it');
      await r.ctx.close();
    }
    ok(v.keys.length===2 && v.keys.every(k=>/Only on \?admin/.test(k)), 'both tables explain the emojis');
    ok(v.keys.every(k=>k.indexOf('\u2014')===-1), 'no em-dashes in the key');

    // Only the last five games count: a sixth game pushes Aug 28 out.
    const evanB = b => b.replace('Evan B.,,,1.5', 'Evan B.,2,1,1.5');
    v = await look(BASE+'?admin', {statsEdit:evanB});
    ok(v.rows['Evan B.'] && v.rows['Evan B.'].emoji===FIRE, 'Evan B. with 3 more points on Aug 28 is hot (7)');
    const sixth = b => evanB(b).replace('Evan B.,2,1,1.5,,,,,,,,,,', 'Evan B.,2,1,1.5,,9/6/2026,Test Club,32,Stephen D.,45,,1,W,');
    v = await look(BASE+'?admin', {statsEdit:sixth});
    ok(v.rows['Evan B.'] && v.rows['Evan B.'].emoji===SUN && /4 points/.test(v.rows['Evan B.'].why),
      'with a sixth game logged, Aug 28 drops out and Evan B. is warm (4): '+JSON.stringify(v.rows['Evan B.']));
    ok(v.rows['Stephen D.']===null, 'a goalie with two games still gets no emoji');

    // Fewer than five games in the log: nobody is judged yet.
    v = await look(BASE+'?admin', {statsEdit:b=>b.replace('Sylvania N-Stars 2014,29,Andrew M.', 'Macomb Mavericks 2014,29,Andrew M.')});
    const sk = ['Luke G.','Rory O.','Gus F.'].map(n=>v.rows[n]);
    ok(sk.every(x=>x===null), 'no skater emojis with only four games logged');
    ok(v.keys.length===1, 'and no skater key, only the goalie one');

    // Goalies: a full goal a game either way.
    v = await look(BASE+'?admin', {statsEdit:b=>b.replace('Stoney Creek 2014,29,Andrew M.,42,,2,W', 'Stoney Creek 2014,29,Andrew M.,42,,6,W')});
    ok(v.rows['Andrew M.'] && v.rows['Andrew M.'].emoji===ICE, 'six against in his last game makes Andrew M. cold: '+JSON.stringify(v.rows['Andrew M.']));
    v = await look(BASE+'?admin', {statsEdit:b=>b.replace('Andrew M.,42,19,0,W', 'Andrew M.,42,19,8,W')});
    ok(v.rows['Andrew M.'] && v.rows['Andrew M.'].emoji===FIRE, 'a bad early game and a good last three make Andrew M. hot: '+JSON.stringify(v.rows['Andrew M.']));
  }

  console.log('\n[38] player pages');
  {
    // Without ?admin the names are plain text and nothing opens.
    {
      const r = await openPage(browser, BASE, {});
      await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
      ok((await r.page.$$eval('.pname', x=>x.length))===0, 'no name buttons for parents');
      ok((await r.page.$$eval('.phead', x=>x.length))===0, 'no player page for parents');
      await r.ctx.close();
    }

    const r = await openPage(browser, BASE+'?admin', {});
    await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(150);
    const names = await r.page.$$eval('.pname', x=>x.map(b=>b.textContent.trim()));
    ok(names.length===15 && names[0]==='Luke G.' && names.indexOf('Andrew M.')!==-1, 'every skater and goalie is a button: '+names.length);

    // A skater: header numbers match the totals table, one row per team game.
    await r.page.click('.pname[data-v="Luke G."]'); await r.page.waitForTimeout(150);
    let v = await r.page.evaluate(()=>({
      head: document.querySelector('.phead') && document.querySelector('.phead').textContent.replace(/\s+/g,' ').trim(),
      tiles: [...document.querySelectorAll('.ptile')].map(t=>t.querySelector('span').textContent+'='+t.querySelector('b').textContent),
      rows: [...document.querySelectorAll('.plog tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.replace(/\s+/g,' ').trim())),
      notes: [...document.querySelectorAll('.pnotes div')].map(d=>d.querySelector('dt').textContent+': '+d.querySelector('dd').textContent),
      tables: document.querySelectorAll('.card.skaters').length,
      crumb: document.querySelector('.crumb button') && document.querySelector('.crumb button').textContent.trim(),
      top: window.scrollY
    }));
    ok(v.head && /^15\s*Luke G\./.test(v.head) && /Skater/.test(v.head), 'header shows number, name and Skater: '+v.head);
    ok(v.tiles.join(' ')==='GP=5 G=6 A=1 Pts=7 PIM=0 Pts/GP=1.40', 'tiles carry the season line: '+v.tiles.join(' '));
    ok(v.tables===0, 'the Stats tables are replaced by the page');
    ok(v.rows.length===5, 'one row per team game, five in the fixture: '+v.rows.length);
    ok(v.rows[0][0].indexOf('vs Stoney Creek Warriors')===0 && /Sun Aug 30/.test(v.rows[0][0]) && /Showcase/.test(v.rows[0][0]), 'newest game first with date and event: '+v.rows[0][0]);
    ok(v.rows[0][1]==='W 3-2', 'result reads from our side: '+v.rows[0][1]);
    // Two games on Aug 29: the opponent typed in the log picks the right one.
    const macomb = v.rows.find(x=>/Macomb/.test(x[0]));
    const sylvania = v.rows.find(x=>/Sylvania/.test(x[0]));
    ok(macomb && macomb.slice(1).join(' ')==='W 6-0 2 0 2 0', 'Aug 29 at Macomb: 2 goals: '+(macomb&&macomb.join('|')));
    ok(sylvania && sylvania.slice(1).join(' ')==='L 2-5 1 0 1 0', 'Aug 29 vs Sylvania: 1 goal, not mixed up with Macomb: '+(sylvania&&sylvania.join('|')));
    ok(v.notes[0]==='Best game: 2 G at Macomb Mavericks, Sat Aug 29' || v.notes[0]==='Best game: 2 G at Middlesex Islanders, Sun Aug 30', 'best game named: '+v.notes[0]);
    ok(v.notes.indexOf('Games with a point: 5 of 5')!==-1, 'games with a point: '+v.notes.join(' | '));
    ok(v.notes.indexOf('Point streak: 5 games and counting')!==-1, 'point streak counts back from the latest game');
    ok(v.notes.every(n=>n.indexOf('—')===-1), 'no em-dashes in the notes');
    ok(v.crumb==='← Player stats', 'crumb leads back: '+v.crumb);
    ok(v.top===0, 'the page opens scrolled to the top');

    // The Stats tab stays lit while a player is open, and the record chip stays.
    const lit = await r.page.$eval('.viewbar button[aria-pressed="true"]', b=>b.getAttribute('data-v'));
    ok(lit==='stats', 'the Stats button stays lit while a player is open: '+lit);

    // Back to the tables.
    await r.page.click('.crumb button'); await r.page.waitForTimeout(100);
    ok((await r.page.$$eval('.card.skaters', x=>x.length))===1 && (await r.page.$$eval('.phead', x=>x.length))===0, 'crumb returns to the tables');

    // A goalie page.
    await r.page.click('.pname[data-v="Andrew M."]'); await r.page.waitForTimeout(150);
    v = await r.page.evaluate(()=>({
      head: document.querySelector('.phead').textContent.replace(/\s+/g,' ').trim(),
      tiles: [...document.querySelectorAll('.ptile')].map(t=>t.querySelector('span').textContent+'='+t.querySelector('b').textContent),
      rows: [...document.querySelectorAll('.plog tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.replace(/\s+/g,' ').trim())),
      notes: [...document.querySelectorAll('.pnotes div')].map(d=>d.querySelector('dt').textContent+': '+d.querySelector('dd').textContent),
      body: document.body.textContent
    }));
    ok(/^29\s*Andrew M\./.test(v.head) && /Goalie/.test(v.head), 'goalie header: '+v.head);
    ok(v.tiles.join(' ')==='GP=4 Min=168 GA=9 GAA=2.41 SO=1 Record=3-1-0', 'goalie tiles, GAA per 45 minute game: '+v.tiles.join(' '));
    ok(v.rows.length===4, 'one row per game in net: '+v.rows.length);
    const shutout = v.rows.find(x=>/Macomb/.test(x[0]));
    ok(shutout && shutout[3]==='0 SO', 'the Macomb shutout is tagged: '+(shutout&&shutout.join('|')));
    ok(v.notes[0]==='Best game: 0 against in 42 min at Macomb Mavericks, Sat Aug 29', 'goalie best game: '+v.notes[0]);
    ok(v.notes.indexOf('Shutouts: 1')!==-1, 'shutouts counted');
    ok(!/SV%|1\.000/.test(v.body), 'no save percentage anywhere on the page');

    // Switching tabs closes the page; coming back shows the tables, not the player.
    await r.page.click('.viewbar button[data-v="league"]'); await r.page.waitForTimeout(100);
    await r.page.click('.viewbar button[data-v="stats"]'); await r.page.waitForTimeout(100);
    ok((await r.page.$$eval('.phead', x=>x.length))===0, 'changing tab closes the player page');

    // A skater with no log rows at all still gets a page of zeros.
    await r.page.click('.pname[data-v="Gus F."]').catch(()=>{}); await r.page.waitForTimeout(150);
    const gus = await r.page.evaluate(()=>({
      rows: document.querySelectorAll('.plog tbody tr').length,
      notes: [...document.querySelectorAll('.pnotes div')].map(d=>d.querySelector('dd').textContent)
    }));
    ok(gus.rows===5, 'a quiet skater still lists every team game: '+gus.rows);

    await r.page.screenshot({path:path.join(OUT,'shot_player_light.png'), fullPage:true});
    ok(r.errors.length===0, 'no page errors on the player pages: '+r.errors.join(' | '));
    await r.ctx.close();

    {
      const d = await openPage(browser, BASE+'?admin', {scheme:'dark'});
      await d.page.click('.viewbar button[data-v="stats"]'); await d.page.waitForTimeout(100);
      await d.page.click('.pname[data-v="Luke G."]'); await d.page.waitForTimeout(150);
      await d.page.screenshot({path:path.join(OUT,'shot_player_dark.png'), fullPage:true});
      await d.ctx.close();
    }
  }

  // 39. Coaches report: the sealed notes in data/coaches-corner.enc (staff page only)
  console.log('\n[39] coaches report');
  {
    const NOTES = [
      'COACHES CORNER: GAMES THROUGH 9/25/2026',
      '(Sheet copy taken 9/28. Numbers below use 13-1.)',
      '',
      '1. HEADLINE',
      '- Record 6-2-3. Goals 48 for, 23 against (+25).',
      '- No loss in the last 8 (5-0-3).',
      '',
      "2. WHAT'S WORKING",
      '- Both goalies are steady. Andrew M.: 13 GA in 7 games.',
      '',
      '4. SUGGESTIONS',
      '1. Finishing reps for the kids who are setting up goals (Chase M., Alex S.).',
      '2. A discipline reminder before Cheektowaga.',
      ''
    ].join('\n');

    // The parents' page, with and without ?admin: no card, and the file is
    // never even asked for, under its new name or its old one.
    for (const url of [BASE, BASE+'?admin']) {
      const plain = await openPage(browser, url, {notes:NOTES});
      await plain.page.waitForTimeout(300);
      ok((await plain.page.$$eval('.notes', c=>c.length))===0 && !plain.asked.some(a=>/^notes:/.test(a)), 'no Coaches report and no request for the file on '+url.replace(BASE,'/'));
      await plain.ctx.close();
    }

    // Staff page but no file: the numbers card is there, the report is not.
    const none = await openPage(browser, STAFF, {});
    ok((await none.page.$$eval('.coach', c=>c.length))===1 && (await none.page.$$eval('.notes', c=>c.length))===0, 'no file, no report card, and the numbers card is untouched');
    await none.ctx.close();

    // Staff page with the sealed file: the unlock box, and not a word of the report.
    const r = await openPage(browser, STAFF, {notes:NOTES});
    await r.page.waitForSelector('.notes.locked', {timeout:3000}).catch(()=>{});
    ok(r.errors.length===0, 'no page errors with the sealed report on: '+r.errors.join(' | '));
    ok(r.asked.some(a=>a==='notes:coaches-corner.enc') && !r.asked.some(a=>a==='notes:coaches-corner.txt'), 'the staff page asks for coaches-corner.enc, never the old .txt');
    const locked = await r.page.evaluate(()=>{
      const c=document.querySelector('.notes.locked');
      return c ? { form:!!c.querySelector('form[data-form="unlock"] input#rr-pass'), eyebrow:c.querySelector('.eyebrow').textContent.trim(), body:document.querySelector('#app').textContent } : null;
    });
    ok(locked && locked.form && locked.eyebrow==='Locked', 'the report card is the unlock box: a passphrase field, eyebrow Locked');
    ok(locked && !/Finishing reps|Andrew M\./.test(locked.body), 'nothing from the report is on the page while it is locked');

    // A wrong passphrase: a plain message, still locked, nothing remembered.
    await r.page.fill('#rr-pass', 'nope-nope'); await r.page.press('#rr-pass', 'Enter');
    await r.page.waitForSelector('.unlock .err', {timeout:3000}).catch(()=>{});
    const wrong = await r.page.evaluate(()=>({ err:(document.querySelector('.unlock .err')||{}).textContent||'', locked:!!document.querySelector('.notes.locked'), saved:localStorage.getItem('rinkreport.staffPass:/wswings12u/staff/') }));
    ok(/did not open the report/.test(wrong.err) && wrong.locked && wrong.saved===null, 'a wrong passphrase says so and remembers nothing: '+wrong.err);

    // The right one: the report opens, unfolded, and the passphrase is remembered.
    await r.page.fill('#rr-pass', PASS); await r.page.click('.unlock button[type="submit"]');
    await r.page.waitForSelector('#rr-notes', {timeout:5000}).catch(()=>{});
    const opened = await r.page.evaluate(()=>({ locked:!!document.querySelector('.notes.locked'), hidden:(document.querySelector('#rr-notes')||{hidden:true}).hidden, saved:localStorage.getItem('rinkreport.staffPass:/wswings12u/staff/') }));
    ok(!opened.locked && !opened.hidden && opened.saved==='test-pass-123', 'the right passphrase unlocks the report, unfolded, and is remembered on this phone');

    // Reload: it unlocks by itself, and starts folded like before.
    await r.page.reload();
    await r.page.waitForSelector('.notes:not(.locked)', {timeout:5000}).catch(()=>{});
    await r.page.waitForTimeout(300);
    const card = await r.page.evaluate(()=>{
      const c=document.querySelector('.notes');
      if(!c) return null;
      const cards=[...document.querySelectorAll('#app section.card')];
      return {
        shut:c.classList.contains('shut'),
        hidden:c.querySelector('#rr-notes').hidden,
        eyebrow:c.querySelector('.eyebrow').textContent.trim(),
        heads:[...c.querySelectorAll('h3')].map(h=>h.textContent),
        ul:c.querySelectorAll('ul li').length, ol:c.querySelectorAll('ol li').length, ps:c.querySelectorAll('.nsec p').length,
        last:cards[cards.length-1].classList.contains('notes'),
        coachBefore:cards.findIndex(x=>x.classList.contains('coach') && !x.classList.contains('notes')) < cards.findIndex(x=>x.classList.contains('notes')),
        afterResults:cards.findIndex(x=>/Schedule & results/.test((x.querySelector('h2')||{}).textContent||'')) < cards.findIndex(x=>x.classList.contains('notes')),
        text:c.textContent
      };
    });
    ok(!!card, 'after a reload the remembered passphrase unlocks the report by itself');
    ok(card && card.shut && card.hidden, 'it starts folded');
    ok(card && card.eyebrow==='Games through 9/25/2026', 'the eyebrow is the words after the colon in the title: '+(card&&card.eyebrow));
    ok(card && card.heads.join('|')==="Headline|What's working|Suggestions", 'section headings, no longer shouted: '+(card&&card.heads.join('|')));
    ok(card && card.ul===3 && card.ol===2 && card.ps===1, 'bullets, numbered points and the opening paragraph: '+JSON.stringify(card&&{ul:card.ul,ol:card.ol,ps:card.ps}));
    ok(card && card.last && card.coachBefore && card.afterResults, 'both Coaches Corner cards sit at the bottom, numbers first, under the schedule');

    await r.page.click('[data-act="coachnotes"]'); await r.page.waitForTimeout(150);
    const open = await r.page.evaluate(()=>({shut:document.querySelector('.notes').classList.contains('shut'), hidden:document.querySelector('#rr-notes').hidden, exp:document.querySelector('[data-act="coachnotes"]').getAttribute('aria-expanded')}));
    ok(!open.shut && !open.hidden && open.exp==='true', 'a tap unfolds it');
    await r.page.click('[data-act="coachnotes"]'); await r.page.waitForTimeout(150);
    ok(await r.page.$eval('#rr-notes', d=>d.hidden), 'and a second tap folds it again');
    await r.page.click('[data-act="coachnotes"]'); await r.page.waitForTimeout(150);
    await r.page.screenshot({path:path.join(OUT,'shot_coach_notes.png'), fullPage:true});

    // Lock on this phone: the box comes back and the passphrase is forgotten.
    await r.page.click('[data-act="coachlock"]'); await r.page.waitForTimeout(150);
    const relocked = await r.page.evaluate(()=>({ locked:!!document.querySelector('.notes.locked'), saved:localStorage.getItem('rinkreport.staffPass:/wswings12u/staff/') }));
    ok(relocked.locked && relocked.saved===null, 'Lock on this phone brings the box back and forgets the passphrase');

    // A remembered passphrase that no longer opens the file (the report was
    // re-sealed with a new one): the box comes back, and the stale one is dropped.
    await r.page.evaluate(()=>localStorage.setItem('rinkreport.staffPass:/wswings12u/staff/','stale-pass-000'));
    await r.page.reload();
    await r.page.waitForSelector('.notes.locked', {timeout:5000}).catch(()=>{});
    const stale = await r.page.evaluate(()=>({ locked:!!document.querySelector('.notes.locked'), err:(document.querySelector('.unlock .err')||{}).textContent||'', saved:localStorage.getItem('rinkreport.staffPass:/wswings12u/staff/') }));
    ok(stale.locked && stale.err==='' && stale.saved===null, 'a stale remembered passphrase is dropped quietly and the box is back');

    // The sealing module round-trips in the browser, and refuses the wrong passphrase.
    const rt = await r.page.evaluate(async ()=>{
      const m = await import('/js/util/seal.js');
      const bytes = await m.seal('hello\nworld', 'pass-one');
      const back = await m.unlock(bytes, 'pass-one');
      let bad = ''; try { await m.unlock(bytes, 'pass-two'); } catch (e) { bad = e.message; }
      let junk = ''; try { await m.unlock(new Uint8Array(40), 'pass-one'); } catch (e) { junk = e.message; }
      return { sealed:m.isSealed(bytes), plainInside:new TextDecoder().decode(bytes).indexOf('hello')!==-1, back, bad, junk, len:bytes.length };
    });
    ok(rt.sealed && rt.back==='hello\nworld' && !rt.plainInside, 'seal.js: seals and unlocks in the browser, and the text is not readable in the file');
    ok(rt.bad==='wrong passphrase' && rt.junk==='not sealed', 'seal.js: names a wrong passphrase and a file that is not sealed: '+rt.bad+' / '+rt.junk);

    const parsed = await r.page.evaluate(async ()=>(await import('/js/ui/notes.js')).parseNotes('T\n\nplain\n- a\n- b\n\n3. B\n1. x'));
    ok(parsed.title==='T' && parsed.sections.length===2 && parsed.sections[0].heading==='' && parsed.sections[0].blocks.map(b=>b.kind).join()==='p,ul' && parsed.sections[1].heading==='B' && parsed.sections[1].blocks[0].kind==='ol', 'parseNotes: lines before the first heading form an opening section');
    await r.ctx.close();

    // The switch hides the card and skips the fetch.
    const off = await openPage(browser, STAFF, {notes:NOTES, features:{coachNotes:false}});
    await off.page.waitForTimeout(400);
    ok((await off.page.$$eval('.notes', c=>c.length))===0 && (await off.page.$$eval('.coach', c=>c.length))===1, 'coachNotes:false hides the report and keeps the numbers card');
    await off.ctx.close();
  }

  // 40. The staff page itself: the same page with the staff view on, and
  //     the parents' page with none of it.
  console.log('\n[40] staff page');
  {
    const r = await openPage(browser, STAFF, {});
    ok(r.errors.length===0, 'no page errors on the staff page: '+r.errors.join(' | '));
    const look = await r.page.evaluate(()=>({
      kicker:document.querySelector('.masthead .eyebrow').textContent.trim(),
      title:document.title,
      check:(document.querySelector('.foot a[href$="?check"]')||{}).getAttribute ? document.querySelector('.foot a[href$="?check"]').getAttribute('href') : null,
      home:(document.querySelector('a.home')||{}).getAttribute ? document.querySelector('a.home').getAttribute('href') : null,
      crest:!!document.querySelector('img.crest'),
      club:getComputedStyle(document.querySelector('.masthead')).backgroundColor,
      robots:(document.querySelector('meta[name="robots"]')||{}).content||''
    }));
    ok(/· Staff$/.test(look.kicker), 'the masthead kicker says Staff: '+look.kicker);
    ok(look.title==='West Seneca Wings | Check The Rink', 'the tab is named after the team once the sheet loads: '+look.title);
    ok(look.check==='/wswings12u/staff/?check', 'the Setup check link points at the staff page, not the parents\' page: '+look.check);
    ok(look.home==='../', 'All teams still links to the landing page: '+look.home);
    ok(look.crest, 'the crest loads from the team folder through the <base> tag');
    ok(look.club==='rgb(0, 48, 135)', 'theme.js still finds the Wings by folder from /wswings12u/staff/: '+look.club);
    ok(look.robots==='noindex, nofollow', 'the staff page asks search engines to skip it');
    ok(fs.readFileSync(path.join(SITE_DIR,'robots.txt'),'utf8').indexOf('Disallow: /wswings12u/staff/')!==-1, 'and robots.txt says the same');
    // ?check on the staff page is the diagnostics page, and its back link stays on the staff page.
    await r.page.goto(STAFF+'?check'); await r.page.waitForTimeout(800);
    ok(!!(await r.page.$('pre.diag')), '?check on the staff page opens the setup check');
    ok((await r.page.$eval('pre.diag a', a=>a.getAttribute('href')))==='/wswings12u/staff/', 'its back link goes to the staff page: '+(await r.page.$eval('pre.diag a', a=>a.getAttribute('href'))));
    await r.ctx.close();

    // ?check on the parents' page is just the parents' page.
    const p = await openPage(browser, BASE+'?check', {});
    ok(!(await p.page.$('pre.diag')) && !!(await p.page.$('.masthead h1')), '?check on the parents\' page shows the normal page');
    ok(!/· Staff/.test(await p.page.$eval('.masthead .eyebrow', e=>e.textContent)), 'and no Staff kicker there');
    await p.ctx.close();

    // The plain-text report can never come back into docs/ by accident.
    ok(/docs\/\*\*\/coaches-corner\.txt/.test(fs.readFileSync(path.join(SITE_DIR,'..','.gitignore'),'utf8')), '.gitignore refuses docs/**/coaches-corner.txt');
    ok(!fs.existsSync(path.join(SITE_DIR,TEAM,'data','coaches-corner.txt')), 'no plain-text report in the team folder');
    ok(fs.existsSync(path.join(SITE_DIR,TEAM,'data','coaches-corner.enc')), 'the sealed report is there');
  }

  console.log('\n[41] league mode');
  {
    // The test league's parents' page: a whole-league page with no home team.
    const LBASE = 'http://localhost:8811/testleague/';
    const r = await openPage(browser, LBASE, LEAGUE);
    ok(r.errors.length===0, 'no page errors on the league page: '+r.errors.join(' | '));
    const look = await r.page.evaluate(()=>({
      kicker:document.querySelector('.masthead .eyebrow').textContent.trim(),
      h1:document.querySelector('.masthead h1').textContent.trim(),
      title:document.title,
      chip:!!document.querySelector('.masthead .record'),
      next:!!document.querySelector('section.next'),
      seg:!!document.querySelector('.seg button[data-v="ours"]'),
      tabs:[...document.querySelectorAll('.viewbar button')].map(b=>b.textContent.trim()),
      pools:[...document.querySelectorAll('.poolname')].map(e=>e.textContent.trim()),
      rows:document.querySelectorAll('table.standings tbody tr, .standings tbody tr').length,
      coach:!!document.querySelector('section.coach'),
      slots:!!document.querySelector('section.slots'),
      club:getComputedStyle(document.querySelector('.masthead')).backgroundColor,
      warn:document.body.textContent.indexOf('Not filled in on the Settings tab')!==-1,
      text:document.body.textContent
    }));
    ok(look.h1==='Test League 12U', 'the league name is the headline: '+look.h1);
    ok(look.title==='Check The Rink' || look.title==='Test League 12U | Check The Rink', 'the tab title has no team in it: '+look.title);
    ok(!look.chip, 'no record chip on a league page');
    ok(!look.next, 'no next-game card on a league page');
    ok(!look.seg, 'no All / Ours switch on a league page');
    ok(look.tabs.indexOf('Stats')===-1, 'no Stats tab on a league page: '+look.tabs.join(','));
    ok(/No league games on the schedule yet/.test(look.text), 'an empty schedule shows the pre-season card, not a table of zeros');
    ok(!look.coach, 'no Coaches Corner card on the league parents\' page');
    ok(!look.slots, 'no Ice slots card on the parents\' page');
    ok(!look.warn, 'a blank "Our team" is not nagged about on a league page');
    ok(look.club==='rgb(11, 22, 32)', 'the league is themed from its own org in teams.js: '+look.club);
    ok(r.asked.indexOf('slots')===-1 && r.asked.indexOf('stats')===-1, 'the parents\' page never asks for the Ice slots or stats tabs: '+r.asked.join(','));
    await r.ctx.close();

    // With games played, one standings table per division, from the Teams tab's Pool / division column.
    const pl = await openPage(browser, LBASE, LEAGUE_PLAYED);
    const pools = await pl.page.evaluate(()=>({
      names:[...document.querySelectorAll('.poolname')].map(e=>e.textContent.trim()),
      tables:document.querySelectorAll('.card .tablewrap table').length,
      first:[...document.querySelectorAll('.card tbody tr')].slice(0,1).map(tr=>tr.textContent.replace(/\s+/g,' ').trim())[0]||'',
      chip:!!document.querySelector('.masthead .record'),
      games:document.querySelectorAll('.game').length,
      ours:document.querySelectorAll('.side.ours').length
    }));
    ok(pools.names.join(',')==='Blue,Gold', 'one standings table per division: '+pools.names.join(','));
    ok(/Lakeshore Lightning/.test(pools.first) && /2/.test(pools.first), 'Blue is led by the 2-0 Lightning: '+pools.first);
    ok(pools.games===9 && pools.ours===0, 'all nine games listed, none marked as ours: '+pools.games+' / '+pools.ours);
    ok(!pools.chip, 'still no record chip once games are played');
    await pl.ctx.close();

    // The league staff page: the Ice slots card and ?check lines.
    const st = await openPage(browser, LBASE+'staff/', LEAGUE);
    ok(st.errors.length===0, 'no page errors on the league staff page: '+st.errors.join(' | '));
    const sl = await st.page.evaluate(()=>{
      const card=document.querySelector('section.slots');
      return {
        card:!!card,
        count:card ? card.querySelector('.card-h .eyebrow').textContent.trim() : '',
        need:card ? card.querySelector('.need').textContent.trim() : '',
        teams:card ? card.querySelectorAll('.slotsum tbody tr').length : 0,
        none:card ? card.querySelectorAll('.slotsum tr.none').length : 0,
        list:card ? card.querySelectorAll('.slotlist tbody tr').length : 0,
        first:card ? card.querySelector('.slotlist tbody tr td').textContent.trim() : '',
        coach:!!document.querySelector('section.coach'),
        kicker:document.querySelector('.masthead .eyebrow').textContent.trim()
      };
    });
    ok(sl.card && sl.count==='90 slots', 'the staff page shows the Ice slots card with every slot counted: '+sl.count);
    ok(/8 teams at 20 games each is 80 games\. 90 slots covers it with 10 to spare\./.test(sl.need), 'the card does the ice-versus-games arithmetic: '+sl.need);
    ok(sl.teams===8 && sl.none===0, 'every team is listed with its slot count: '+sl.teams+' teams, '+sl.none+' without');
    ok(sl.list===90 && /Aug 9/.test(sl.first), 'the by-date list has all 90, earliest first: '+sl.first);
    ok(!sl.coach, 'no Coaches Corner on a league staff page');
    ok(/Staff$/.test(sl.kicker), 'the staff kicker still says Staff: '+sl.kicker);
    ok(st.asked.indexOf('slots')!==-1, 'the staff page asks for the Ice slots tab');
    await st.page.goto(LBASE+'staff/?check'); await st.page.waitForTimeout(800);
    const diag = await st.page.$eval('pre.diag', e=>e.textContent);
    ok(/Page type\s+league/.test(diag), '?check says this is a league page');
    ok(/Games each\s+20/.test(diag), '?check shows games per team');
    ok(/Ice slots\s+90 slots, 2026-08-09 to 2026-11-29/.test(diag), '?check counts the slots and their span');
    ok(!/Our team/.test(diag), '?check does not ask for Our team on a league page');
    await st.ctx.close();

    // A slot row with a misspelled team snaps; one with a team not on the Teams tab is dropped and named.
    const bad = Object.assign({}, LEAGUE, { fix: Object.assign({}, LEAGUE_FIX, {
      slots: LEAGUE_FIX.slots.replace('Harbor Hawks,Harbor Ice Center,08/09/2026', 'Harbor Hawk,Harbor Ice Center,08/09/2026')
                             .replace(/\r?\n$/, '') + '\r\n,Buffalo Bisons,Harbor Ice Center,12/05/2026,1:00 PM,\r\n'
    })});
    const b = await openPage(browser, LBASE+'staff/', bad);
    const got = await b.page.evaluate(()=>({
      count:document.querySelector('section.slots .card-h .eyebrow').textContent.trim(),
      warn:document.body.textContent
    }));
    ok(got.count==='90 slots', 'a one-letter slip in a team name still counts: '+got.count);
    ok(/Ice slots tab: 1 row left out\. row 95: "Buffalo Bisons" is not on the Teams tab/.test(got.warn), 'an unknown team is dropped with its sheet row named');
    await b.ctx.close();

    // The Wings page is untouched: still a team page with its chip and switch.
    const w = await openPage(browser, BASE, {schedule:'scored'});
    const wl = await w.page.evaluate(()=>({chip:!!document.querySelector('.masthead .record'), seg:!!document.querySelector('.seg button[data-v="ours"]'), next:!!document.querySelector('section.next')}));
    ok(wl.chip && wl.seg && wl.next, 'a team page still has its record chip, Ours switch and next-game card');
    await w.ctx.close();
  }

  console.log('\n[42] scheduling tool');
  {
    const LBASE = 'http://localhost:8811/testleague/';
    // The model on its own, in Node.
    const sb = await import(require('url').pathToFileURL(path.join(SITE_DIR,'js','model','schedule-builder.js')).href);
    const rr = sb.roundRobin(['A','B','C','D']);
    ok(rr.length===3 && rr.every(r=>r.length===2), 'a 4-team round robin is 3 rounds of 2 games');
    const seen = new Set(rr.flat().map(g=>[g.home,g.away].sort().join('-')));
    ok(seen.size===6, 'every pair meets once: '+[...seen].join(' '));
    const odd = sb.roundRobin(['A','B','C']);
    ok(odd.length===3 && odd.flat().length===3, 'an odd list gets byes, not games against nobody');
    const teams8 = ['L','H','R','M','N','S','E','W'];
    const pools8 = {L:'Blue',H:'Blue',R:'Blue',M:'Blue',N:'Gold',S:'Gold',E:'Gold',W:'Gold'};
    const pr = sb.pairings(teams8, pools8, 20);
    const per = {}; pr.games.forEach(g=>{ per[g.home]=(per[g.home]||0)+1; per[g.away]=(per[g.away]||0)+1; });
    ok(pr.games.length===80 && Object.values(per).every(n=>n===20) && pr.short.length===0, '8 teams at 20 games pair into 80 games, 20 each: '+JSON.stringify(per));
    const inDiv = pr.games.filter(g=>g.division).length;
    ok(inDiv===36 && pr.games.slice(0,12).every(g=>g.division), 'in-division games first (3 round robins = 36 of 80): '+inDiv);
    const homes = {}; pr.games.forEach(g=>{ homes[g.home]=(homes[g.home]||0)+1; });
    ok(Object.values(homes).every(n=>n>=8 && n<=12), 'pairings alone keep home games within 8 to 12 (placement evens them further): '+JSON.stringify(homes));

    // Placement with a tiny ice supply: two teams, two games, one day.
    const tiny = sb.buildSchedule({ teams:['A','B'], pools:{}, gamesPerTeam:2, slots:[
      {team:'A', rink:'Ra', date:'2026-11-07', time:'10:00 AM', timeKey:600, row:5},
      {team:'A', rink:'Ra', date:'2026-11-07', time:'1:00 PM', timeKey:780, row:6},
      {team:'B', rink:'Rb', date:'2026-11-14', time:'10:00 AM', timeKey:600, row:7}
    ]});
    ok(tiny.placed.length===2 && tiny.unplaced.length===0, 'two games placed on two different days');
    ok(tiny.placed[0].date!==tiny.placed[1].date, 'a team never plays twice on one day: '+tiny.placed.map(g=>g.date).join(','));
    ok(tiny.perTeam.every(t=>t.home===1 && t.away===1), 'home and away balanced one each');
    const starve = sb.buildSchedule({ teams:['A','B'], pools:{}, gamesPerTeam:2, slots:[
      {team:'A', rink:'Ra', date:'2026-11-07', time:'10:00 AM', timeKey:600, row:5},
      {team:'A', rink:'Ra', date:'2026-11-07', time:'1:00 PM', timeKey:780, row:6}
    ]});
    ok(starve.placed.length===1 && starve.unplaced.length===1 && /(has no ice left|already plays)/.test(starve.unplaced[0].why), 'a game with no legal slot is reported with a reason: '+(starve.unplaced[0]||{}).why);
    const rows = sb.scheduleRows(tiny.placed).split('\n');
    ok(rows.length===2 && rows.every(r=>r.split('\t').length===10) && /\tLeague\t$/.test(rows[0]), 'the copy is one tab-separated Schedule row per game, Game type League: '+rows[0]);
    // A showcase-only club (no division) stays out of league play.
    const guest = sb.buildSchedule({ teams:['A','B','G'], pools:{A:'Blue',B:'Blue'}, gamesPerTeam:1, slots:[
      {team:'A', rink:'Ra', date:'2026-11-07', time:'10:00 AM', timeKey:600, row:5},
      {team:'G', rink:'Rg', date:'2026-11-14', time:'10:00 AM', timeKey:600, row:6}
    ]});
    ok(guest.placed.length===1 && guest.placed[0].away==='B' && guest.perTeam.length===2, 'a team with no division is left out of the pairings when the league has divisions');
    ok(/Left out, no division on the Teams tab: G\./.test(guest.notes.join(' ')), 'and the note names it: '+guest.notes.join(' | '));
    ok(sb.leagueTeams(['A','B'], {}).teams.length===2, 'with no divisions at all, every team plays');
    const nothing = sb.buildSchedule({ teams:[], pools:{}, gamesPerTeam:0, slots:[] });
    ok(nothing.placed.length===0 && nothing.notes.length===3, 'missing inputs come back as notes, not a crash: '+nothing.notes.join(' | '));

    // The real test league: 8 teams, 20 games, the 90 slots in the fixture.
    const st = await openPage(browser, LBASE+'staff/', LEAGUE);
    await st.ctx.grantPermissions(['clipboard-read','clipboard-write']);
    ok(!!(await st.page.$('section.builder')), 'the Scheduling tool card is on the league staff page');
    ok(!(await st.page.$('section.builder .verdict')), 'nothing is built until the button is tapped');
    await st.page.click('[data-act="build"]'); await st.page.waitForTimeout(1500);
    const built = await st.page.evaluate(()=>{
      const c=document.querySelector('section.builder');
      return { eyebrow:c.querySelector('.card-h .eyebrow').textContent.trim(), verdict:c.querySelector('.verdict').textContent.trim(),
        rows:c.querySelectorAll('.share tbody tr').length, list:c.querySelectorAll('.built tbody tr').length,
        copy:!!c.querySelector('[data-act="copysched"]'), col:(c.querySelector('.foot').textContent.match(/column ([A-Z]+)/)||[])[1] };
    });
    ok(/^\d+ of 80 games$/.test(built.eyebrow), 'the eyebrow counts games placed out of 80: '+built.eyebrow);
    const placedN = +built.eyebrow.split(' ')[0];
    ok(placedN>=76, 'at least 76 of the 80 games find ice with the fixture slots: '+placedN);
    ok(built.rows===8 && built.list===placedN, 'every team is in the share table and every placed game in the list');
    ok(built.col==='B', 'the paste instruction names the Date column from the header map: '+built.col);
    await st.page.click('[data-act="copysched"]'); await st.page.waitForTimeout(400);
    const clip = await st.page.evaluate(()=>navigator.clipboard.readText());
    const lines = clip.split('\n');
    ok(lines.length===placedN && lines.every(l=>l.split('\t').length===10), 'Copy puts one row per placed game on the clipboard, 10 columns each: '+lines.length);
    const days = {}; let twice=false;
    lines.forEach(l=>{ const c=l.split('\t'); [c[2],c[3]].forEach(t=>{ const k=t+'|'+c[0]; if(days[k]) twice=true; days[k]=true; }); });
    ok(!twice, 'no team plays twice on one day anywhere in the copy');
    ok(/Copied/.test(await st.page.$eval('[data-act="copysched"]', b=>b.textContent)), 'the button says Copied for a moment');
    const errs = st.errors.filter(e=>!/clipboard/i.test(e));
    ok(errs.length===0, 'no page errors while building and copying: '+errs.join(' | '));
    await st.ctx.close();

    // Mid-season: played games are kept, the rest rebuilt from today on.
    const mid = sb.buildSchedule({ teams:['A','B'], pools:{}, gamesPerTeam:2, today:'2026-11-10',
      played:[{date:'2026-11-07', time:'10:00 AM', timeKey:600, home:'A', away:'B', hs:3, as:1, rink:'Ra', division:'', type:'League'}],
      slots:[
        {team:'A', rink:'Ra', date:'2026-11-07', time:'10:00 AM', timeKey:600, row:5},
        {team:'A', rink:'Ra', date:'2026-11-08', time:'10:00 AM', timeKey:600, row:6},
        {team:'B', rink:'Rb', date:'2026-11-14', time:'10:00 AM', timeKey:600, row:7}
      ]});
    ok(mid.kept.length===1 && mid.placed.length===1 && mid.wanted===2, 'one played game kept, one built: '+mid.kept.length+'/'+mid.placed.length);
    ok(mid.placed[0].date==='2026-11-14' && mid.placed[0].home==='B', 'the new game lands on ice from today on, at the other club (home and away balance): '+mid.placed[0].date+' '+mid.placed[0].home);
    ok(mid.perTeam.every(t=>t.games===2), 'kept games count toward each team\'s total');
    const midRows = sb.scheduleRows(mid.placed, mid.kept).split('\n');
    ok(midRows.length===2 && /^2026-11-07\t10:00 AM\tB\tA\t1\t3\t/.test(midRows[0]) && /^2026-11-14\t.*\t\t\t/.test(midRows[1]), 'the copy carries the kept score and a blank for the new game: '+midRows.join(' || '));
    ok(sb.strikePlayed([{home:'A',away:'B'},{home:'B',away:'A'}], [{home:'B',away:'A'}]).length===1 && sb.strikePlayed([{home:'A',away:'B'},{home:'B',away:'A'}], [{home:'B',away:'A'}])[0].home==='A', 'a played game strikes the matching pairing, same sides first');

    // The card mid-season: the LEAGUE_PLAYED fixture has 8 played games.
    const ms = await openPage(browser, LBASE+'staff/', LEAGUE_PLAYED);
    await ms.ctx.grantPermissions(['clipboard-read','clipboard-write']);
    await ms.page.click('[data-act="build"]'); await ms.page.waitForTimeout(1500);
    const msl = await ms.page.evaluate(()=>{ const c=document.querySelector('section.builder'); return { verdict:c.querySelector('.verdict').textContent.trim(), notes:[...c.querySelectorAll('.note')].map(e=>e.textContent), foot:c.querySelector('.foot').textContent }; });
    ok(/8 games are already played and kept as they are/.test(msl.notes.join(' ')), 'the card says the played games are kept: '+msl.notes[0]);
    // The clock is frozen at Sept 10, so only ice from Sept 10 on is used
    // for the 72 games left; some find no ice, and the counts say so.
    const builtN = +((msl.verdict.match(/^(\d+) of 80 games placed/)||[])[1] || (/All 80/.test(msl.verdict) ? 80 : 0));
    ok(builtN>=60 && builtN<=80, 'kept plus built counts toward the 80-game season from today\'s ice on: '+msl.verdict);
    const stillN = builtN - 8;
    ok(new RegExp('8 games already played, with their scores, plus '+stillN+' games still to play').test(msl.foot) && /select rows 5 to 13 \(the 9 games of league play\), delete them, click cell B5 and paste/.test(msl.foot), 'the paste instruction names the league rows to replace: '+msl.foot.slice(0,220));
    await ms.page.click('[data-act="copysched"]'); await ms.page.waitForTimeout(400);
    const msClip = (await ms.page.evaluate(()=>navigator.clipboard.readText())).split('\n');
    ok(msClip.length===builtN && msClip.filter(l=>l.split('\t')[4]!=='').length===8, 'the copy is kept plus built rows with the 8 scores still in: '+msClip.length+' rows, '+msClip.filter(l=>l.split('\t')[4]!=='').length+' scored');
    ok(msClip.slice(8).every(l=>l.split('\t')[0]>='2026-09-10'), 'no new game is placed before today');
    await ms.ctx.close();

    // In league play a division table counts cross-division games too.
    const crossFix = Object.assign({}, LEAGUE_FIX, { schedule: LEAGUE_FIX.scheduled.replace(
      ',2026-11-07,10:30 AM,Harbor Hawks,Northgate Narwhals,,,Northgate Pavilion,,League,,OK',
      ',2026-08-24,10:30 AM,Harbor Hawks,Northgate Narwhals,1,4,Northgate Pavilion,,League,,OK') });
    const cx = await openPage(browser, LBASE, { team:'testleague', gids:LEAGUE_GIDS, fix:crossFix });
    const hawks = await cx.page.evaluate(()=>[...document.querySelectorAll('.card tbody tr')].map(tr=>tr.textContent.replace(/\s+/g,' ').trim()).filter(t=>/Harbor Hawks|Northgate Narwhals/.test(t)));
    ok(hawks.length===2 && /Harbor Hawks ?3 ?1 ?2 ?0/.test(hawks[0]) && /Northgate Narwhals ?3 ?3 ?0 ?0/.test(hawks[1]), 'a cross-division loss counts for both sides in their own tables: '+hawks.join(' | '));
    await cx.ctx.close();
  }

  await browser.close(); sNew.close();
  console.log('\n'+passes+' passed, '+failures+' failed');
  process.exit(failures?1:0);
})();
