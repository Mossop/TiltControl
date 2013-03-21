const { Cu } = require("chrome");
const { when } = require("sdk/system/unload");
const { merge } = require("sdk/util/object");
const { browserWindows } = require("sdk/windows");

Cu.import("resource:///modules/devtools/gcli.jsm");

exports.addCommand = function(spec) {
  let realSpec = merge({}, spec, {
    exec: function(args, context) {
      let event = {
        window: browserWindows.activeWindow,
        tab: browserWindows.activeWindow.tabs.activeTab
      }
      spec.exec(args, event);
    }
  });

  gcli.addCommand(realSpec);

  when(function() {
    gcli.removeCommand(realSpec.name);
  })
}
