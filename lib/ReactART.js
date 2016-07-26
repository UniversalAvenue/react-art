/**
 * Copyright (c) 2013-present Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactART
 */

'use strict';

// if in node js environment use svg

if (require('./isNode')()) {
  require('art/modes/current').setCurrent(require('art/modes/svg') // Flip this to DOM mode for debugging
  );
} else {
    require('art/modes/current').setCurrent(require('art/modes/fast-noSideEffects') // Flip this to DOM mode for debugging
    );
  }

var Transform = require('art/core/transform');
var Mode = require('art/modes/current');

var React = require('react');
var ReactDOM = require('react-dom');
var ReactInstanceMap = require('react/lib/ReactInstanceMap');
var ReactMultiChild = require('react/lib/ReactMultiChild');
var ReactUpdates = require('react/lib/ReactUpdates');

var emptyObject = require('fbjs/lib/emptyObject');
var invariant = require('fbjs/lib/invariant');

var assign = require('object-assign');
var pooledTransform = new Transform();

// Utilities

function childrenAsString(children) {
  if (!children) {
    return '';
  }
  if (typeof children === 'string') {
    return children;
  }
  if (children.length) {
    return children.join('\n');
  }
  return '';
}

function createComponent(name) {
  var ReactARTComponent = function ReactARTComponent(element) {
    this.node = null;
    this.subscriptions = null;
    this.listeners = null;
    this._mountImage = null;
    this._renderedChildren = null;
    this.construct(element);
  };
  ReactARTComponent.displayName = name;
  for (var i = 1, l = arguments.length; i < l; i++) {
    assign(ReactARTComponent.prototype, arguments[i]);
  }

  return ReactARTComponent;
}

/**
 * Insert `node` into `parentNode` after `referenceNode`.
 */
function injectAfter(parentNode, referenceNode, node) {
  var beforeNode = void 0;
  if (node.parentNode === parentNode && node.previousSibling === referenceNode) {
    return;
  }
  if (referenceNode == null) {
    // node is supposed to be first.
    beforeNode = parentNode.firstChild;
  } else {
    // node is supposed to be after referenceNode.
    beforeNode = referenceNode.nextSibling;
  }
  if (beforeNode && beforeNode.previousSibling !== node) {
    // Cases where `node === beforeNode` should get filtered out by earlier
    // checks and the behavior isn't well-defined.
    invariant(node !== beforeNode, 'ReactART: Can not insert node before itself');
    node.injectBefore(beforeNode);
  } else if (node.parentNode !== parentNode) {
    node.inject(parentNode);
  }
}

// ContainerMixin for components that can hold ART nodes

var ContainerMixin = assign({}, ReactMultiChild.Mixin, {

  /**
   * Moves a child component to the supplied index.
   *
   * @param {ReactComponent} child Component to move.
   * @param {number} toIndex Destination index of the element.
   * @protected
   */
  moveChild: function moveChild(child, afterNode, toIndex, lastIndex) {
    var childNode = child._mountImage;
    injectAfter(this.node, afterNode, childNode);
  },

  /**
   * Creates a child component.
   *
   * @param {ReactComponent} child Component to create.
   * @param {object} childNode ART node to insert.
   * @protected
   */
  createChild: function createChild(child, afterNode, childNode) {
    child._mountImage = childNode;
    injectAfter(this.node, afterNode, childNode);
  },

  /**
   * Removes a child component.
   *
   * @param {ReactComponent} child Child to remove.
   * @protected
   */
  removeChild: function removeChild(child) {
    child._mountImage.eject();
    child._mountImage = null;
  },

  updateChildrenAtRoot: function updateChildrenAtRoot(nextChildren, transaction) {
    this.updateChildren(nextChildren, transaction, emptyObject);
  },

  mountAndInjectChildrenAtRoot: function mountAndInjectChildrenAtRoot(children, transaction) {
    this.mountAndInjectChildren(children, transaction, emptyObject);
  },

  /**
   * Override to bypass batch updating because it is not necessary.
   *
   * @param {?object} nextChildren.
   * @param {ReactReconcileTransaction} transaction
   * @internal
   * @override {ReactMultiChild.Mixin.updateChildren}
   */
  updateChildren: function updateChildren(nextChildren, transaction, context) {
    this._updateChildren(nextChildren, transaction, context);
  },

  // Shorthands

  mountAndInjectChildren: function mountAndInjectChildren(children, transaction, context) {
    var mountedImages = this.mountChildren(children, transaction, context);
    // Each mount image corresponds to one of the flattened children
    var i = 0;
    for (var key in this._renderedChildren) {
      if (this._renderedChildren.hasOwnProperty(key)) {
        var child = this._renderedChildren[key];
        child._mountImage = mountedImages[i];
        mountedImages[i].inject(this.node);
        i++;
      }
    }
  }

});

