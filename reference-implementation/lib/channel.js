"use strict";

var Promise = require('es6-promise').Promise
var FixedBuffer = require("./buffer").FixedBuffer

// Private symbols are no yet present in the language but
// we emulate them via this strings.
var $closed = "@@channel/closed"
var $buffer = "@@channel/buffer"
var $puts = "@@channel/pending-puts"
var $takes = "@@channel/pending-takes"
var $in = "@@channel/in"
var $out = "@@channel/out"
var $timeout = "@@channel/timeout"
var $value = "@@atom/value"

var MAX_QUEUE_SIZE = Infinity // 1024

// This is a simple class for representing shared
// mutable state, mainly useful for primitive values.
function Atom(value) {
  this[$value] = value
}
Atom.prototype.Atom = Atom
Atom.prototype.reset = function(value) {
  this[$value] = value
}
Atom.prototype.valueOf = function() {
  return this[$value]
}

// This is repreestantion of the pending (or complete)
// taks. Channels use instances of a subclasses like `Put`
// or `Take` to reperesent queued tasks on the channel.
// Task can be given an `timeout` that is instance of `Atom`,
// if `timeout.valueOf()` is `false` when it comes to completion
// this task will be complete, otherwise it's going to
// be dropped. If `timeout` isn't provided then task is never
// dropped. Once this task is complete it's gonig to reset
// it's timeout to `true`, which mainly used to share `timeout`
// when racing multiple tasks where only one should be complete.
function Task(timeout) {
  var self = this
  this.timeout = timeout || false
  this.promise = new Promise(function(resolve, reject) {
    self.resolve = resolve
    self.reject = reject
  })
}
// just an alias so that subtypes could use `this.Task`
// instead of applying to the constructor.
Task.prototype.Task = Task
// Task instances have a `promise` field that is fulfilled
// with a task completion value.
Task.prototype.promise = null
// If task is pending method returns `true` which is until
// it is complete or until shared timetout is reset to `true`.
Task.prototype.isPending = function() {
  return !this.timeout.valueOf()
}
// Completes pending task, by reseting shared `timout` to `true`
// and by fullfilling promise representing completion of this
// task.
Task.prototype.complete = function(value) {
  if (this.timeout)
    this.timeout.reset(true)
  else
    this.timeout = true

  this.resolve(value)
}

// Take is just a specialized `Task` used to represent
// pending takes from the channel.
function Take(timeout) {
  this.Task(timeout)
}
Take.prototype = Object.create(Task.prototype)
Take.prototype.constructor = Take
Take.prototype.Take = Take


// Put is just a specialized `Task` used to represent
// pending puts onto the channel. Additionally it has
// `value` field representing `value` it tries to put.
function Put(value, timeout) {
  this.value = value
  this.Task(timeout)
}
Put.prototype = Object.create(Task.prototype)
Put.prototype.constructor = Put
Put.prototype.Put = Put


function take(port, timeout) {
  if (!(port instanceof InputPort))
    throw TypeError("Can only take from input port")

  var buffer = port[$buffer]
  var puts = port[$puts]
  var takes = port[$takes]
  var closed = port[$closed]
  var take = new Take(timeout)

  if (take.isPending()) {
    // If there is buffered values take first one that
    // was put.
    if (buffer && !buffer.isEmpty()) {
      take.complete(buffer.take())
      // If there's a queued up puts move them to the
      // buffer until it's full or put queue is drained.
      var put = void(0)
      while (!buffer.isFull() && (put = puts.pop())) {
        if (put.isPending()) {
          put.complete(true)
          buffer.put(put.value)
        }
      }
    } else {
      var put = void(0)
      while (put = puts.pop()) {
        if (put.isPending()) break
      }

      if (put) {
        put.complete(true)
        take.complete(put.value)
      }
      // If values are buffered and channel is closed
      // void returning promise.
      else if (closed.valueOf()) {
        take.complete(void(0))
      }
      // Otherwise queue up a take.
      else {
        if (takes.length >= MAX_QUEUE_SIZE) {
          throw new Error("No more than " + MAX_QUEUE_SIZE +
                          " pending takes are allowed on a single channel.")
        } else {
          takes.unshift(take)
        }
      }
    }
  }
  return take.promise
}

