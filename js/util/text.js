/* Text helpers shared by every layer.

esc()  — the one gate between sheet text and HTML. Anything a manager can
         type into the sheet passes through it before it reaches innerHTML.
norm() — the comparison form of a string: lowercase, letters and digits only.
         Header matching, team-name snapping and settings labels all use it.
bare() — an object with no prototype, for any map keyed by sheet text
         (a team called "__proto__" is a legal team name). */

function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function norm(s){return String(s==null?"":s).toLowerCase().replace(/[^a-z0-9]/g,"");}
function clean(s){return String(s==null?"":s).replace(/\s+/g," ").trim();}
/* Sheet-derived text becomes object keys in several places. A team literally
   named "__proto__" or "constructor" would otherwise walk the Object prototype
   and corrupt every lookup, so every name-keyed map starts with no prototype. */
function bare(){ return Object.create ? Object.create(null) : {}; }

/* A rename usually leaves two names that differ by a character or two, so when
   a Schedule name matches nothing, say which Teams-tab name it nearly matched.
   "not on the Teams tab" sends you hunting; "you have both Southtown Stars and
   Southtowns Stars" is the actual answer. */
function editDistance(a,b){
  if(a===b) return 0;
  if(Math.abs(a.length-b.length)>3) return 99;
  var prev=[], cur=[], i, j;
  for(j=0;j<=b.length;j++) prev[j]=j;
  for(i=1;i<=a.length;i++){
    cur[0]=i;
    for(j=1;j<=b.length;j++){
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));
    }
    for(j=0;j<=b.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}
function nearestName(name, list){
  var n=norm(name), best=null, bestD=3, i, d;
  for(i=0;i<list.length;i++){
    d=editDistance(n, norm(list[i]));
    if(d<bestD){ bestD=d; best=list[i]; }
  }
  return best;
}

function num(v){
  var s=clean(v);
  if(s==="") return null;
  if(!/^-?\d+(\.0+)?$/.test(s)) return null;
  var n=parseInt(s,10);
  return (isNaN(n)||n<0)?null:n;
}

export { esc, norm, clean, bare, editDistance, nearestName, num };