// Surface is a React DOM Component, not an ART component. It serves as the
// entry point into the ART reconciler.

var Surface = React.createClass({

  displayName: 'Surface',

  mixins: [ContainerMixin],

  componentDidMount: function componentDidMount() {
    var domNode = ReactDOM.findDOMNode(this);

    this.node = Mode.Surface(+this.props.width, +this.props.height, domNode);

    var transaction = ReactUpdates.ReactReconcileTransaction.getPooled();
    transaction.perform(this.mountAndInjectChildren, this, this.props.children, transaction, ReactInstanceMap.get(this)._context);
    ReactUpdates.ReactReconcileTransaction.release(transaction);
  },

  componentDidUpdate: function componentDidUpdate(oldProps) {
    var node = this.node;
    if (this.props.width != oldProps.width || this.props.height != oldProps.height) {
      node.resize(+this.props.width, +this.props.height);
    }

    var transaction = ReactUpdates.ReactReconcileTransaction.getPooled();
    transaction.perform(this.updateChildren, this, this.props.children, transaction, ReactInstanceMap.get(this)._context);
    ReactUpdates.ReactReconcileTransaction.release(transaction);

    if (node.render) {
      node.render();
    }
  },

  componentWillUnmount: function componentWillUnmount() {
    this.unmountChildren();
  },

  render: function render() {
    // This is going to be a placeholder because we don't know what it will
    // actually resolve to because ART may render canvas, vml or svg tags here.
    // We only allow a subset of properties since others might conflict with
    // ART's properties.
    var props = this.props;

    // TODO: ART's Canvas Mode overrides surface title and cursor
    var Tag = Mode.Surface.tagName;
    return React.createElement(Tag, {
      accessKey: props.accessKey,
      className: props.className,
      draggable: props.draggable,
      role: props.role,
      style: props.style,
      tabIndex: props.tabIndex,
      title: props.title
    });
  }

});

// Various nodes that can go into a surface

var EventTypes = {
  onMouseMove: 'mousemove',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onMouseUp: 'mouseup',
  onMouseDown: 'mousedown',
  onClick: 'click'
};

