# Channel API Examples

Although some examples are given in-line with the specification, they are generally focused on a specific aspect being discussed, and are not complete examples of how you might use channels in a real application.

This document fleshes out those examples, adding more code and commentary to each, and includes new examples focused on scenarios not necessary to explain the spec. It is meant to be standalone, so an astute reader will notice some text duplication with the specification.

## Channels

### History

The roots of the channels go back at least as far as [Hoare's Communicating Sequential Processes (CSP)][CSP], followed by realizations and extensions in e.g. [occam][], [Go programming language][go], [Rust programming language][rust], [Clojure core.async library][core.async].

In modern incarnations, the notion of a channel becomes first class, and in doing so provides us the indirection and independence we seek.


### Rationale

There comes a time in all good programs when components or subsystems must stop communicating directly with one another. This is often achieved via the introduction of events or queues between the producers of data and the consumers of that data. This architectural indirection ensures that important decisions can be made with some degree of independence, and leads to systems that are easier to understand, manage, monitor and change, and make better use of computational resources, etc.

A key characteristic of channels is that they are blocking (not in a thread blocking sense, but rather in logical sense, you need to asynchronously wait for task to complete to continue). In the most primitive form, an unbuffered channel acts as a rendezvous, any consumer will await a producer and vice-versa. Buffering can be introduced, to allow more flexibility between producer and consumer schedules. Buffering with blocking can be an important tool coordinating pacing and back pressure, ensuring a system doesn't take on more work than it can achieve.

## API


Channels provide a message-based communication over different (& typically concurrent) components of the application.
An `OutputPort` end is used to put data onto channel for an `InputPort` end to take it. Ports are exposed by a channel via `output` and `input` fields.


```js
const { input, output } = new Channel()
```

Clones of the `output` and `input` can be created by instantiating them via constructor functions `new InputPort(channel)` / `new OutputPort(channel)`.

```js
const channel = new Channel()
const out = new OutputPort(channel)
```

### "Rendezvous" channels

Channels are the building blocks for task coordination and data transfer. A key characteristic of channels that
make them a good fit for task coordination is that they are blocking, not a **thread** blocking, meaning they do not block execution, but rather a logically blocking. Blocking is expressed via data structures representing result of an **operation** that task can await to complete before continuing with rest of it's job. Since this form of blocking does not actually blocks execution we will refer to as **parking** further on, to avoid confusion.

`OutputPort` defines `put` method that takes arbitrary data and puts it on a channel, returning an instance of `Operation`, which is going to be pending until put is complete. `InputPort` defines `take` method that also returns an instance of `Operation` that is going to be pending until taks is complete.

```js
const { input, output } = new Channel()

var p1, p2, p3, t1, t2, t3

p1 = output.put(1)  // => Operation <true>
p1.isPending()      // => true
p1.valueOf()        // Error: Can not return result of pending operation

p2 = output.put(2)  // => Operation <true>
p2.isPending()      // => true
p2.then(function() { console.log("put#2 is complete") })

t1 = input.take()   // => Operation <1>
t1.isPending()      // => false
t1.valueOf()        // => 1
p1.isPending()      // => false
p1.valueOf()        // => true

t2 = input.take()  // => Operation <2>
// info: put#2 is complete
p2.isPending()      // => false
p2.valueOf()        // => true
t2.isPending()      // => false
t2.valueOf()        // => 2

t3 = input.take()   // => Operation <3>
t3.isPending()      // => true
```

The channel conceptually has an infinite queue, where all pending put and take operations are queued up until they are complete. As you could have noticed from the example above channels operate on [FIFO][] basis.


### Buffered channels


So far all of the examples have being "parking" producer and consumer tasks on every single operation, this is useful but, the problem is that this forces producer and a consumer to operate on a same schedule. This can easily be inpractical as it forces one of tasks (producer or consumer) to oparate slower causing wasted CPU cycles. Another option could be to let tasks ignore "parking" completely that essentially removes synchronization from the system, which can easily cause too much memory use caused by pending operations in the queue.

Right soultion would usually require balancing out level at which producer and consumer coordinate. This is achived by  bufferring. Channel constructor can be supplied a number argument to construct a bufferred channel, in which case fixed size buffer of that number of puts is pre-allocated and used for storing pending data. Bufferred channels do not "park" producer tasks (puts return complete operations) until buffer is full. Once buffer is full, puts start to "park" producer task until more space on buffer becomes available (which is when data is taken of the channel).


```js
var { input, output } = new Channel(3)
var p1, p2, p3, p4, t1

p1 = output.put(1)   // => Operation <true>
p1.isPending()       // => false

p2 = output.put(2)   // => Operation <true>
p2.isPending()       // => false

p3 = output.put(3)   // => Operation <true>
p3.isPending()       // => false

p4 = output.put(4)   // => Operation <true>
p4.isPending()       // => true

t1 = input.take()    // => Operation <1>
t1.isPending()       // false

// Since more space became availabel in buffer
// p4 was complete.
p4.isPending()       // false
```

In the example above first three items `1, 2, 3` are bufferred and there for do not "park" producer task. By the time forth put occures buffer is full, there for that operation going to be pending until data is taken off the channel  freeing up space on a buffer. This allows producer and consumer tasks to have their own work schedules and don't waste cycles on waiting each other.


#### Bufferring strategies

Buffering not adds flexibility to a channel for more balanced coordination between producers and consumers, but it also completele decouples data **transport** (streaming) constraints handled by channels from data **aggregation** (bufferring) constraints handled by buffers. This provides a lot of flexibility on how data transported by channel is handled or stored.


Channel constructor can be supplied a custom `buffer` implementing Buffer API, in which case it is going to be used for storing / aggregating data. This allows users to completely alter the way data is handled by a channel.

For example you may define `SlidingBuffer` that would never block producer instead it would drop less relevant data from the channel:

```js
function SlidingBuffer(size) {
  this.buffer = []
  this.size = size
}
SlidingBuffer.prototype.isEmpty = function() {
  return this.buffer.length === 0
}
// Sliding buffer is never full since it just drops oldest
// chunks of data when overflowing.
SlidingBuffer.prototype.isFull = function() {
  return false
}
SlidingBuffer.prototype.take = function() {
  return this.buffer.pop()
}
SlidingBuffer.prototype.put = function(data) {
  if (this.buffer.length === this.size)
    this.take()

  this.buffer.unshift(data)
}

var buffer = new SlidingBuffer(3)
var { input, output } = new Channel(buffer)
var p1, p2, p3, p4, t1

p1 = output.put(1)   // => Operation <true>
p1.isPending()       // => false

p2 = output.put(2)   // => Operation <true>
p2.isPending()       // => false

p3 = output.put(3)   // => Operation <true>
p3.isPending()       // => false

p4 = output.put(4)   // => Operation <true>

// Note that because sliding buffer never fulls
// up channel can never block!
p4.isPending()       // => false

t1 = input.take()    // => Operation <2>
t1.isPending()       // false

// Note that because channel uses a sliding buffer
// which drops oldest data chunks after it aggregates
// max number of items, first take result is a data
// that was put second.
t1.valueOf()         // 2
```

#### Aggregators

It is natural to that bufferring strategy would as much depend on the type of data channel is transporting as much as it depends on desired aggregation strategy. Good example would be use of channels for represinting binary data coming from I/O task. It would make sense to measure such buffer not in numbers of chunks it can hold but rather in number of bytes, it would also make sense to change how aggregate data is taken from such buffer, which is not in chunk data was put into it originally but rather in whatever is available at a time.

```js
function ByteBuffer(size) {
  this.size = size
  this.chunks = []
  this.byteLength = 0
}
ByteBuffer.prototype.isEmpty = function() {
  return this.byteLength === 0
}
// ByteBuffer is full whenever bytes contained by it
// exceeds it's maximum size.
ByteBuffer.prototype.isFull = function() {
  return this.size <= this.byteLength
}
// ByteBuffer is only compatible with data represnted by
// ArrayBuffers as that's only thing it can mesure and
// aggregate.
ByteBuffer.prototype.put = function(chunk) {
  if (!(chunk instanceof ArrayBuffer))
    throw TypeError("Can only put ArrayBuffer")
  this.chunks.push(chunk)
  this.byteLength = this.byteLength + chunk.byteLength
}
// `ByteBuffer` also changes how data is taken from it,
// it returns `ArrayBuffer` that will contain all of the
// data that buffer holds.
ByteBuffer.prototype.take = function() {
  var result = new ArrayBuffer(this.byteLength)
  var chunks = this.chunks.splice(0)

  this.byteLength = 0
  var index = 0
  var offset = 0
  while (index < chunks.length) {
    var chunk = chunks[index]
    var element = 0
    while (element < chunk.byteLength) {
      result[offset] = chunk[element]
      element = element + 1
      offset = offset + 1
    }
    index = index + 1
  }

  return result
}


var buffer = new ByteBuffer(1024)
var { input, output } = new Channel(buffer)

output.put(new TextEncoder("utf-8").encode("hello").buffer) // => Operation <true>
output.put(new TextEncoder("utf-8").encode(" ").buffer)     // => Operation <true>
output.put(new TextEncoder("utf-8").encode("world").buffer) // => Operation <true>

var take = input.take()
take.isPending()           // => false

// Notice that all the data was concatinated and taken at once.
TextDecoder("utf-8").decode(new Uint8Array(take.valueOf())) // => "hello world"
```

### Channel termination

Channel is a communication primitive, and any communication channel has to be terminated at some point. This can be achieved from either end (`input` / `output`) of the channel, simply by closing a port. Whenever either end of the channel is closed, put operations on it are dropped and result to `undefined`.

Data put onto channel still can be taken from it even after channel is closed. Once no more data is left on a closed channel takes from it will result to `undefined`. This implies that any pending take operations from closed channel go
ing to complete to `undefined` too.

Closing already closed channel has no effects.

```js
var { input, output } = new Channel(10)
output.put(1)  // Operation <true>
output.put(2)  // Operation <true>
output.close()

// Once channel is closed all puts are void.
output.put(3)  // Operation <void 0>

input.take()   // Operation <1>

// Closing closed channel has no effect.
input.close()

input.take()   // Operation <2>

// Once closed channel is empty all takes are void.
input.take()   // Operation <void 0>
input.take()   // Operation <void 0>
```

### Type of data

Type of data that channel can transport pretty much depends on a buffer that handles data. If data is rejected by a buffer via thrown exception associated put will fail. In which case operation is no longer going to be pending, but attempt to access it's result will throw an exception raised by a buffer. Take operation is also going to be rejected in a promises sense.

```js
var buffer = new ByteBuffer(1024)
var { input, output } = new Channel(buffer)

var put = output.put("hello")
put.isPending()               // false
put.valueOf()                 // TypeError: Can only put ArrayBuffer
put.catch(function(error) {
  return "Oops"
})                            // Promise <"Oops">
```

##### *Consider rejecting attemts to put undefined instead of dropping*

Unless data type that channel can transport is restricted by a buffer, it can transport data of any type, which is anything but `undefined` which is not a data, but rather an absence of it. Attempts to put data are ignored, returning
operations that result into `true` if channel is open and `undefined` if it is closed. In terms of analogy think of `JSON.stringify({ foo: void 0, bar: 1 })` producing `'{"bar":1}'`.


```js
var { input, output } = new Channel()


output.put(void 0)     // => Operation <true>
output.put(1)          // => Operation <true>

// Note that result of take is `1` as attempts to
// put `undefined` are dropped.
input.take()           // => Operation 1

input.close()

// Note that even though attempt to put `undefined` is
// ignored result still depends on weather channel is
// open or closed.
output.put(2)          // => Operation <void 0>
```


### Select

It is often desirable to be able to wait for any one (and only one) of a set of channel operations to complete. This powerful facility is made available through the `Select` API.

`Select` constructor can be used to create a selection task which can be used to perform `take` and `put` operations. Select API guarantees that only one of the attempted operations will be complete (rest will remain pending) and choice is made in favor of the operation that is ready to complete. If more than one operation is ready to complete, first one supplied will be chosen.

```js
var Select = require("channel").Select
function read(socket) {
  var select = new Select()
  var data = select.take(socket.data)
  // If error transform error reason to a rejected promise.
  var error = select.take(socket.error).then(Promise.reject)
  // Given that select guarantees that only one of the operations
  // is going to complete we can use `Promise.race` to return
  // the one that will actually complete.
  return Promise.race([data, error])
}
```

Above example uses select API to choose between two take operations, but it can also be used to choose between different types of operations too.

```js
function save(data, timeout) {
  var select = new Select()
  return Promise.race([
    select.take(timeout).then(function(x) {
      console.log("Task has timed out")
      return Promise.reject(x)
    }),
    select.put(server1, data).then(function() {
      console.log("Wrote ", data, "to server#1")
    })
    select.put(server2, data).then(function() {
      console.log("Wrote ", data, "to server#2")
    })
  ])
}
```

### Coordinating tasks

Channels are the building blocks for task coordination and data transfer. A key characteristic of channels that
make them a good fit for task coordination is that they are blocking, not a **thread** blocking, meaning they do not block execution, but rather a logically blocking. Blocking is expressed via data structures representing result of an **operation** that task can await to complete before continuing with rest of it's job. Since this form of blocking does not actually blocks execution we will refer to as **parking** further on, to avoid confusion.


The fundamental operations on channels are putting and taking values. Both of those operations potentially park a task, but how thas is handled by a task is left up it's implementation.

Different strategies may have different strength and weaknesses & in order to illustrate them we will implement same
`pipe(input, output, close)` example that pipes data from `input` port to an `output` port that closes `output` port once `input` is closed if given `close` argument is `true`.


#### Coordination (a.k.a back pressure) via Promises

Given that both put and take return `Operation` instances that are derived from `Promise` all the available Promise APIs could be used to coordinate producer and conusmer.

```js
function pipe(input, output, close) {
  // Utility function reads chunk from the input and waits
  // until operation is complete, then continue with write
  // by passing result of take to it.
  function read() {
    input.take().then(write)
  }

  // Utility function is given a chunk of `data`.
  function write(data) {
    // If `data` is void then `input` is closed. If `close`
    // was passed as `true` close `output` port otherwise
    // leave it open.
    if (data === void(0)) {
      if (close) output.close()
    }
    // If actual `data` was passed put it onto `output`
    // port and wait until opeartion is complete, then continue
    // with read.
    else {
      output.put(data).then(read)
    }
  }

  // Initiate read / write loop.
  read()
}
```

Promise based implementation only makes use of already available Promise APIs and is expressed via two simple read & write tasks that give control to each other on complition.

Given that completion of a task is observed via Promise APIs one task per tick limitation is imposed. While giving control back to event loop does not tends to be a problem in common case, there are maybe tasks where imposed limitation is unacceptable. On the other hand it's less hard to hit a race condition when each task happens on a different tick.


#### Coordination (a.k.a back pressure) via state machine

In some cases it is important to complete as much operations as possible with in a same tick as it may have impact on the data throughput. This can be achieved by implementing a task as a state machine, that only awaits for an operation if it is pending.

```js
function pipe(input, output, close) {
  // `operation` will hold an operation currently being handled.
  // Initially we start by takeing data from `input`.
  var operation = input.take()
  // `state` will be set to either `"take"` or `"put"` to indicating
  // type of operation being handled. Initial we start with "take".
  var state = "take"

  // Utility function represnting represents task that runs operation
  // loop. It alternates between "take" and "put" operations until
  // hit the pending one. In which case task is suspended and resumed
  // once pending operation is complete.
  function run() {
    // Keep handling operations until hit the one that is pending.
    while (!operation.isPending()) {
      // Since `operation` is not pending it's result can be
      // accessed right away.
      var result = operation.valueOf()
      // If `result` is `void` then channel is closed. In such case
      // close `output` if `closed` was passed as true & abort the
      // task.
      if (result === void(0)) {
        return close && output.close()
      }
      // If state machine is in `take` state then switch it
      // to `put` state, passing along the result of the take
      // operation.
      else if (state === "take") {
        state = "put"
        operation = output.put(result)
      }
      // If state machine is in a `put` state then switch it
      // to `take` state.
      else if (state === put) {
        state = "take"
        operation = input.take()
      }
    }

    // If operation loop was escaped, then current operation is pending.
    // In such case re-run the task once operation is complete.
    operation.then(run)
  }

  // Initiate the run loop.
  run()
}
```

State machine based implementation is overcomes throughput limitation that was present in promise based implementation although that is at the cost of added complexity some of which is not actually that apparent. Since some data chunks are put on `output` synchronously and some asynchronously consumer of that output may hit race conditions if it deals with shared mutable state.

Implementation can also be further refined to pose a limit on operations it handles within a tick, otherwise very active input may exhast event loop.


#### Coordination (a.k.a back pressure) via cooperative tasks


There are many options of generator based flow control libraries like [task.js][task.js], [co][co], [suspend][suspend] that allow modeling concurrent tasks like **cooperative** threads. They suspend task execution on `yield operation` and resume when `operation` is complete. You can choose your favourite one, but here we are just going to use one thas is included with a [reference implementation][spawn implementation].

```js
function pipe(input, output, close) {
  // Start a new concurrent task.
  spawn(function*() {
    var chunk = void(0)
    // yield blocks the task until operation is complete, resuming
    // it from the point it left off with a result of the operation.
    // If chunk is `void` input is closed and all data was taken,
    // which exits the loop.
    while (chunk = yield input.take(), chunk !== void(0)) {
      // yield blocks the task until put operation is complete,
      // resuming it from the point it left off.
      yield output.put(chunk)
    }
    // If optional `close` argument was passed as `true` close an `output`
    // port as well.
    if (close) output.close()
  })
}
```

Cooperative task based implementation is really simple as it maintains linear flow of the task. It is also worth noting that based of `spawn` implementation it can process operation per tick (like in case of Promise based implementation) or process as many as available (like in case of State Machine based implementation), which is really great as those decisions can be made independently and will not require any changes to the above `pipe` implementation. Furthermore given that [Async Functions][] are on the Ecmascript roadmap this style will likely to get syntax support & hopefully additional optimizations.

Unfortunately today this approach is not viable on every platform given the lack of genertor presense. Although that could be mitigated via tools like [regenerator][], [degenerate][], [gnode][], etc..


### API examples

Given that we have illustrated different ways task coordination (a.k.a back pressure) can be handled further examples will mostly stick to using cooperative tasks as they are more expressive & don't raise immediate questions in regard to weather one or multiple operation is processed per tick. Implementing same with an differnt coordination strategy is left as an excercise to a reader.

#### printing a channel

Although the by-far most common way of consuming a channel is to transform it from one form to another, it is useful to see some examples to understand how the underlying primitives work. Consider following `print` function that writes the contents of a given channel to the console:

```js
function print(input) {
  spawn(function() {
    var chunk = void(0)
    while (chunk = yield input.take()) {
      console.log(chunk)
    }
    console.log("--- all done")
  })
}

var { input, output } = new Channel()
print(input)

output.put(1)
output.put(2)
output.put(3)
output.close()

// Prints 1 2 3 ---all done
```

#### Taking multiple chunks at a time

This example, is going to define `take` function that returns given number of data chunks from the input in one batch. If number isn't provided takes all of the chunks at once. If less channel is closed before than given number of chunks is put takes as many chunks as were put. Result is a promise that resolves to an array of taken chunks.


```js
// Takes given number of chunks from the channel or
// all of them if `n` is not passed.
function take(input, n) {
  return spawn(function() {
    n || Infinity
    var chunk = void(0)
    var chunks = []
    // While we still have not reach `n` number of chunks and
    // there are still more chunks on input
    while (chunks.length < n && chunk = yield input.take()) {
      chunks.push(chunk)
    }
    return chunks
  })
}


var { input, output } = new Channel()

output.put(1)
output.put(2)
output.put(3)

take(input, 2) // => Promise <[1, 2]>

output.put(4)
output.put(5)

take(input)   // => Promise <[3, 4, 5]>
```

### Combinators

Given that interface for working with channels is really simple, it is trivial to define combinators that inherent backpressure characteristics of the source. Following examples will define bunch of combinators to illustrate that.

#### map(source, f)

Takes a source (input port of the channel) and a function, and returns a input port which contains the values produced by applying `f` to each value taken from the `source`. The port will close when the `source` closes.

```js
function map(source, f) {
  var { input, output } = new Channel()
  spawn(function*() {
    var chunk = void(0)
    while (chunk = input.take(), chunk !== void(0)) {
      output.put(f(chunk))
    }
    output.close()
  })
  return input
}
```

#### filter(source, p)

Takes a source input port and predicate, and returns an input port which contains only the values taken from the source for which the predicate returns true. The port will close when the `source` closes.

```js
function filter(source, p) {
  var { input, output } = new Channel()
  spawn(function*() {
    var chunk = void(0)
    while (chunk = input.take(), chunk !== void(0)) {
      if (p(chunk))
        output.put(chunk)
    }
    output.close()
  })
  return input
}
```

#### combine(sources, f)

Takes array of source input ports and a combiner function, and returns input port that contains the results of applying `f` to the set of first items of each source, followed by applying f to the set of second items in each source, until any one of the sources is exhausted. Any remaining items in other sources are ignored.

```js
function take(input) { return input.take() }
function combine(sources, f) {
  var { input, output } = new Channel()

  function spawn(function*() {
    var params = []
    while (true) {
      var pending = sources.map(take)
      var index = 0
      while (index < pending.length) {
        var param = yield pending[index]
        if (param === void(0))
          return output.close()

        params[index](param)
        index = index + 1
      }
      output.put(f.apply(f, params))
    }
  })

  return input
}

var xys = combine([xs, ys], Array)
```
#### merge(sources)

Takes a collection of source input ports and returns an input port which contains all values taken from them. The returned. Returned port will close after all the source ports have closed.

```js
function merge(sources) {
  var { input, output } = new Channel()
  var open = sources.length

  // Task that pumps data from source to an output.
  function* pump(source) {
    var chunk = void(0)
    while(chunk = yield source.take(), chunk !== void(0)) {
      yield output.put(chunk)
    }
    open = open - 1

    // If all source inputs were closed close output.
    if (open === 0)
      output.close()
  }

  // spawn concurrent pump task for each source.
  sources.forEach(function(source) { spawn(pump, source) })

  return input
}
```

#### reductions(source, step, initial)

Takes a source input port, step function and an initial state and returns an input port of the intermediate values of the reduction (as per reduce) of `source` by `step`, starting with `initial`.

```js
function reductions(source, step, initial) {
  var { input, output } = new Channel()

  spawn(function*() {
    var past = initial
    var present = void(0)
    while (present = yield source.take(), present !== void(0)) {
      present = step(past, present)
      yield output.put(present)
    }
    output.close()
  })

  return input
}
```

#### split(source, p)

Takes a source input port and a predicate and returns an array of two channels, the first of which will contain the values for which the predicate returned `true`, the second those for which it returned `false`.

```js
function split(source, p) {
  var left = new Channel()
  var right = new Channel()

  spawn(function*() {
    var chunk = void(0)
    while (chunk = yield source.take(), chunk !== void(0)) {
      var output = p(chunk) ? left.output : right.output
      yield output.put(chunk)
    }
    left.output.close()
    right.output.close()
  })

  return [left.input, right.input]
}
```

#### broadcast(targets, close)

Creates a broadcasting output port which, broadcasts put value to each of the target output ports. If optional `close` is passed as `true` each of the targets will be closed when returned output is closed.

```js
function put(target, value) { return target.put(value) }
function close(target) { return target.close() }
function broadcast(targets, close) {
  var { input, output } = new Channel()

  spawn(function*() {
    var chunk = void(0)
    var count = targets.length
    while (chunk = yield input.take(), chunk !== void(0)) {
      var puts = targets.map(put)
      while (index < count) {
        yield put[index]
        index = index + 1
      }
    }
    targets.forEach(close)
  })

  return output
}
```

### Error handling

Channels do not provide any specical treatment of errors & the reason is that channel is just a data transport that is guaranteed to deliver data from it's one end to the other. If there is an error it's not a transportation error but an error in some other part of your application, it is reasonable to expect that those errors will be handled where they occur as it's is not related to a data transportation. That not to say you should not signal errors between components, as a matter of fact that is very common, although differnt use cases will require different ways of signaling and handling errors. One may argue that JS was designed with a built-in error handling mechanism (which is partually true as exception handling was added later) and that's what channels should obey to. But then it is important to remember that JS does not has any built-in notion of IO, it has being exposed with addition of [XMLHttpRequest][] to a DOM, same story with parallel execution provided via [Web Workers][workers]. If you look at those APIs they dont throw exceptions on errors so you could catch them, because error happens conncurrently outside of your program. Instead you have a special "error" event to signal such errors. Also note that while an "error" on [XMLHttpRequest][] happens only once and means that request has failed, "error" on [Workers][] can occur many times (could be triggerred by invalid message parsing for example). Same is true in case of channels, in some cases error on the producer may completely abort the task and close a data channel, while in other cases many errors can occur without any issues. In terms of analogy it helps to think of channels more of a transports for a specific types of data rather than [XMLHttpRequest][] or [Worker][] themselfs. In that respect it does make sense to model `XMLHttpRequest` and `Worker` as a sockets with output port for sending data, input port for receiving data error port for signaled errors:

```js
function Socket() {
  this[$request] = new Channel()
  this[$response] = new Channel()
  this[$error] = new Channel()
}
Socket.prototype = {
  constructor: Socket,
  get input() {
    return this[$response].input
  },
  get output() {
    return this[$request].output
  },
  get error() {
    return this[$error].input
  }
}
```

Now in case of `XMLHttpRequest` message on the `error` channel would close all three channels as request is failed, while in case of `Worker` nothing special is going to happen.

It is also probably no coincidence that OS processes have a very similar interface through `stdin`, `stdout` and `stderr` :)


