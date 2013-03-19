const { Tilt } = require("tilt");
const { Cc, Ci, Cu } = require("chrome");
const gcli = require("gcli");
const events = require("sdk/system/events");

Cu.import("resource:///modules/devtools/Tilt.jsm");
Cu.import("resource:///modules/devtools/TiltMath.jsm");

const CALLBACKS = {
  "default": null,

  "nohidden": function(node) {
    return 15;
  },

  "flat": function(node) {
    return 0;
  },

  "inputs": function(node) {
    if (node.localName == "input" || node.localName == "button")
      return 15;

    return 0;
  },

  "images": function(node) {
    if (node.localName == "img")
      return 15;

    return 0;
  },

  "links": function(node) {
    if (node.localName == "a")
      return 15;

    return 0;
  },

  "offsite": function(node) {
    if (node.localName == "a") {
      if (node.href.indexOf(node.ownerDocument.location.hostname) < 0)
        return 15;
    }

    return 0;
  },

  "events": function(node) {
    let service = Cc["@mozilla.org/eventlistenerservice;1"].getService(Ci.nsIEventListenerService);
    let events = service.getListenerInfoFor(node);

    if (events)
      return events.length * 15;

    return 0;
  },

  "hover": function(node) {
    if (!hoverSelectors) {
      function parseSelector(selector) {
        if (selector.indexOf(":hover") >= 0)
          hoverSelectors.push(selector.replace(":hover", ""))
      }

      function parseRules(rules) {
        for (let j = 0; j < rules.length; j++) {
          let rule = rules[j];
          switch (rule.type) {
            case rule.STYLE_RULE:
              parseSelector(rule.selectorText);
              break;
            case rule.MEDIA_RULE:
              parseRules(rule.cssRules);
              break;
            case rule.IMPORT_RULE:
              parseRules(rule.styleSheet.cssRules);
              break;
          }
        }
      }

      hoverSelectors = [];
      let sheets = node.ownerDocument.styleSheets;
      for (let i = 0; i < sheets.length; i++)
        parseRules(sheets[i].cssRules);
    }

    for (let selector of hoverSelectors) {
      if (node.mozMatchesSelector(selector))
        return 15;
    }

    return 0;
  }
};

var hoverSelectors = null;

function cloneCoords(coords) {
  return {
    translation: Array.slice(coords.translation, 0),
    rotation: Array.slice(coords.rotation, 0)
  }
}

function convert(q) {
  function sqr(v) v * v;
  function atan2(y, x) Math.atan2(y, x);
  function asin(v) Math.asin(v);

  return [
    180 - TiltMath.degrees(atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (sqr(q[2]) + sqr(q[3])))),
    -TiltMath.degrees(asin(2 * (q[0] * q[2] - q[3] * q[1]))),
    TiltMath.degrees(atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (sqr(q[1]) + sqr(q[2])))),
  ];
}

let keys = Object.keys(CALLBACKS);
gcli.addCommand({
  name: 'tilt depth',
  description: "Change tilt depth style",
  params: [{ name: "type", type: { name: "selection", data: keys } } ],
  exec: function(args, context) {
    Tilt.registerNodeCallback(CALLBACKS[args.type]);

    let chromeWindow = context.environment.chromeDocument.defaultView;
    let view = TiltManager.getTiltForBrowser(chromeWindow);
    if (view.currentInstance) {
      let oldVisualization = view.currentInstance;
      let coordinates = cloneCoords(oldVisualization.controller._coordinates);
      let rotation = convert(coordinates.rotation);

      events.once("tilt-destroyed", function() {
        events.once("tilt-initialized", function() {
          let visualization = view.currentInstance;
          let arcball = visualization.controller.arcball;
          arcball.translate(coordinates.translation);
          arcball.rotate(rotation);
        });
        view.toggle();
      }, true);
    }
    view.toggle();
  }
});

gcli.addCommand({
  name: 'tilt scratchpad',
  description: "Modify Tilt with scratchpad",
  exec: function(args, context) {
    Tilt.registerNodeCallback(CALLBACKS[args.type]);

    let chromeWindow = context.environment.chromeDocument.defaultView;
    let win = chromeWindow.Scratchpad.ScratchpadManager.openScratchpad({
      executionContext: 2,
      text: "// This function is called for every node in the page\n" +
            "// Return whatever depth that node should be in 3D view\n" +
            "function getNodeDepth(node) {\n" +
            "  return 15;\n" +
            "}\n"
    });

    win.addEventListener("load", function() {
      let evalFunc = win.Scratchpad.evalInChromeSandbox;
      win.Scratchpad.evalInChromeSandbox = function(aString) {
        evalFunc.call(win.Scratchpad, aString);
        let callback = win.Scratchpad.chromeSandbox.getNodeDepth;

        Tilt.registerNodeCallback(callback);

        let view = TiltManager.getTiltForBrowser(chromeWindow);
        if (view.currentInstance) {
          let oldVisualization = view.currentInstance;
          let coordinates = cloneCoords(oldVisualization.controller._coordinates);
          let rotation = convert(coordinates.rotation);

          events.once("tilt-destroyed", function() {
            events.once("tilt-initialized", function() {
              let visualization = view.currentInstance;
              let arcball = visualization.controller.arcball;
              arcball.translate(coordinates.translation);
              arcball.rotate(rotation);
            });
            view.toggle();
          }, true);
        }
        view.toggle();
      }
    }, false);
  }
});

gcli.addCommand({
  name: 'tilt test',
  description: "Output some tilt info",
  exec: function(args, context) {
    let chromeWindow = context.environment.chromeDocument.defaultView;
    let view = TiltManager.getTiltForBrowser(chromeWindow);
    if (view.currentInstance) {
      let oldVisualization = view.currentInstance;
      let coordinates = cloneCoords(oldVisualization.controller._coordinates);
      console.log(convert(coordinates.rotation));
    }
  }
});