var NodeMixin = {

  construct: function construct(element) {
    this._currentElement = element;
  },

  getNativeNode: function getNativeNode() {
    return this.node;
  },

  getPublicInstance: function getPublicInstance() {
    return this.node;
  },

  putEventListener: function putEventListener(type, listener) {
    var subscriptions = this.subscriptions || (this.subscriptions = {});
    var listeners = this.listeners || (this.listeners = {});
    listeners[type] = listener;
    if (listener) {
      if (!subscriptions[type]) {
        subscriptions[type] = this.node.subscribe(type, listener, this);
      }
    } else {
      if (subscriptions[type]) {
        subscriptions[type]();
        delete subscriptions[type];
      }
    }
  },

  handleEvent: function handleEvent(event) {
    var listener = this.listeners[event.type];
    if (!listener) {
      return;
    }
    if (typeof listener === 'function') {
      listener.call(this, event);
    } else if (listener.handleEvent) {
      listener.handleEvent(event);
    }
  },

  destroyEventListeners: function destroyEventListeners() {
    var subscriptions = this.subscriptions;
    if (subscriptions) {
      for (var type in subscriptions) {
        subscriptions[type]();
      }
    }
    this.subscriptions = null;
    this.listeners = null;
  },

  applyNodeProps: function applyNodeProps(oldProps, props) {
    var node = this.node;

    var scaleX = props.scaleX != null ? props.scaleX : props.scale != null ? props.scale : 1;
    var scaleY = props.scaleY != null ? props.scaleY : props.scale != null ? props.scale : 1;

    pooledTransform.transformTo(1, 0, 0, 1, 0, 0).move(props.x || 0, props.y || 0).rotate(props.rotation || 0, props.originX, props.originY).scale(scaleX, scaleY, props.originX, props.originY);

    if (props.transform != null) {
      pooledTransform.transform(props.transform);
    }

    if (node.xx !== pooledTransform.xx || node.yx !== pooledTransform.yx || node.xy !== pooledTransform.xy || node.yy !== pooledTransform.yy || node.x !== pooledTransform.x || node.y !== pooledTransform.y) {
      node.transformTo(pooledTransform);
    }

    if (props.cursor !== oldProps.cursor || props.title !== oldProps.title) {
      node.indicate(props.cursor, props.title);
    }

    if (node.blend && props.opacity !== oldProps.opacity) {
      node.blend(props.opacity == null ? 1 : props.opacity);
    }

    if (props.visible !== oldProps.visible) {
      if (props.visible == null || props.visible) {
        node.show();
      } else {
        node.hide();
      }
    }

    for (var type in EventTypes) {
      this.putEventListener(EventTypes[type], props[type]);
    }
  },

  mountComponentIntoNode: function mountComponentIntoNode(rootID, container) {
    throw new Error('You cannot render an ART component standalone. ' + 'You need to wrap it in a Surface.');
  }

};

// Group

var Group = createComponent('Group', NodeMixin, ContainerMixin, {

  mountComponent: function mountComponent(transaction, nativeParent, nativeContainerInfo, context) {
    this.node = Mode.Group();
    var props = this._currentElement.props;
    this.applyGroupProps(emptyObject, props);
    this.mountAndInjectChildren(props.children, transaction, context);
    return this.node;
  },

  receiveComponent: function receiveComponent(nextComponent, transaction, context) {
    var props = nextComponent.props;
    var oldProps = this._currentElement.props;
    this.applyGroupProps(oldProps, props);
    this.updateChildren(props.children, transaction, context);
    this._currentElement = nextComponent;
  },

  applyGroupProps: function applyGroupProps(oldProps, props) {
    this.node.width = props.width;
    this.node.height = props.height;
    this.applyNodeProps(oldProps, props);
  },

  unmountComponent: function unmountComponent() {
    this.destroyEventListeners();
    this.unmountChildren();
  }

});

// ClippingRectangle
var ClippingRectangle = createComponent('ClippingRectangle', NodeMixin, ContainerMixin, {

  mountComponent: function mountComponent(transaction, nativeParent, nativeContainerInfo, context) {
    this.node = Mode.ClippingRectangle();
    var props = this._currentElement.props;
    this.applyClippingProps(emptyObject, props);
    this.mountAndInjectChildren(props.children, transaction, context);
    return this.node;
  },

  receiveComponent: function receiveComponent(nextComponent, transaction, context) {
    var props = nextComponent.props;
    var oldProps = this._currentElement.props;
    this.applyClippingProps(oldProps, props);
    this.updateChildren(props.children, transaction, context);
    this._currentElement = nextComponent;
  },

  applyClippingProps: function applyClippingProps(oldProps, props) {
    this.node.width = props.width;
    this.node.height = props.height;
    this.node.x = props.x;
    this.node.y = props.y;
    this.applyNodeProps(oldProps, props);
  },

  unmountComponent: function unmountComponent() {
    this.destroyEventListeners();
    this.unmountChildren();
  }

});

// Renderables

var RenderableMixin = assign({}, NodeMixin, {

  applyRenderableProps: function applyRenderableProps(oldProps, props) {
    if (oldProps.fill !== props.fill) {
      if (props.fill && props.fill.applyFill) {
        props.fill.applyFill(this.node);
      } else {
        this.node.fill(props.fill);
      }
    }
    if (oldProps.stroke !== props.stroke || oldProps.strokeWidth !== props.strokeWidth || oldProps.strokeCap !== props.strokeCap || oldProps.strokeJoin !== props.strokeJoin ||
    // TODO: Consider a deep check of stokeDash.
    // This may benefit the VML version in IE.
    oldProps.strokeDash !== props.strokeDash) {
      this.node.stroke(props.stroke, props.strokeWidth, props.strokeCap, props.strokeJoin, props.strokeDash);
    }
    this.applyNodeProps(oldProps, props);
  },

  unmountComponent: function unmountComponent() {
    this.destroyEventListeners();
  }

});

