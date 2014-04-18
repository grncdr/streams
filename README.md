# Channel API

## Where Did All the Text Go?

We are in the process of transitioning this specification from a GitHub README into something a bit more palatable. The official-lookin' version is developed in the `official-lookin` branch's `index.html` file, which you can see [on GitHub](https://github.com/whatwg/streams/blob/official-lookin/index.html), or in its rendered glory at [this long URL](http://anolis.hoppipolla.co.uk/aquarium.py/output?uri=http%3A%2F%2Frawgithub.com%2Fwhatwg%2Fstreams%2Fofficial-lookin%2Findex.html&process_filter=on&process_toc=on&process_xref=on&process_sub=on&process_annotate=on&filter=&annotation=&newline_char=LF&tab_char=SPACE&min_depth=2&max_depth=6&w3c_compat_xref_a_placement=on&parser=lxml.html&serializer=html5lib&output_encoding=ascii).

Right now, we've transferred over most of the concepts and text, but none of the algorithms or APIs. We'll be iterating on the APIs a bit more here, in Markdown format, until we feel confident in them. In the meantime, please check out the rendered spec for all of the interesting stage-setting text.

By the way, this transition is being tracked as [#62](https://github.com/whatwg/streams/issues/62).


### FixedBuffer

`FixedBuffer` class is used by buferred channels if it's instantiated with an argument of type number. `FixedBuffer` implements general `Buffer` interface:

```
// Buffer interface is used for buffers that can be passed
// into channels, they allow configurable bufferring of
// the channel based on the data it will be handling.
interface Buffer {
  // If this buffer is empty this should return `true`,
  // otherwise it should return `false`.
  boolean isEmpty();
  // If this buffer is full this should return `true`
  // otherwise it should return `false`.
  boolean isFull();
  // If this buffer is empty this should throw exception
  // otherwise it should return data chunk from the buffer
  // and adjust internal state as appropriate.
  any take();
  // If this `buffer` is full this should throw an exception
  // otherwise given `data` should be put into a buffer.
  put(any data);
}
```

#### Properties of the FixedBuffer prototype

##### constructor(size)

1. Set `this.[[size]]` to `size`.
1. Set `this.[[buffer]]` to `[]`.

##### isEmpty()

1. Return `this.[[buffer]].length === 0`.

##### isFull()

1. Return `this.[[buffer]].length === this.[[size]]`.

##### put(chunk)

1. If `this.isFull()`, throw Error
1. Add `chunk` to a buffer by calling:
   `this.[[buffer]].unshift(chunk)`.

##### take()

1. If `this.isEmpty()`, throw Error.
1. Return `this.[[buffer]].pop()`.



### Port

Port is a class that both `InputPort` and `OutputPort` derive from.

```
// Port interface is implemented by both input and output ports
// of the channel.
interface Port {
  // Closes this channel. Note that queued and bufferred values
  // still can be taken off the closed channel. If there are
  // queued takes on the channel (this implies buffer and put
  // queue is empty) then those takes are resolved with `undefined`.
  void close();
}
```

#### Properties of the Port prototype

##### constructor(channel)

1. Set `this.[[channel]]` to `channel`.
1. Return `this`

##### close()

1. Let `channel` be `this.[[channel]]`
1. Let `result` be result of calling `[[close]]` method of `channel`.
1. Return `result`.


### Operation

Objects implementing `Operation` interface are used to represent "take" and "put" operations on the channel. They can have a state that is either complete or pending. State can be checked via `isPending` method. If operation is complete it's result can be accessed via `valueOf` method. If operation is pending calling `valueOf` throws an error. Operation derives from `Promise` and it's `then` method can be used to access it's result.

```
interface Operation : Promise {
  // If operation is pending returns `true` otherwise
  // returns `false`.
  boolean isPending();
  // If operation is pending throws an error, otherwise
  // returns result of the operation.
  any valueOf();
}
```

#### Properties of the Operation prototype

#### isPending()

1. Let `choice` be `this.[[select]].[[choice]]`.
1. Let `result` be `true.
1. If `this` is `choice`, Set `result` to `false`.
1. Return `result`.

#### valueOf()

1. If `this.isPending()` is `true` throw an Error.
1. Return `this.[[result]]`.

#### [[isActive]]

1. Let `result` be `true`.
1. If `this.[[select]].[[choice]]` is not `void 0`,
   Set `result` to `false`.
1. Return `result`.

#### [[complete]](result)

1. If `this.[[isActive]]()` is `false` throw an Error.
1. Set `this.[[select]].[[choice]]` to `this`.
1. Resolve `this` promise with a `result` as a `value`.
1. Set `this.[[result]]` to `result`.

### OutputPort

An output port represents end of the channel into which data can be put to make it available to the input port of the same channel.

```
[NamedConstructor=OutputPort(Channel channel)]
interface OutputPort : Port {
  // If this channel is closed operation is ignored and
  // promise resolved with `undefined` is returned
  // (Promise.resolve(void 0)).


  // If `value` put on a channel is `undefined` it is ignored
  // same as it is in JSON.

  // Channels can be bufferred or unbuffered. Putting values
  // onto buffered channel returns promises resolved with
  // `true` (`Promise.resolve(true)`) until buffer is full.

  // If this channel is unbuffered or buffer is full puts values
  // are queued. In such case returned value a promise that will
  // be resolved with `true` once put value will make it into
  // a buffer or be taken of the channel.
  Operation <boolean> put(any value);
}
```

#### Properties of the OutputPort prototype

#### constructor(channel)

1. Call the `[[Call]]` internal method of `Port`, with `this` as `thisArgument` and `channel` as an argument.

#### get [[Prototype]]

1. Return `Port.prototype`.

##### put(data)

1. Let `channel` be `this.[[channel]]`
1. Return `channel.[[put]](this, data, void 0)`.


### InputPort

An input port represents end of the channel from which data can be taken, that was put there from the output port of the same channel.


```
[NamedConstructor=InputPort(Channel channel)]
interface InputPort : Port {
  // If this channel has no queued "puts" and has being
  // already closed returns promise resolved with `undefined`
  // think of it as reading undefined property.
  //
  // If channel has no queued or bufferred "puts" then
  // "take" is enqueued and promise is returned that
  // will be resolved with value whenever it's "put"
  // on a channel.
  //
  // If this channel has bufferred data it's taken off
  // the buffer and promise resolved with it is returned.
  // If channel has queued "put" data it will be moved
  // over to buffer.
  //
  // If channel is unbuffered and it has queued "put" data
  // promise resolved with "put" data is returned, also
  // causing pending put promise to resolve.
  Operation <any> take();
}
```


#### Properties of the InputPort prototype

1. Call the `[[Call]]` internal method of `Port`, with `this` as `thisArgument` and `channel` as an argument.

#### get [[Prototype]]

1. Return `Port.prototype`.


##### take()

1. Let `channel` be `this.[[channel]]`
1. Return `channel.[[take]](this, void 0)`.


### Channel APIs


```
[NamedConstructor=Channel(float n),
 NamedConstructor=Channel(Buffer buffer)]
interface Channel {
  attribute InputPort input;
  attribute OutputPort output;
}
```

#### Properties of the Channel prototype

##### constructor(buffer)

The constructor can be passed optional argument that implements
`Buffer` interface. If such argument is passed than resulting
channel is bufferred and given `buffer` is used for bufferring
data. If argument is a number, then buffered channel is created
with fixed size buffer of given size. Bufferred channels allow
seperation of data handling (delegating that to buffer) from data
transfer. Bufferred channels won't block (return pre-resolved
promises) when putting data on them until buffer is full, which
gives more freedom to a producer and consumer to have they're own
work schedules.

Data still can be put on the channel even if buffer is full or
if channel is unbuferred it's just in such case put operation
is going to be enqueued until it can be completed.

1. If `buffer` is instance of `Buffer`,
   Let `buffer` be `buffer`.
1. If `buffer` is type of number,
   Let `buffer` be `new FixedBuffer(buffer)`.
1. If `bufffer` is `undefined`
   Let `buffer` be `undefined`.
1. Set `this.[[buffer]]` to `buffer`.
1. Set `this.[[puts]]` to `[]`.
1. Set `this.[[takes]]` to `[]`.
1. Set `input.[[closed]]` to `false`.
1. Set `this.[[in]]` to `new InputPort(this)`.
1. Set `this.[[out]]` to `new OutputPort(this)`.

##### get input()

1. Return `this.[[in]]`.

##### get output()

1. Return `this.[[out]]`.

##### close()

1. If `this.[[closed]]` is `false`,
  1. Set `this.[[closed]]` to `true`.
  1. While `this.[[takes]].length > 0`:
     1. Let `take` be `this.[[takes]].pop()`,
     1. If `take.[[isActive]]()` is `true`,
        Call `take.[[complete]](void 0)`.
1. Return `void 0`.


##### [[put]](port, data, select)

1. If `port` isn't instance of `OutputPort` throw `TypeError`.
1. Let `puts` be `this.[[puts]]`.
1. Let `takes` be `this.[[takes]]`.
1. Let `buffer` be `this.[[buffer]]`.
1. Let `put` be a newly-created pending operation.
1. If `select` is `void 0`,
   1. Set `put.[[select]]` to `put`.
1. If `select` is instance of `Select`,
   1. Set `put.[[select]]` to `select`.
1. If `put.[[isActive]]()` is `true`,
   1. If `this.[[closed]]` is `true,
      call `put.[[complete]](void 0).
   1. If `this.[[closed]]` is `false` and
      1. If `data` is `void 0`,
         1. call `put.[[complete]](true)`.
      1. If `data` is not `void 0`,
         1. If `buffer` is `void 0`,
            1. Let `take` be `takes.pop()`.
            1. While `take` is object & `take.[[isActive]]()` is `false`,
               1. Set `take` to `take.pop()`.
            1. If `take` is object & `take.[[isActive]]()` is `true`,
               1. Call `put.[[complete]](true)`.
               1. Call `take.[[complete]](data)`.
            1. If `take` is `void 0`,
               1. Set `put.[[value]]` to `data`.
               1. Call `puts.unshift(put)`.
         1. If `buffer` is instance of `Buffer`,
            1. If `buffer.isFull()` is `true`,
               1. Set `put.[[value]]` to `data`.
               1. Call `puts.unshift(put)`.
            1. If `buffer.isFull()` is `false,
               1. Call `buffer.put(data)`.
               1. Call `put.[[complete]](true)`.
               1. If `buffer.isEmpty()` is `false`,
                  1. Let `take` be `takes.pop()`.
                  1. While `take` is object && `take.[[isActive]]()` is `false`
                     1. Set `take` to `take.pop()`.
                  1. If `take` is object & `take.[[isActive]]()` is `true`,
                     1. Call `take.[[complete]](buffer.take())`.
1. Return `put`.


##### [[take]](port, select)

1. If `port` isn't instance of `InputPort` throw `TypeError`.
1. Let `puts` be `this.[[puts]]`.
1. Let `takes` be `this.[[takes]]`.
1. Let `buffer` be `this.[[buffer]]`.
1. Let `take` be a newly-created pending operation.
1. If `select` is `void 0`,
   1. Set `put.[[select]]` to `put`.
1. If `select` is instance of `Select`,
   1. Set `put.[[select]]` to `select`.
1. If `take.[[isActive]]()` is `true`,
   1. If `buffer` is not `void 0`,
      1. Let `isEmpty` be `buffer.isEmpty()`.
      1. If `isEmpty` is `false`
         1. Let `data` be `buffer.take()`.
         1. Call `take.[[complete]](data)`.
         1. If `buffer.isFull()` is `false`,
            1. Let `put` be `puts.pop()`.
            1. While `buffer.isFull()` is `false` and
               `put` is object
               1. If `put.[[isActive]]()` is `true`,
                  1. Call `put.[[complete]](true)`.
                  1. Call `buffer.put(put.[[value]])`.
               1. set `put` to `puts.pop()`.
      1. If `isEmpty` is `true`,
         1. If `this.[[closed]]` is `true`,
            1. Call `take.[[complete]](void 0)`.
         1. If `this.[[closed]]` is `false,
            1. Call `takes.unshift(take)`.
   1. If `buffer` is `void 0`,
      1. Let `put` be `puts.pop()`.
      1. While `put` is object and `put.[[isActive()]]` is `false`,
         1. Set `put` to `puts.pop()`.
      1. If `put` is object,
         1. Call `put.[[complete]](true)`.
         1. Call `take.[[complete]](put.[[value]])`.
      1. If `put` is `void 0`,
         1. If `this.[[closed]]` is `true`,
            1. Call `take.[[complete]](void 0)
         1. If `this.[[closed]]` is `false`,
            1. Call `takes.unshift(take)`.
1. Return `take`


### Select API

Select allows to make a single choice between several channel operations (`put` / `take`). Choice is made in favor of operation that completes first. If more than one operation is ready to be complete at the same time choice is made in favor of the operation which was requested first.

#### Interface

```
[NamedConstructor=Select()]
interface Select {
  Operation <any> take(InputPort input);
  Operation <boolean> put(OutputPort output, any value);
}

```

#### Properties of the Select prototype

##### constructor()

1. Let `this.[[choice]]` be `undefined`.
1. Return `this`.

##### put(port, data)

1. Let `channel` be `port.[[channel]]`
1. Return `channel.[[put]](port, data, this)`.

##### take(port)

1. Let `channel` be `port.[[channel]]`
1. Return `channel.[[take]](port, this)`.
