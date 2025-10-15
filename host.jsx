/* Odd Markers core — ExtendScript (CEP host) */
// Minimal settings persistence to user Documents
var OM = {};
OM.SETTINGS_FILE = Folder.myDocuments.fsName + "/OddMarkers.settings.json";

function OM_defaultSettings(){
  return {
    incV:true, incA:false, selOnly:false,
    skipAdj:true, skipNest:false, skipDisabled:true,
    exTransitions:false, respectIO:false,
    namePat:"{name}", prefixTrack:false,
    color:"default", comment:"Auto by Odd Markers", allowDup:false
  };
}

function OM_readSettings(){
  var f = new File(OM.SETTINGS_FILE); if(!f.exists) return JSON.stringify(OM_defaultSettings());
  f.open('r'); var txt = f.read(); f.close(); return txt;
}
function OM_writeSettings(json){
  var f = new File(OM.SETTINGS_FILE); f.open('w'); f.write(json); f.close(); return true;
}

function getActiveSequence(){
  if(!app.project || !app.project.activeSequence) return null;
  return app.project.activeSequence;
}

// Helper: iterate markers on sequence
function seqHasDuplicateMarker(seq, startTicks, endTicks, name){
  var m = seq.markers.getFirstMarker();
  while(m){
    if(m.start.ticks == startTicks && m.end.ticks == endTicks && m.name == name){ return true; }
    m = seq.markers.getNextMarker(m);
  }
  return false;
}

// Map friendly color to Premiere marker color index (0..8)
function colorIndex(name){
  var map = { default:-1, red:0, yellow:1, green:2, cyan:3, blue:4, magenta:5, white:6, black:7 };
  return (name in map) ? map[name] : -1;
}

// NOTE: Sequence vs Clip markers difference occurs here: we call seq.markers.createMarker()
function createSeqMarker(seq, startTicks, endTicks, name, colorIdx, comment){
  var mk = seq.markers.createMarker(startTicks); // *** SEQUENCE marker ***
  mk.end = new Time(); mk.end.ticks = endTicks;
  mk.name = name;
  if(colorIdx >= 0 && mk.hasOwnProperty('setColorByIndex')){ try{ mk.setColorByIndex(colorIdx); }catch(e){} }
  mk.comments = comment + " " + new Date().toISOString();
}

function ticksFromSeconds(seq, sec){
  var t = seq.timebase ? (1.0/seq.timebase) : 1; // fallback
  // Premiere Time is already in ticks via Time object; use clip.start.ticks directly when possible
  return sec; // not used; we rely on .start/.end ticks from items
}

function eachClip(seq, settings, cb){
  function visitTrackCollection(tracks, isVideo){
    var colorCycleIdx = 0;
    for(var ti=0; ti<tracks.numTracks; ti++){
      var tr = tracks[ti];
      if(tr.isLocked()) continue;
      if(settings.selOnly && !tr.isTargeted()) continue;
      if(settings.skipDisabled && isVideo && !tr.isEnabled()) continue;
      if(settings.skipDisabled && !isVideo && tr.isMuted()) continue;
      for(var ci=0; ci<tr.clips.numItems; ci++){
        var c = tr.clips[ci];
        if(settings.skipAdj && c.isAdjustmentLayer) continue;
        if(settings.skipNest && c.isNested) continue;
        var start = c.start.ticks, end = c.end.ticks;
        // Transitions (best-effort; properties may be undefined in some versions)
        if(settings.exTransitions){
          try{ if(c.inTransition && c.inTransition.duration) start += c.inTransition.duration.ticks; }catch(e){}
          try{ if(c.outTransition && c.outTransition.duration) end -= c.outTransition.duration.ticks; }catch(e){}
        }
        // Respect sequence in/out
        if(settings.respectIO && seq.getInPointAsTime() && seq.getOutPointAsTime()){
          var tin = seq.getInPointAsTime().ticks; var tout = seq.getOutPointAsTime().ticks;
          if(end <= tin || start >= tout) continue; // fully outside
          if(start < tin) start = tin; if(end > tout) end = tout;
        }
        var trackLabel = (isVideo?"V":"A") + (ti+1);
        var nm = c.name && c.name.length ? c.name : ("Clip @ " + trackLabel + ":" + (ci+1));
        if(settings.namePat && settings.namePat !== "{name}"){
          nm = settings.namePat.replace("{name}", nm).replace("{track}", trackLabel).replace("{index}", String(ci+1));
        }
        if(settings.prefixTrack) nm = trackLabel + " – " + nm;
        var colIdx = colorIndex(settings.color);
        if(settings.color === 'cycle'){ colIdx = (ti + colorCycleIdx) % 6; }
        cb({start:start, end:end, name:nm, colorIdx:colIdx});
      }
    }
  }
  if(settings.incV) visitTrackCollection(seq.videoTracks, true);
  if(settings.incA) visitTrackCollection(seq.audioTracks, false);
}

