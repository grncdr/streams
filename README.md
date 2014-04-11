# Channel API

## Where Did All the Text Go?

We are in the process of transitioning this specification from a GitHub README into something a bit more palatable. The official-lookin' version is developed in the `official-lookin` branch's `index.html` file, which you can see [on GitHub](https://github.com/whatwg/streams/blob/official-lookin/index.html), or in its rendered glory at [this long URL](http://anolis.hoppipolla.co.uk/aquarium.py/output?uri=http%3A%2F%2Frawgithub.com%2Fwhatwg%2Fstreams%2Fofficial-lookin%2Findex.html&process_filter=on&process_toc=on&process_xref=on&process_sub=on&process_annotate=on&filter=&annotation=&newline_char=LF&tab_char=SPACE&min_depth=2&max_depth=6&w3c_compat_xref_a_placement=on&parser=lxml.html&serializer=html5lib&output_encoding=ascii).

Right now, we've transferred over most of the concepts and text, but none of the algorithms or APIs. We'll be iterating on the APIs a bit more here, in Markdown format, until we feel confident in them. In the meantime, please check out the rendered spec for all of the interesting stage-setting text.

By the way, this transition is being tracked as [#62](https://github.com/whatwg/streams/issues/62).



## Channel APIs


```idl
// Port interface is implemented by both input and output ports
// of the channel.
interface Port {
  // Closes this channel. Note that queued and bufferred values
  // still can be taken off the closed channel. If there are
  // queued takes on the channel (this implies buffer and put
  // queue is empty) then those takes are resolved with `undefined`.
  void close();
}

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

interface Channel {
  attribute InputPort input;
  attribute OutputPort output;
}
```

## Buffer API


```idl
// Buffer interface is used for buffers that can be passed
// into channels, they allow configurable bufferring of
// the channel based of the data it will be handling.
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
1. Set `this.[[in]]` to
   `new InputPort(buffer, takes, puts, closed)`
1. Set `this.[[out]]` to
   `new OutputPort(buffer, takes, puts, closed)`

#### Properties of the Port prototype

##### constructor(buffer, puts, takes, closed)

1. Set `this.[[buffer]]` to `buffer`.
1. Set `this.[[puts]]` to `puts`.
1. Set `this.[[takes]]` to `takes`.
1. Set `this.[[closed]]` to `closed`.

##### close()

1. If `this.[[closed]].value` is `false`,
  1. Set `this.[[closed]].value` to `true`.
  1. For each `take` in a `this.[[takes]]`
    1. If `take.isPending()` is `true`
    1. Complete `take` operation:
       `take.complete(void 0)`
  1. Set `this.[[takes]]` to `void 0`.


#### Properties of the OutputPort prototype

##### constructor(buffer, takes, puts, closed)

1. Apply `this` and all passed arguments no `Port`:
   `Port.apply(this, [buffer, takes, puts, closed])`

#### get [[proto]]

1. Return `Port.prototype`.

##### [[put]](value, timeout)

1. Let `result` be a newly-created pending promise.
1. If `this.[[isClosed]]` is `true` run the Promise Resolution
   Procedure `[[Resolve]](result, void 0)`.
  1. If `this.[[isClosed]]` is `false`,
     1. If `value` is `void 0` run Promise Resolution Procedure
        `[[Resolve]](result, true)`.
     1. If `value !== void 0`,
        1. If `this.[[takeQueue]].length > 0`,
           1. Let `pendingTake` be `this.[[takeQueue]][0]`.
           1. Shift `pendingTake` from `this.[[takeQueue]]`:
             `this.[[takeQueue]].shift()`.
           1. Run Promise Resolution Procedure
              `[[Resolve]](pendingTake, value)`.
           1. Run Promise Resolution Procedure
              `[[Resolve]](result, true)`.
        1. If `this.[[takeQueue]].length` is `0`,
           1. If `this.[[buffer]].length < this.[[size]]`
              1. Push `value` into `this.[[buffer]]`:
                 `this.[[buffer]].push(value)`.
              1. Run Promise Resolution Procedure
                 `[[Resolve]](result, true)`.
           1. If `this.[[buffer]].length` is `this.[[size]]`,
              1. Push `value` into `this.[[putQueue]]`:
                 `this.[[putQueue]].push(value)`.
              1. Push `result` into `this.[[putQueue]]`:
                 `this.[[putQueue]].push(result)`.
1. Return `result`.


#### Properties of the InputPort prototype

##### constructor(buffer, takes, puts, closed)

1. Apply `this` and all passed arguments no `Port`:
   `Port.apply(this, [buffer, takes, puts, closed])`

##### [[take]](timeout)

1. Let `result` be a newly-created pending promise.
1. If `this.[[buffer]].length > 0`,
   1. Let `value` be `this.[[buffer]][0]`
   1. Shift `value` from the `this.[[buffer]]`
      `this.[[buffer]].shift()`
   1. Run Promise Resolution Procedure
      `[[Resolve]](result, value)`.
   1. If `this.[[putQueue]].length > 0`,
      1. Let `queuedValue` be `this.[[putQueue]][0]`
      1. Let `pendingPut` be `this.[[putQueue]][1]`
      1. Shift `queuedValue` from `this.[[putQueue]]`:
         `this.[[putQueue]].shift()`
      1. Shift `pendingPut` from `this.[[putQueue]]`:
         `this.[[putQueue]].shift()`
      1. Push `queuedValue` into `this.[[buffer]]`:
         `this.[[buffer]].push(queuedValue)`.
      1. Run Promise Resolution Procedure
         `[[Resolve]](pendingPut, true)`
1. If `this.[[buffer]].length` is `0`,
   1. If `this.[[isClosed]]` is `true`, run Promise Resolution
      Procedure `[[Resolve]](result, void 0)`.
   1. If `this.[[isClosed]]` is `false`, Push `result` into
      `this[[takeQueue]]`: `this[[takeQueue]].push(result)`.
1. Return `result`.

