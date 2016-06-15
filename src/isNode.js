module.exports = function(){
  var _process;

  try {
      _process = eval('process');  // avoid browserify shim
  } catch (e) {}

  var isNode = typeof _process === 'object' && _process.toString() === '[object process]';

  return isNode;
}
