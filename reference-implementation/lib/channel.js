"use strict";

var Promise = require('es6-promise').Promise

// Private symbols are no yet present in the language but
// we emulate them via this strings.
var $size = "@@channel/size"
var $isClosed = "@@channel/closed?"
var $buffer = "@@channel/buffer"
var $putQueue = "@@channel/put-queue"
var $takeQueue = "@@channel/take-queue"

function Channel(size) {
  this[$size] = size
  this[$isClosed] = false
  this[$buffer] = []
  this[$putQueue] = []
  this[$takeQueue] = []
}
Channel.prototype.close = function() {
  this[$isClosed] = true
  // Void all queued takes.
  while (this[$takeQueue].length > 0)
    this[$takeQueue].shift()(void(0))
}
Channel.prototype.put = function(value) {
  return Promise(function(resolve) {
    // If channel is already closed then
    // void resulting promise.
    if (this[$isClosed]) {
      resolve(void(0))
    }
    // If void is put just ignore it.
    else if (value === void(0)) {
      resolve(true)
    }
    // If channel has a pending "take" resolve it
    // and resolve result.
    else if (this[$takeQueue].length > 0) {
      this[$takeQueue].shift()(value)
      resolve(true)
    }
    // If channel's buffer can accumulate more data
    // push a value and resolve result to `true`.
    else if (this[$buffer].length < this[$size]) {
      this[$buffer].push(value)
      resolve(true)
    }
    // Otherwise just queue `put`.
    else {
      this[$putQueue].push(value, resolve)
    }
  }.bind(this))
}
Channel.prototype.take = function() {
  return Promise(function(resolve) {
    // If there is buffered values take first one that
    // was put.
    if (this[$buffer].length > 0) {
      resolve(this[$buffer].shift())
      // If there's a queued up puts move first one to
      // buffer and resolve it's promise.
      if (this[$putQueue].length > 0) {
        this[$buffer].push(this[$putQueue].shift())
        this[$putQueue].shift()(true)
      }
    }
    // If values are buffered and channel is closed
    // void returning promise.
    else if (this[$isClosed]) {
      resolve(void(0))
    }
    // Otherwise queue up a take.
    else {
      this[$takeQueue].push(resolve)
    }
  }.bind(this))
}
exports.Channel = Channel
