/* global cep */
(function(){
  var cs;
  var ids = ["incV","incA","selOnly","skipAdj","skipNest","skipDisabled","exTransitions","respectIO","namePat","prefixTrack","color","comment","allowDup"];
  var statusEl;
  var SETTINGS_PATH = ""; // computed in host

  function load(){
    cs = new CSInterface();
    statusEl = document.getElementById("status");
    restore();
    document.getElementById("btnAll").onclick = function(){ run("markAll"); };
    document.getElementById("btnSel").onclick = function(){ run("markSelected"); };
    ids.forEach(function(id){
      var el = document.getElementById(id);
      el.addEventListener("change", save);
      if(el.tagName === 'INPUT' && el.type === 'text') el.addEventListener('input', save);
    });
  }

  function currentSettings(){
    var s = {};
    ids.forEach(function(id){
      var el = document.getElementById(id);
      s[id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    return s;
  }

  function save(){
    var json = JSON.stringify(currentSettings());
    cs.evalScript('OM_writeSettings(' + JSON.stringify(json) + ')');
  }

  function restore(){
    cs.evalScript('OM_readSettings()', function(res){
      try{ var s = JSON.parse(res || '{}'); }catch(e){ s = {}; }
      ids.forEach(function(id){
        var el = document.getElementById(id);
        if(id in s){
          if(el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
        }
      });
    });
  }

  function run(cmd){
    var t0 = Date.now();
    var json = JSON.stringify(currentSettings());
    cs.evalScript('OM_run("' + cmd + '",' + JSON.stringify(json) + ')', function(msg){
      var dt = ((Date.now()-t0)/1000).toFixed(2);
      statusEl.textContent = (msg || 'Done') + ' in ' + dt + 's';
    });
  }

  document.addEventListener('DOMContentLoaded', load);
})();