function put(port, value, timeout) {
  if (!(port instanceof OutputPort))
    throw TypeError("Can only put onto output port")

  var buffer = port[$buffer]
  var puts = port[$puts]
  var takes = port[$takes]
  var closed = port[$closed]
  var put = new Put(value, timeout)

  if (put.isPending()) {
    // If channel is already closed then
    // void resulting promise.
    if (closed.valueOf()) {
      put.complete(void(0))
    }
    else if (value === void(0)) {
      put.complete(true)
    }
    else {
      var take = void(0)
      while (take = takes.pop()) {
        if (take.isPending()) break;
      }

      // If channel has a pending "take" resolve it
      // and resolve result.

      if (take) {
        take.complete(value)
        put.complete(true)
      }
      // If channel's buffer can accumulate more data
      // unshift a value and resolve result to `true`.
      else if (buffer === void(0) || buffer.isFull()) {
        if (puts.length >=  MAX_QUEUE_SIZE) {
          throw new Error("No more than " + MAX_QUEUE_SIZE +
                          " pending puts are allowed on a single channel." +
                          " Consider using a windowed buffer.")
        } else {
          puts.unshift(put)
        }
      } else {
        put.complete(true)
        buffer.put(value)
      }
    }
  }
  return put.promise
}


// Port is the interface that both input and output
// ends of the channel implement, they share same
// buffer put & take queues and a closed state,
// which are provided at the instantiation.
function Port(buffer, puts, takes, closed) {
  this[$buffer] = buffer
  this[$puts] = puts
  this[$takes] = takes
  this[$closed] = closed
}
Port.prototype.Port = Port
// When either (input / output) port is closed
// all of the pending takes on the channel are
// completed with `undefined`. Shared closed
// state is also reset to `true` to reflect
// it on both ends of the channel.
Port.prototype.close = function() {
  var closed = this[$closed]
  var takes = this[$takes]

  if (!closed.valueOf()) {
    closed.reset(true)
    // Void all queued takes.
    while (takes.length > 0) {
      var take = takes.pop()
      if (take.isPending())
        take.complete(void(0))
    }
  }
}
Port.prototype.clone = function() {
  return new this.constructor(this[$buffer], this[$puts],
                              this[$takes], this[$closed])
}

// InputPort is input endpoint of the channel that
// can be used to take values out of the channel.
function InputPort(buffer, puts, takes, closed) {
  this.Port(buffer, puts, takes, closed)
}
InputPort.prototype = Object.create(Port.prototype)
InputPort.prototype.constructor = InputPort
InputPort.prototype.InputPort = InputPort
InputPort.prototype.take = function() {
  return take(this, void(0))
}


// `OutputPort` is an output endpoint of the channel
// that can be used to put values onto channel.
function OutputPort(buffer, puts, takes, closed) {
  this.Port(buffer, puts, takes, closed)
}
OutputPort.prototype = Object.create(Port.prototype)
OutputPort.prototype.constructor = OutputPort
OutputPort.prototype.OutputPort = OutputPort
OutputPort.prototype.put = function(value) {
  return put(this, value, void(0))
}


function Channel(buffer) {
  buffer = buffer === void(0) ? buffer :
           buffer <= 0 ? void(0) :
           typeof(buffer) === "number" ? new FixedBuffer(buffer) :
           buffer;

  var puts = [], takes = [], closed = new Atom(false)

  this[$in] = new InputPort(buffer, takes, puts, closed)
  this[$out] = new OutputPort(buffer, takes, puts, closed)
}
Channel.prototype = {
  constructor: Channel,
  Channel: Channel,
  get input() { return this[$in] },
  get output() { return this[$out] }
}
exports.Channel = Channel


// Select allows to make a single choice between several channel
// operations (put / take). Choice is made is made in favor of operation
// that completes first. If more than one operation is ready to be complete
// at the same time choice is made in favor of the operation which was
// requested first.
// Usage:
//
// var select = new Select()
// var a = select.take(input1).then(function(x) {
//   console.log("Took " + x + " from input1")
// })
// var b = select.take(input2).then(function(x) {
//   console.log("Took " + x + " from input2")
// })
// var c = select.put(output, x).then(function(_) {
//   console.log("Put " + x + " onto output")
// })
//
// Note that only one of the above three operations is
// going to succeed.
function Select() {
  this[$timeout] = new Atom(false)
}
Select.prototype.Select = Select
Select.prototype.put = function(port, value) {
  return put(port, value, this[$timeout])
}
Select.prototype.take = function(port) {
  return take(port, this[$timeout])
}
exports.Select = Select
