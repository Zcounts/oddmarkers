/* Headless runner: Mark All (assign a keyboard shortcut in Premiere) */
#include "host.jsx"
(function(){
  var s = JSON.parse(OM_readSettings());
  var msg = runCore(false, s);
  app.setSDKEventMessage("Odd Markers: " + msg, "info"); // non-blocking toast
})();