As we go through more examples it will become apparent how different error handling APIs going to be used in different examples, but before we move on let's define simple `Reader` class that can be used in cases where plain try catch based error handling makes most sense.

#### Reader(input, error)

Reader takes data `input` port and `error` input port and create a reader that can represent any data source that may have error. Readers are defined by one method, read that either succeeds or fails depending on weather underlaiyng data source had any errors.


```js
function Reader(input, error) {
  Object.defineProperties(this, {
    input: {
      enumerable: true,
      configurable: false,
      writable: false,
      input: input
    },
    error: {
      enumerable: true,
      configurable: false,
      writable: false,
      output: output
    }
  })
}
Reader.prototype.read = function() {
  var select = new Select()
  var data = select.take(this.input)
  var error = select.take(this.error).then(Promise.reject)

  return data.isPending() ? Promise.race([data, error]) : data
}
```


### Push or Pull

In general whether to use push or pull tends to be a subject of big debate. Producers tend to prefer push based approach while consumers tend to prefer pull based approach. Truth is the only way to satisfy both producer and a consumer is to put a queue between them and let them make choice between pull or push independently of each other based on their own constraints. As a matter of fact buffered channels do exactly that they are just a data queues with internal buffer that is used to smooth out I/O between producer and consumer. Note that when buffer is full, puts are not lost, but rather queued up applying back pressure on the producer. Choosing right buffer for the task is crucial to arranging best use of resources.


