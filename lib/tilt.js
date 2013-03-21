const { EventTarget } = require("sdk/event/target");
const { emit } = require("sdk/event/core");
const events = require("sdk/system/events");
const { Class } = require("sdk/core/heritage");
const { ns } = require("sdk/core/namespace");
const { getTab } = require("sdk/tabs/utils");
const { getInnerId, getMostRecentBrowserWindow } = require("sdk/window/utils");
const { Cu, Ci } = require("chrome");
const { defer, resolve } = require("sdk/core/promise");
const { browserWindows } = require("sdk/windows");

Cu.import("resource:///modules/devtools/LayoutHelpers.jsm");
Cu.import("resource:///modules/devtools/Tilt.jsm");
Cu.import("resource:///modules/devtools/TiltMath.jsm");

const tiltMap = new WeakMap();

const internal = ns();

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

// XXX Fix this
function getContentWindow(tab) {
  return getMostRecentBrowserWindow().content;
}

// XXX Fix this
function getChromeWindow(tab) {
  return getMostRecentBrowserWindow();
}

function getTiltInstance(tilt) {
  let tab = internal(tilt).tab;
  let contentWin = getContentWindow(tab);
  let chromeWin = getChromeWindow(tab);
  let windowID = getInnerId(contentWin);
  let Tilt = TiltManager.getTiltForBrowser(chromeWin);
  return Tilt.visualizers[windowID]
}

function overrideNodeCallback(instance, nodeCallback) {
  instance.presenter.nodeCallback = function(aContentWindow, aNode, aParentPosition) {
    // get the x, y, width and height coordinates of the node
    let coord = LayoutHelpers.getRect(aNode, aContentWindow);
    if (!coord) {
      return null;
    }

    if (is_hidden(aNode))
      return null;

    coord.depth = aParentPosition ? (aParentPosition.depth + aParentPosition.thickness) : 0;
    coord.thickness = nodeCallback(aNode, aParentPosition, coord);
    return coord;
  };
}

const Tilt = Class({
  implements: [ EventTarget ],

  initialize: function(tab) {
    EventTarget.prototype.initialize.call(this);

    tiltMap.set(tab, this);
    internal(this).tab = tab;
    internal(this).nodeCallback = null;

    this.on("open", function(tilt) {
      let nodeCallback = internal(this).nodeCallback;
      if (!nodeCallback)
        return;

      let instance = getTiltInstance(tilt);
      overrideNodeCallback(instance, nodeCallback);
    });
  },

  get tab() {
    return internal(this).tab;
  },

  get isOpening() {
    let instance = getTiltInstance(this);
    if (!instance)
      return false;

    return !instance.presenter._visualizationProgram;
  },

  get isOpen() {
    return !!getTiltInstance(this);
  },

  get nodeCallback() {
    return internal(this).nodeCallback;
  },

  set nodeCallback(nodeCallback) {
    internal(this).nodeCallback = nodeCallback;

    let instance = getTiltInstance(this);
    if (instance) {
      if (nodeCallback)
        overrideNodeCallback(instance, nodeCallback);
      else
        instance.presenter.nodeCallback = null;

      if (!this.isOpening) {
        let coordinates = cloneCoords(instance.controller._coordinates);
        let rotation = convert(coordinates.rotation);

        let tilt = this;
        this.close().then(this.open.bind(this)).then(function() {
          let instance = getTiltInstance(tilt);
          let arcball = instance.controller.arcball;
          arcball.translate(coordinates.translation);
          arcball.rotate(rotation);
        });
      }
    }
  },

  open: function() {
    if (this.isOpen)
      return resolve();

    let deferred = defer();
    // XXX check it is the right window
    events.once("tilt-initialized", function(event) {
      deferred.resolve();
    })

    let contentWin = getContentWindow(internal(this).tab);
    let chromeWin = getChromeWindow(internal(this).tab);
    let Tilt = TiltManager.getTiltForBrowser(chromeWin);
    Tilt.toggle();

    return deferred.promise;
  },

  close: function() {
    if (!this.isOpen)
      return resolve();

    let deferred = defer();
    this.once("close", function() {
      deferred.resolve();
    })

    let contentWin = getContentWindow(internal(this).tab);
    let chromeWin = getChromeWindow(internal(this).tab);
    let windowID = getInnerId(contentWin);
    let Tilt = TiltManager.getTiltForBrowser(chromeWin);
    Tilt.destroy(windowID, true);

    return deferred.promise;
  }
});

function getTiltForTab(tab) {
  if (tiltMap.has(tab))
    return tiltMap.get(tab);
  return new Tilt(tab);
}
exports.getTiltForTab = getTiltForTab;

const TiltEvents = new EventTarget();
exports.TiltEvents = TiltEvents;

function sendEvent(event, tilt) {
  emit(tilt, event, tilt);
  emit(TiltEvents, event, tilt);
}

events.on("tilt-startup", function(event) {
  // XXX Fix this
  let tab = browserWindows.activeWindow.tabs.activeTab;
  let tilt = getTiltForTab(tab);
  sendEvent("open", tilt);
}, true);

events.on("tilt-destroyed", function(event) {
  // XXX Fix this
  let tab = browserWindows.activeWindow.tabs.activeTab;
  let tilt = getTiltForTab(tab);
  sendEvent("close", tilt);
}, true);
