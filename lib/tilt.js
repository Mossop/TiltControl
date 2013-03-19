const { EventTarget } = require("sdk/event/target");
const { emit } = require('sdk/event/core');
const events = require("sdk/system/events");
const { extend } = require('sdk/core/heritage');
const { Cu } = require("chrome");
const { when } = require("sdk/system/unload");

Cu.import("resource:///modules/devtools/LayoutHelpers.jsm");

let nodeCallback = null;

let scope = Cu.import("resource:///modules/devtools/TiltUtils.jsm", {});
let oldFunc = scope.TiltUtils.DOM.getNodePosition;

function is_hidden(aElement) {
  var style = aElement.ownerDocument.defaultView.getComputedStyle(aElement, "");
  if (!style)
    return false;
  if (style.display == "none")
    return true;
  if (style.visibility != "visible")
    return true;

  // Hiding a parent element will hide all its children
  if (aElement.parentNode != aElement.ownerDocument)
    return is_hidden(aElement.parentNode);

  return false;
}

scope.TiltUtils.DOM.getNodePosition = function(aContentWindow, aNode, aParentPosition) {
  if (!nodeCallback)
    return oldFunc.call(scope.TiltUtils.DOM, aContentWindow, aNode, aParentPosition);

  // get the x, y, width and height coordinates of the node
  let coord = LayoutHelpers.getRect(aNode, aContentWindow);
  if (!coord) {
    return null;
  }

  if (is_hidden(aNode))
    return null;

  coord.base = aParentPosition ? (aParentPosition.base + aParentPosition.depth) : 0;
  coord.depth = nodeCallback(aNode, aParentPosition, coord);
  return coord;
}

when(function() {
  scope.TiltUtils.DOM.getNodePosition = oldFunc;
});

let Tilt = extend(EventTarget(), {
  registerNodeCallback: function(callback) {
    nodeCallback = callback;
  }
});
exports.Tilt = Tilt;