// Shape

var Shape = createComponent('Shape', RenderableMixin, {

  construct: function construct(element) {
    this._currentElement = element;
    this._oldDelta = null;
    this._oldPath = null;
  },

  mountComponent: function mountComponent(transaction, nativeParent, nativeContainerInfo, context) {
    this.node = Mode.Shape();
    var props = this._currentElement.props;
    this.applyShapeProps(emptyObject, props);
    return this.node;
  },

  receiveComponent: function receiveComponent(nextComponent, transaction, context) {
    var props = nextComponent.props;
    var oldProps = this._currentElement.props;
    this.applyShapeProps(oldProps, props);
    this._currentElement = nextComponent;
  },

  applyShapeProps: function applyShapeProps(oldProps, props) {
    var oldDelta = this._oldDelta;
    var oldPath = this._oldPath;
    var path = props.d || childrenAsString(props.children);

    if (path.delta !== oldDelta || path !== oldPath || oldProps.width !== props.width || oldProps.height !== props.height) {

      this.node.draw(path, props.width, props.height);

      this._oldPath = path;
      this._oldDelta = path.delta;
    }

    this.applyRenderableProps(oldProps, props);
  }

});

// Text

var Text = createComponent('Text', RenderableMixin, {

  construct: function construct(element) {
    this._currentElement = element;
    this._oldString = null;
  },

  mountComponent: function mountComponent(transaction, nativeParent, nativeContainerInfo, context) {
    var props = this._currentElement.props;
    var newString = childrenAsString(props.children);
    this.node = Mode.Text(newString, props.font, props.alignment, props.path);
    this._oldString = newString;
    this.applyRenderableProps(emptyObject, props);
    return this.node;
  },

  isSameFont: function isSameFont(oldFont, newFont) {
    if (oldFont === newFont) {
      return true;
    }
    if (typeof newFont === 'string' || typeof oldFont === 'string') {
      return false;
    }
    return newFont.fontSize === oldFont.fontSize && newFont.fontStyle === oldFont.fontStyle && newFont.fontVariant === oldFont.fontVariant && newFont.fontWeight === oldFont.fontWeight && newFont.fontFamily === oldFont.fontFamily;
  },

  receiveComponent: function receiveComponent(nextComponent, transaction, context) {
    var props = nextComponent.props;
    var oldProps = this._currentElement.props;

    var oldString = this._oldString;
    var newString = childrenAsString(props.children);

    if (oldString !== newString || !this.isSameFont(oldProps.font, props.font) || oldProps.alignment !== props.alignment || oldProps.path !== props.path) {
      this.node.draw(newString, props.font, props.alignment, props.path);
      this._oldString = newString;
    }

    this.applyRenderableProps(oldProps, props);
    this._currentElement = nextComponent;
  }

});

// Declarative fill type objects - API design not finalized

var slice = Array.prototype.slice;

function LinearGradient(stops, x1, y1, x2, y2) {
  this.args = slice.call(arguments);
}

LinearGradient.prototype.applyFill = function (node) {
  node.fillLinear.apply(node, this.args);
};

function RadialGradient(stops, fx, fy, rx, ry, cx, cy) {
  this.args = slice.call(arguments);
}

RadialGradient.prototype.applyFill = function (node) {
  node.fillRadial.apply(node, this.args);
};

function Pattern(url, width, height, left, top) {
  this.args = slice.call(arguments);
}

Pattern.prototype.applyFill = function (node) {
  node.fillImage.apply(node, this.args);
};

module.exports = {
  ClippingRectangle: ClippingRectangle,
  Group: Group,
  LinearGradient: LinearGradient,
  Path: Mode.Path,
  Pattern: Pattern,
  RadialGradient: RadialGradient,
  Shape: Shape,
  Surface: Surface,
  Text: Text,
  Transform: Transform
};