#### Adapting a Push-Based Data Source

In general, a push-based data source can be modeled as:

- A `resume` method that starts the flow of data.
- A `pause` method that pauses the flow of the data.
- A `close` method that closes the source.
- A `ondata` handler that fires when new data is pushed from the source
- A `onend` handler that fires when the source has no more data
- A `onerror` handler that fires when the source signals an error getting data.

As an aside, this is pretty close to the existing HTML [`WebSocket` interface](http://www.whatwg.org/specs/web-apps/current-work/multipage/network.html#the-websocket-interface), with the exception that `WebSocket` does not give any method of pausing or resuming the flow of data.

Let's assume we have some raw C++ socket object or similar, which presents the above API. The data it delivers via `ondata` comes in the form of `ArrayBuffer`s. We wish to create a class that wraps that C++ interface into a stream, with a configurable high-water mark set to a reasonable default. This is how you would do it:


```js
function SocketReader(host, port, options) {
  options = options || {}
  var highWaterMark = options.highWaterMark || 16 * 1024;
  // Use earlier defined ByteBuffer that will take care of
  // bufferring data and blocking puts if it's full (over the
  // `highWaterMark`).
  var buffer = new ByteBuffer(highWaterMark)
  var response = new Channel(buffer)
  var error = = new Channel()

  this.host = host
  this.port = port
  Reader.call(this, response.input, error.input)

  var source = createRawSocket(host, port)


  function onput(open) {
    // If response channel was closed close a socket.
    if (!open) {
      source.close()
    }
    // If buffer is fully empty, resume socket again.
    else if (buffer.isEmpty()) {
      source.resume()
    }
  }

  source.onerror = function(e) {
    error.output.put(e)
  };
  source.onend = function() {
    response.output.close()
  }
  source.ondata = function(chunk) {
    var put = response.output.put(chunk)
    if (put.isPending()) {
      source.pause()
      put.then(onput)
    }
    // If response channel is closed close
    // the underlaynig socket source.
    else if (!put.valueOf())
      source.close()
    }
  }

  // start a underlying data source.
  source.resume()
}
SocketReader.prototype = Object.create(Reader.prototype)
SocketReader.prototype.constructor = Reader
```

By leveraging channels API it's is really simple to apply backpressure strategy on the underlaying raw socket. If allocated buffer size fills up to the high water mark (defaulting to 16 KiB), signal is sent to the underlying socket that it should pause sending us data. And once the consumer drains all the put data, it will send the resume signal back, resuming the flow of data. If consumer closes a channel than underlying socket connection is closed.

Error handling for readers can be approached in two different ways depending what fits the design of the compenents the best.

#### Plain try catch

In some case it make most sense to handle errors in a read loop like in example below:

```js
var client = new SocketReader("http://example.com", 80)

spawn(function*() {
  var chunk = void(0)
  try {
    while (chunk = yield client.read()) {
      console.log(chunk)
    }
    console.log("Read " + client.host + ":" client.port)
  } catch (error) {
    console.error("Failed to read " + client.host + ":" + client.port, error)
  }
})
```

#### Seperation of handlers

In other cases it may make sense to spawn two different tasks one handling error recovery and other one handling regular data. This also allows you to use simple combinator functions on each port where you likely would going
to do different things.

```js
var client = new SocketReader("http://example.com", 80)
print(map(client.input, JSON.parse))
spawn(function*() {
  if (yield client.error.take()) {
    // You'd probabaly wanna do some error recovery here instead.
    console.error("Failed to read " + client.host + ":" + client.port, error)
  }
})
```


#### Adapting a Pull-Based Data Source

In general, a pull-based data source can be modeled as:

- An `open(cb)` method that gains access to the source; it can call `cb` either synchronous or asynchronously, with either `(err)` or `(null)`.
- A `read(cb)` function method that gets data from the source; can call `cb` either synchronously or asynchronously, with either `(err, null, null)` indicating an error, or `(null, true, null)` indicating there is no more data, or `(null, false, data)` indicating there is data.
- A `close(cb)` method that releases access to the source; can call `cb` either synchronously or asynchronously, with either `(err)` or `(null)`.

Let's assume that we have some raw C++ file handle API matching this type of setup. Here is how we would adapt that into a readable stream:


```js
// Just an utilities to wrap raw file API into promise based interface.
function open(path, data, error) {
  var file = createRawFileHandle(filename);
  file.open(function(e) {
    if (error) reject(error)
      else resolve(file)
    })
  })
}

function read(file) {
  return new Promise(function(resolve, reject) {
    file.read(function(error, done, data) {
      if (error) reject(error)
      else if (done) resolve(void(0))
      else resolve(data)
    })
  })
}

function FileReader(path, options) {
  options = options || {}
  var buffer = new ByteBuffer(options.highWaterMark || 16 * 1024)
  var data = new Channel(buffer)
  var error = new Channel()

  Reader.call(this, data.input, errror.input)

  spawn(function*() {
    var file = void(0)
    try {
      // Open a file
      file = yield open(path)
      var chunk = void(0)
      while (chunk = yield read(file)) {
        yield data.output.put(chunk)
      }
    } catch(e) {
      error.output.put(e)
    } finally {
      if (file)
        file.close()
    }

    data.output.close()
  })
}
FileReader.prototype = Object.create(Reader.prototype)
```

As you may have noticed example above delegated data handling and loadbalancing to `ByteBuffer` which will cause `FileReader` to pause / resume reading from underlying C++ handler, when buffer is / isn't full. While `FileReader` act's as a regular `InputPort` it also provides domain specific functionality allowing consumers to use  traditional error handling techniques:

```js
spawn(function*() {
  var reader = new FileReader(path)
  var chunk = void(0)
  try {
    while (chunk = yield reader.read()) {
      console.log(chunk)
    }
    console.log("Read all")
  } catch (error) {
    console.error("Failed to read", error)
  }
})
```



[Task.js]:http://taskjs.org/
[FIFO]:http://en.wikipedia.org/wiki/FIFO
[workers]:http://www.w3.org/TR/workers/
[XMLHttpRequest]:http://www.w3.org/TR/XMLHttpRequest/
[CSP]:http://en.wikipedia.org/wiki/Communicating_sequential_processes
[occam]:http://en.wikipedia.org/wiki/Occam_programming_language
[go]:http://golang.org/
[rust]:http://www.rust-lang.org/
[core.async]:https://github.com/clojure/core.async
[co]:https://github.com/visionmedia/co
[suspend]:https://github.com/jmar777/suspend
[spawn implementation]:https://github.com/Gozala/channel/blob/master/spawn.js
[Async Functions]:http://wiki.ecmascript.org/doku.php?id=strawman:async_functions&s=async
[regenerator]:http://facebook.github.io/regenerator/
[degenerate]:https://github.com/Gozala/degenerate
[gnode]:https://github.com/TooTallNate/gnode
