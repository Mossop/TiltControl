const { Cu } = require("chrome");
const { when } = require("sdk/system/unload");

Cu.import("resource:///modules/devtools/gcli.jsm");

exports.addCommand = function(spec) {
  gcli.addCommand(spec);

  when(function() {
    gcli.removeCommand(spec.name);
  })
}
