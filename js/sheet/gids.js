/* Working out a sheet's tab IDs for the setup check.

Google's htmlview page lists every gid; each one identifies itself by its
header row when exported. Only runs when the setup page decides the IDs in
the config are missing or wrong. */
import { CFG } from "../config.js";
import { notify, state } from "../state.js";
import { bare, norm } from "../util/text.js";

function needGidHelp(){
  var g=CFG.gids||{};
  if(state.routeTrouble.length) return true;
  return !g.settings || !g.teams || !g.schedule;
}

/* True when the tab IDs the lookup found are the ones already configured, in
   which case there is nothing for anyone to do about them. */
function gidHintMatchesConfig(){
  var cfg=CFG.gids||{}, k, m;
  for(k in cfg) if(Object.prototype.hasOwnProperty.call(cfg,k)){
    m=new RegExp(k+':\\s*"(\\d+)"').exec(state.gidHint);
    if(!m || m[1]!==String(cfg[k])) return false;
  }
  return true;
}

/* The setup page can work out this sheet's real tab IDs on its own: Google's
   htmlview page lists them, and each one identifies itself when exported. */
function findGids(){
  var id=encodeURIComponent(CFG.sheetId||"");
  var base="https://docs.google.com/spreadsheets/d/"+id;
  fetch(base+"/htmlview",{cache:"no-store",credentials:"omit"}).then(function(r){ return r.text(); }).then(function(t){
    var seen={}, list=[], m, re=/gid=(\d{5,12})/g;
    while((m=re.exec(t))!==null){ if(!seen[m[1]]){ seen[m[1]]=1; list.push(m[1]); } }
    if(!list.length) throw new Error("none found");
    return Promise.all(list.slice(0,10).map(function(g){
      return fetch(base+"/export?format=csv&gid="+g,{cache:"no-store",credentials:"omit"})
        .then(function(r){ return r.ok?r.text():""; })
        .then(function(body){ return {gid:g, head:norm(body.slice(0,1500))}; })
        .catch(function(){ return {gid:g, head:""}; });
    }));
  }).then(function(found){
    /* Match the tab's HEADER ROW, not any text on the tab. Looking for the
       bare word "teamname" anywhere in the first few hundred characters found
       it inside the Settings tab's own hint text ("the small line above the
       team name") and handed back the Settings gid for the Teams tab. Each
       marker below is two adjacent column headings, which no prose contains.
       A gid already claimed cannot be claimed again. */
    var want={settings:"fieldyouranswer", teams:"teamnamepool", schedule:"datefaceoffawayteam", stats:"noplayergpgapts"},
        out=bare(), taken=bare(), k;
    for(k in want) if(Object.prototype.hasOwnProperty.call(want,k)){
      for(var i=0;i<found.length;i++){
        if(taken[found[i].gid]) continue;
        if(found[i].head.indexOf(want[k])!==-1){ out[k]=found[i].gid; taken[found[i].gid]=1; break; }
      }
    }
    if(out.settings||out.teams||out.schedule){
      state.gidHint = '  gids: { settings: "'+(out.settings||"?")+'", teams: "'+(out.teams||"?")+
                '", schedule: "'+(out.schedule||"?")+'"'+(out.stats?', stats: "'+out.stats+'"':"")+' },\n  (paste that line over the gids line in index.html)';
    } else {
      state.gidHint = "  couldn't identify the tabs automatically — click each tab in the sheet and copy the number after gid= in the address bar";
    }
    notify();
  }).catch(function(){
    state.gidHint = "  lookup failed — click each tab in the sheet and copy the number after gid= in the address bar";
    notify();
  });
}

export { needGidHelp, gidHintMatchesConfig, findGids };
