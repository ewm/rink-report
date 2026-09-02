/* Component: the Events page and the crumb back to it.

eventsHtml() -> HTML: Coming up (the featured event tagged NOW/NEXT) and
Past events newest first, each row a button that opens the event.
crumbHtml(view) -> HTML: the "All events" way back, with the date range. */
import { dataViews, featuredEvent, isLive, ourRecordIn } from "../model/views.js";
import { dateRange, todayISO } from "../util/dates.js";
import { esc } from "../util/text.js";

/* The Events page: what's coming, then what's done, newest first. Each row
   opens that event in full. */
function eventsHtml(views){
  var all=dataViews().filter(function(v){ return v.event; }), today=todayISO();
  var feat=featuredEvent(all);
  var ahead=[], past=[];
  all.forEach(function(v){ (v.last>=today ? ahead : past).push(v); });
  ahead.sort(function(a,b){ return a.first<b.first?-1:1; });
  past.sort(function(a,b){ return a.first>b.first?-1:1; });
  function rows(list){
    var h="";
    list.forEach(function(v){
      var rec=ourRecordIn(v), n=v.games.length, right;
      if(rec) right='<span class="evrec">'+rec.w+"-"+rec.l+"-"+rec.t+"</span>";
      else right='<span class="evrec muted">'+n+" game"+(n===1?"":"s")+"</span>";
      h+='<button type="button" class="evrow" data-act="view" data-v="'+esc(v.key)+'">'+
         '<span class="evname">'+esc(v.label)+(v===feat?' <span class="tag w">'+(isLive(v)?"NOW":"NEXT")+"</span>":"")+"</span>"+
         '<span class="evdates">'+esc(dateRange(v.first,v.last))+"</span>"+right+"</button>";
    });
    return h;
  }
  var h="";
  h+='<section class="card"><div class="card-h"><h2>Coming up</h2><span class="eyebrow">'+(ahead.length?"Tap one to open it":"")+'</span></div><div class="card-b">';
  h+= ahead.length ? rows(ahead) : '<p class="empty">Nothing on the calendar yet.</p>';
  h+="</div></section>";
  h+='<section class="card"><div class="card-h"><h2>Past events</h2><span class="eyebrow">Newest first</span></div><div class="card-b">';
  h+= past.length ? rows(past) : '<p class="empty">None yet.</p>';
  h+="</div></section>";
  return h;
}


/* The way back from an event opened off the Events list. */
function crumbHtml(v){
  return '<div class="crumb"><button type="button" data-act="view" data-v="events">&larr; All events</button>'+
         '<span class="evdates">'+esc(dateRange(v.first, v.last))+"</span></div>";
}

export { eventsHtml, crumbHtml };
