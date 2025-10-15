/* Headless runner: Mark Selected (assign a keyboard shortcut in Premiere) */
#include "../host.jsx"
(function(){
  var s = JSON.parse(OM_readSettings());
  var msg = runCore(true, s);
  app.setSDKEventMessage("Odd Markers: " + msg, "info");
})();
