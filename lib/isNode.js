'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

module.exports = function () {
  var _process;

  try {
    _process = eval('process'); // avoid browserify shim
  } catch (e) {}

  var isNode = (typeof _process === 'undefined' ? 'undefined' : _typeof(_process)) === 'object' && _process.toString() === '[object process]';

  return isNode;
};