function runCore(markSelected, settings){
  var seq = getActiveSequence();
  if(!seq){ return "No active sequence"; }

  app.enableQE(); // for selection access fallback
  var created = 0, skipped = 0;
  var t0 = new Date().getTime();

  app.beginUndoGroup("Odd Markers");

  if (markSelected) {
    app.enableQE();
    var qeSeq = qe && qe.project ? qe.project.getActiveSequence() : null;
    if (!qeSeq) { app.endUndoGroup(); return "No active sequence"; }

    // Collect selected timeline items (video + audio)
    var selectedItems = [];

    function collect(track, isVideo) {
      var n = track.getItemsInTrack();
      for (var i = 0; i < n; i++) {
        var it = track.getItemAt(i);
        if (it && it.isSelected()) {
          // Map QE item -> public DOM item by time/track indices
          try {
            var start = it.start.ticks;
            var end   = it.end.ticks;
            var tIdx  = it.trackIndex; // 0-based
            var trackColl = isVideo ? getActiveSequence().videoTracks : getActiveSequence().audioTracks;
            var tr = trackColl[tIdx];
            // Find a clip with matching start/end ticks
            for (var c = 0; c < tr.clips.numItems; c++) {
              var clip = tr.clips[c];
              if (clip.start.ticks === start && clip.end.ticks === end) {
                selectedItems.push({ dom: clip, isVideo: isVideo, trackIndex: tIdx });
                break;
              }
            }
          } catch (e) {}
        }
      }
    }

    // Walk QE tracks
    var vCount = qeSeq.numVideoTracks;
    for (var v = 0; v < vCount; v++) collect(qeSeq.getVideoTrackAt(v), true);

    var aCount = qeSeq.numAudioTracks;
    for (var a = 0; a < aCount; a++) collect(qeSeq.getAudioTrackAt(a), false);

    if (!selectedItems.length) { app.endUndoGroup(); return "No timeline clip selection"; }

    // Create markers for selected items
    for (var i = 0; i < selectedItems.length; i++) {
      var node = selectedItems[i];
      try {
        var it = node.dom;
        var start = it.start.ticks, end = it.end.ticks;

        if (settings.exTransitions) {
          try { if (it.inTransition && it.inTransition.duration)  start += it.inTransition.duration.ticks; } catch (e) {}
          try { if (it.outTransition && it.outTransition.duration) end   -= it.outTransition.duration.ticks; } catch (e) {}
        }
        if (settings.respectIO && getActiveSequence().getInPointAsTime() && getActiveSequence().getOutPointAsTime()) {
          var tin  = getActiveSequence().getInPointAsTime().ticks;
          var tout = getActiveSequence().getOutPointAsTime().ticks;
          if (end <= tin || start >= tout) continue;
          if (start < tin) start = tin; if (end > tout) end = tout;
        }

        var trackLabel = (node.isVideo ? 'V' : 'A') + (node.trackIndex + 1);
        var nm = it.name && it.name.length ? it.name : ("Clip @" + trackLabel);

        if (settings.namePat && settings.namePat !== "{name}") {
          nm = settings.namePat
            .replace("{name}", nm)
            .replace("{track}", trackLabel)
            .replace("{index}", String(i + 1));
        }
        if (settings.prefixTrack) nm = trackLabel + " – " + nm;

        var colIdx = colorIndex(settings.color);
        if (!settings.allowDup && seqHasDuplicateMarker(getActiveSequence(), start, end, nm)) { skipped++; continue; }

        createSeqMarker(getActiveSequence(), start, end, nm, colIdx, settings.comment);
        created++;
      } catch (e) {}
    }
  } else {
    // All clips across tracks (as before)
    eachClip(seq, settings, function (m) {
      if (m.end <= m.start) return;
      if (!settings.allowDup && seqHasDuplicateMarker(seq, m.start, m.end, m.name)) { skipped++; return; }
      createSeqMarker(seq, m.start, m.end, m.name, m.colorIdx, settings.comment);
      created++;
    });
  }

  app.endUndoGroup();
  var dt = ((new Date().getTime()-t0)/1000).toFixed(2);
  return "Created " + created + (skipped? (" ("+skipped+" skipped)") : "") + " markers";
}

function OM_run(cmd, jsonSettings){
  var s; try{ s = JSON.parse(jsonSettings); }catch(e){ s = OM_defaultSettings(); }
  return runCore(cmd === 'markSelected', s);
}

// Expose for panel
$.global.OM_run = OM_run;
$.global.OM_readSettings = OM_readSettings;
$.global.OM_writeSettings = OM_writeSettings;
