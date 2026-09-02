/* The Settings tab -> the config object.

Rows are matched by label prefix (order matters, see SETTINGS_ROWS). The
block ends at the first blank label or at the readiness panel's headings. */
import { state } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { clean, norm, num } from "../util/text.js";

var SPEC_SETTINGS = { field:["field","setting"], value:["youranswer","answer","value"], notes:["notes","note"] };

/* Settings labels are matched by PREFIX, and that is not a detail.
   Matching on "contains" reads the readiness panel below the settings block
   as more settings: "Your team is filled in" contains "our team", so the
   team name came out as the word OK. Anchoring at the start of the label
   kills that whole family of collision.

   The ORDER of this list still disambiguates the rest: "tiebreak rules"
   starts with "tie" as well, so the tiebreak row has to sit above the points
   rows. Adding a setting means adding a row here and nothing else, but add
   it in the right place rather than at the end. */
var SETTINGS_ROWS = [
  { match:["tiebreak"], apply:function(c,v){ c.rules = norm(v); } },
  { match:["ourteam","myteam","teamname"], apply:function(c,v){ c.teamName = v; } },
  { match:["whichview","viewopens","showcaseweekend","seasonorshowcase"],
    apply:function(c,v){ c.mode = norm(v).indexOf("showcase")!==-1 ? "showcase" : "season"; } },
  { match:["league","showcase","eventname","event"], apply:function(c,v){ c.leagueName = v; } },
  { match:["pointsforawin","win"],   apply:function(c,v){ c.ptsWin  = num(v)===null ? 2 : num(v); } },
  { match:["pointsforatie","tie"],   apply:function(c,v){ c.ptsTie  = num(v)===null ? 1 : num(v); } },
  { match:["pointsforaloss","loss"], apply:function(c,v){ c.ptsLoss = num(v)===null ? 0 : num(v); } }
];
function applySetting(cfg, label, val){
  for(var i=0;i<SETTINGS_ROWS.length;i++){
    var pats=SETTINGS_ROWS[i].match;
    for(var j=0;j<pats.length;j++){
      if(label.indexOf(pats[j])===0){ SETTINGS_ROWS[i].apply(cfg,val); return; }
    }
  }
}

/* The settings block is supposed to end at a blank row. It does on the raw
   export route. The tab-name route drops entirely-empty rows on the floor, so
   on that route the blank row vanishes and the readiness panel underneath
   arrives looking like more settings. Stop at the panel's own headings too. */
var PANEL_HEADINGS = ["beforeyousend","requirement","theseupdatethemselves"];
function isPanelHeading(label){
  for(var i=0;i<PANEL_HEADINGS.length;i++) if(label.indexOf(PANEL_HEADINGS[i])===0) return true;
  return false;
}
function shapeSettings(rows){
  var c={leagueName:"",teamName:"",mode:"season",ptsWin:2,ptsTie:1,ptsLoss:0,rules:""};
  // Read the "Your answer" column by position. Collapsing non-empty cells
  // instead would slide the Notes column into an unanswered row.
  var hdr=locateHeader(rows,SPEC_SETTINGS);
  // When the answer column gets typed numeric its own header is nulled too,
  // so fall back to "the column just right of Field" rather than giving up
  // and collapsing the row, which would slide Notes into the answer slot.
  var valCol;
  if(hdr && hdr.map.field!==undefined){
    valCol = hdr.map.value!==undefined ? hdr.map.value : hdr.map.field+1;
    if(valCol===hdr.map.notes) valCol = undefined;
  }
  var byCol = valCol!==undefined;
  if(byCol) hdr.map.value = valCol;
  var blanks=0, blankFields=[];
  for(var r=(byCol?hdr.headerIndex+1:0); r<rows.length; r++){
    var label, val;
    if(byCol){
      label=norm(rows[r][hdr.map.field]);
      // The settings block ends at the first empty Field cell. Anything below
      // that is another section — the readiness panel, for one, whose row
      // labels ("Your team is filled in") otherwise match these same tests
      // and hand back the word OK.
      if(!label || isPanelHeading(label)) break;
      val=clean(rows[r][valCol]);
      if(val===""){ blanks++; blankFields.push(label); }
    } else {
      var cells=rows[r].map(clean).filter(function(x){return x!=="";});
      if(cells.length<2) continue;
      label=norm(cells[0]); val=cells[1];
    }
    if(!label || val==="") continue;
    applySetting(c, label, val);
  }
  // Google's sheet reader types each column. When the answer column holds both
  // words and the points numbers, it decides the column is numeric and returns
  // the words as blank — silently. Detect that exact shape and name the fix.
  if(byCol && blanks>=2 && !c.teamName && !c.leagueName &&
     (c.ptsWin!==2 || c.ptsTie!==1 || c.ptsLoss!==0 || rowsHaveNumbers(rows, hdr))){
    state.problems.push("Google dropped the text in the Settings answer column because that column also holds numbers. Clear the 2 / 1 / 0 in the points rows and the names will come through. The page uses 2 / 1 / 0 by default anyway.");
  } else if(byCol && blankFields.length){
    // Points and tiebreak rules are meant to be left blank; only nag about the
    // two that actually change what a parent sees.
    var needed=[];
    blankFields.forEach(function(f){
      if(f.indexOf("ourteam")!==-1) needed.push("Our team");
      else if(f.indexOf("leaguename")!==-1||f.indexOf("showcaseorleague")!==-1) needed.push("League or showcase name");
    });
    if(needed.length) state.problems.push("Not filled in on the Settings tab: "+needed.join(", ")+".");
  }
  return c;
}
function rowsHaveNumbers(rows, hdr){
  for(var r=hdr.headerIndex+1;r<rows.length;r++){
    if(num(rows[r][hdr.map.value])!==null) return true;
  }
  return false;
}

export { shapeSettings };
