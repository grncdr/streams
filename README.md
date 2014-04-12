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

Port is a class that both `InputPort` and `OutputPort` inherit from.

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

##### close()

1. If `this.[[closed]].value` is `false`,
  1. Set `this.[[closed]].value` to `true`.
  1. Let `take` be `this.[[takes]].pop()`,
    1. If `take` is an object,
       1. If `take.timeout.pending` is `true`,
          1. Set `take.timeout.pending` to `false`.
          1. Fulfill `take.promise` with `void 0`.
       1. Repeat from: Let `take` be `this.[[takes]].pop()`



### OutputPort

All the channel `output` ports are instances of `OutputPort`. There is no public constructor available for this class.


```
interface OutputPort {
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
  Promise <boolean> put(any value);
}
OutputPort implements Port;
```

#### Properties of the OutputPort prototype

#### get [[proto]]

1. Return `Port.prototype`.

##### put(data)

1. Let `timeout` be `{pending: true}`.
1. Return `[[put]](this, data, timeout)`.



### InputPort

All the channel `input` ports are instances of `InputPort`. There is no public constructor available for this class.


```
interface InputPort {
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
  Promise <any> take();
}
InputPort implements Port;
```


#### Properties of the InputPort prototype

#### get [[proto]]

1. Return `Port.prototype`.


##### take()

1. Let `timeout` be `{pending: true}`.
1. Return `[[take]](this, timeout)`.


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
1. Let `puts` be `[]`
1. Let `takes` be `[]`
1. Let `closed` be `{value: false}`.
1. Let `input` be new instance of `InputPort`.
1. Let `output` be new instance of `OutputPort`.
1. Set `input.[[buffer]]` to `buffer`.
1. Set `output.[[buffer]]` to `buffer`.
1. Set `input.[[puts]]` to `puts`.
1. Set `output.[[puts]]` to `puts`.
1. Set `input.[[takes]]` to `takes`.
1. Set `output.[[takes]]` to `takes`.
1. Set `input.[[closed]]` to `closed`.
1. Set `output.[[closed]]` to `closed`.
1. Set `this.[[in]]` to `input`.
1. Set `this.[[out]]` to `output`.

##### get input()

1. Return `this.[[in]]`.

##### get output()

1. Return `this.[[out]]`.


### Select API

Select allows to make a single choice between several channel
operations (`put` / `take`). Choice is made is made in favor of operation
that completes first. If more than one operation is ready to be complete
at the same time choice is made in favor of the operation which was
requested first.

#### Interface

```
[NamedConstructor=Select()]
interface Select {
  Promise <any> take(InputPort input);
  Promise <boolean> put(OutputPort output, any value);
}

```

### Internal API

#### Internal functions referred with in a definitions above.

##### [[put]](port, data, timeout)

1. If `port` isn't instance of `OutputPort` throw `TypeError`.
1. Let `promise` be a newly-created pending promise.
1. Let `put` be `{ data, timeout, promise }`.
1. If `timeout.pending` is `true`,
   1. If `put.timeout.pending` is `true`,
      1. If `port.[[closed]].value` is `true,
         1. Set `put.timeout.pending` to `false`.
         1. Fulfill `promise` with `void 0`.
      1. If `port.[[closed]].value` is `false`
         1. If `data` is `void 0`
            1. Set `put.timeout.pending` to `false`
            1. Fulfill `promise` with `true`.
         1. If `data` is not `void 0`,
            1. Let `take` be `port.[[takes]].pop()
            1. If `take` is object & `take.timeout.pending` is `true`,
               repeat from previous step.
            1. If `take` is an object,
               1. Set `take.timeout.pending` to `false`.
               1. Fulfill `take.promise` with `data`.
               1. Set `put.timeout.pending` to `false`.
               1. Fulfill `put.promise` with `true`.
            1. If `take` is not an object,
               1. If `port.[[buffer]]` does not implement `Buffer` interface
                  or `port.[[buffer]].isFull()` is `true`.
                  1. Then queue `put` by calling:
                     `port.[[puts]].unshift(put)`.

               1. If `port.[[buffer]]` implements `Buffer` interface or
                  or `port.[[buffer]].isFull()` is `false`,
                  1. Set `put.timeout.value` to `false`.
                  1. Fulfill `put.promise` with `true`
                  1. Add `put.data` to the buffer by calling:
                     `port.[[buffer]].put(put.data)`
1. Return `promise`


##### [[take]](port, timeout)

1. If `port` isn't instance of `InputPort` throw `TypeError`.
1. Let `promise` be a newly-created pending promise.
1. Let `take` be `{ timeout, promise }`.
1. If `timeout.pending` is `true`,
   1. If `port.[[buffer]]` implements `Buffer` intreface and
      `port.[[buffer]].isEmpty()` returns `false`,
      1. Set `timeout.pending` to `false`.
      1. Fulfill `promise` with `port.[[buffer]].take()`.
      1. If `port.[[buffer]].isFull()` is `false`,
         1. Let `put` be a `port.[[puts]].pop()`.
         1. If `put` is not `undefined`
            1. If `put.timeout.pending` is `true`,
               1. Set `put.timeout.pending` to `false`,
               1. Fulfill `put.promise` with `true`,
               1. Add `put.data` into buffer, by calling:
                  `put.[[buffer]].put(put.data)`
            1. If `put.timeout.pending` is `false`,
               repeat form "Let `put` be a `port.[[puts]].pop()`".
  1. If `port.[[buffer]]` does not implements `Buffer` interface,
     or `port.[[buffer]].isEmpty()` returns `true`,
     1. Let `put` be `puts.pop()`
     1. If `put` is an object and `put.timeout.pending` is `false`,
        Repeat from previous step.
     1. If `put` is an `object`,
        1. Set `put.timeout.value` to `false`.
        1. Fulfill `put.promise` to `true`.
        1. Set `take.timeout.value` to `false`
        1. Fulfill `take.promise` to `put.data`
     1. If `put` isnt an `object`
        1. If `port.[[closed]].value` is `true`
           1. Set `take.timeout.value` to `false`
            1. Fulfill `take.promise` to `void 0`
        1. If `port.[[closed]].value` is `false`,
           enqueue `take` by invoking:
           `port.[[takes]].unshift(take)`
1. Return `promise`
