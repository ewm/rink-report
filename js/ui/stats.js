/* Component: the Stats page.

statsHtml() -> HTML: the skater table (points, goals, number) and the
goalie table, from state.data.stats. Nothing here computes a stat; the
sheet does that, and the page shows what the sheet says. */
import { state } from "../state.js";
import { esc } from "../util/text.js";

/* Whole numbers print plain; a minute-and-a-half minor prints as 1.5. */
function fmtNum(n){
  if(n===null||n===undefined) return "—";
  return (Math.round(n)===n) ? String(n) : String(Math.round(n*10)/10);
}
/* Save percentage the way a program prints it: .923, no leading zero. A sheet
   that stores 92.3 instead of 0.923 comes out the same. */
function fmtPct(n){
  if(n===null||n===undefined) return "—";
  if(n>1.0001) n=n/100;
  var s=(Math.round(n*1000)/1000).toFixed(3);
  return n>=1 ? "1.000" : s.replace(/^0/,"");
}
function statsHtml(){
  var s=state.data.stats, h="", gp=0, i;
  if(!s) return "";
  for(i=0;i<s.skaters.length;i++) if(s.skaters[i].gp>gp) gp=s.skaters[i].gp;
  var through = gp ? "Through "+gp+" game"+(gp===1?"":"s") : "Season";

  if(s.skaters.length){
    h+='<section class="card skaters"><div class="card-h"><h2>Skaters</h2><span class="eyebrow">'+esc(through)+'</span></div><div class="card-b">';
    h+='<div class="tablewrap"><table><thead><tr><th scope="col">Player</th><th scope="col">GP</th>'+
       '<th scope="col">G</th><th scope="col">A</th><th scope="col">Pts</th><th scope="col">PIM</th></tr></thead><tbody>';
    s.skaters.forEach(function(p){
      h+='<tr><td><span class="rank">'+(p.no!==null?esc(fmtNum(p.no)):"")+"</span>"+esc(p.name)+"</td>"+
         "<td>"+fmtNum(p.gp)+"</td><td>"+fmtNum(p.g)+"</td><td>"+fmtNum(p.a)+'</td><td class="pts">'+fmtNum(p.pts)+"</td><td>"+fmtNum(p.pim)+"</td></tr>";
    });
    h+="</tbody></table></div>";
    h+='<p class="foot">Sorted by points, then goals. PIM counts each 1:30 minor as 1.5.</p>';
    h+="</div></section>";
  }
  if(s.goalies.length){
    h+='<section class="card"><div class="card-h"><h2>In net</h2><span class="eyebrow">'+esc(through)+'</span></div><div class="card-b">';
    h+='<div class="tablewrap"><table><thead><tr><th scope="col">Goalie</th><th scope="col">GP</th><th scope="col">Min</th>'+
       '<th scope="col">SV</th><th scope="col">GA</th><th scope="col">SV%</th><th scope="col">SO</th><th scope="col">W</th><th scope="col">L</th></tr></thead><tbody>';
    s.goalies.forEach(function(g){
      // The sheet totals saves with a formula, so a goalie whose games never
      // had saves recorded comes through as 0, which reads as "stopped
      // nothing". No save percentage is the tell that nothing was recorded.
      var saves = (g.saves===0 && g.svpct===null && g.ga) ? null : g.saves;
      h+='<tr><td><span class="rank">'+(g.no!==null?esc(fmtNum(g.no)):"")+"</span>"+esc(g.name)+"</td>"+
         "<td>"+fmtNum(g.gp)+"</td><td>"+fmtNum(g.min)+"</td><td>"+fmtNum(saves)+"</td><td>"+fmtNum(g.ga)+
         '</td><td class="pts">'+fmtPct(g.svpct)+"</td><td>"+fmtNum(g.so)+"</td><td>"+fmtNum(g.w)+"</td><td>"+fmtNum(g.l)+"</td></tr>";
    });
    h+="</tbody></table></div>";
    h+='<p class="foot">Not every scoresheet records saves. SV% uses only the games that did; a dash means none have yet.</p>';
    h+="</div></section>";
  }
  return h;
}

export { statsHtml };
