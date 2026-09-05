/* The store.

   One plain object holds everything the page knows: the shaped data, the
   warnings, fetch status, which view is open. Modules read and write it
   directly (state.data.games, state.problems.push(...)) — this is a
   single-page reader, not a framework, and a shared object is the honest
   size of the problem.

   What lives here and why:
     data         config, teams, pools, games, stats, rinks — the shaped sheet
     problems     plain-English warnings for the manager, reset per load
     fetchedAt / loading / loadError   fetch status, for the status line
     viewKey      the tab the reader chose (null = let the calendar decide)
     filterOurs   the All / Ours switch on results
     diagLog / routeUsed / headerMap / routeTrouble / gidHint   for ?check
     statsNote    why the Stats tab is missing, for ?check
     rinksNote    why the Rinks tab could not be read, for ?check
     logoOk       whether logo.png exists (probed once)
     lastHtml     the last markup written, so a no-op poll is a no-op paint
     pollTimer / pollQuiet / pollSig   the poll's own bookkeeping

   Re-rendering: nothing here renders. Anything that changes state and wants
   the page to follow calls notify(); app.js registers render() as the
   listener. That keeps every module one-way: state <- shape <- sheet, and
   ui -> state, with render() the only thing that reads all of it. */
var state = {
  data: { config:{leagueName:"",teamName:"",mode:"season",ptsWin:2,ptsTie:1,ptsLoss:0}, teams:[], games:[], stats:null, rinks:null },
  problems: [],
  fetchedAt: null,
  loading: true,
  loadError: "",
  viewKey: null,
  filterOurs: false,
  diagLog: [],
  routeUsed: [],
  headerMap: [],
  routeTrouble: [],
  gidHint: "",
  gidLookupStarted: false,
  statsNote: "",
  rinksNote: "",
  logoOk: false,
  lastHtml: null,
  pollTimer: null,
  pollQuiet: 0,
  pollSig: ""
};
function log(m){ state.diagLog.push(m); }

var listeners=[];
function onChange(fn){ listeners.push(fn); }
function notify(){ for(var i=0;i<listeners.length;i++) listeners[i](); }

export { state, log, onChange, notify };
