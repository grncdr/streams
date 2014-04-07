# Channel API

## Where Did All the Text Go?

We are in the process of transitioning this specification from a GitHub README into something a bit more palatable. The official-lookin' version is developed in the `official-lookin` branch's `index.html` file, which you can see [on GitHub](https://github.com/whatwg/streams/blob/official-lookin/index.html), or in its rendered glory at [this long URL](http://anolis.hoppipolla.co.uk/aquarium.py/output?uri=http%3A%2F%2Frawgithub.com%2Fwhatwg%2Fstreams%2Fofficial-lookin%2Findex.html&process_filter=on&process_toc=on&process_xref=on&process_sub=on&process_annotate=on&filter=&annotation=&newline_char=LF&tab_char=SPACE&min_depth=2&max_depth=6&w3c_compat_xref_a_placement=on&parser=lxml.html&serializer=html5lib&output_encoding=ascii).

Right now, we've transferred over most of the concepts and text, but none of the algorithms or APIs. We'll be iterating on the APIs a bit more here, in Markdown format, until we feel confident in them. In the meantime, please check out the rendered spec for all of the interesting stage-setting text.

By the way, this transition is being tracked as [#62](https://github.com/whatwg/streams/issues/62).

## Channel APIs


```idl
interface InputPort {
  // If this channel is closed operation is ignored and
  // promise resolved with `undefined` is returned
  // (Promise.resolve(void 0)).

  // If `value` is `undefined` it is ignored same as in JSON.

  // If this channel has number of queued values (that were
  // already put but have not being taken yet) that is less
  // than it's `size` value is enqueued and promise resolved
  // with `true` is returned (Promise.resolve(true)).

  // If this channel has `n` number of queued values that is
  // equal or greater than it's size, value is enqued and promise
  // is returned that is resolved with `true` once `n - size`
  // "take"s on this channel occur.
  Promise <boolean> put(any value);
}

interface OutputPort {
  // If this channel has no queued "puts" and has being
  // already closed returns promise resolved with `undefined`.
  //
  // If this channel has no queued "puts" then
  // "take" is enqueued and promise is returned that
  // will resolve to a value that will be "put" first.
  //
  // If this channel has queued "puts" then dequeus
  // value that was "put" first and returns promise
  // resolved with that value.
  Promise <any> take();
}

interface Channel {
  // Number of items that can be synchronously queued
  // on this channel (For more details see put)
  readonly attribute number size;
  // Closes this channel. Note that queued values can
  // still be taken off the closed channel but enqueud.
  void close();
}
Channel implements InputPort
Channel implements OutputPort;
// Enables passing channels across frames and workers.
Channel implements Transferable;
```


#### Properties of the Channel prototype

##### constructor(size)

The constructor is passed a number that will represent
size of the constructed channel. Size of the channel
is number of values that can be queued without blocking.

Note: Blocking in this context isn't used in a thread
blocking sence, it just implies that resolution of followup
puts will be queued until values are taken off the queue.

Choosing a right channel size for the task can maximize
througput between producer and consumer by balancing
their speed.


1. Set `this.[[size]]` to `size`.
1. Set `this.[[isClosed]]` to `false`.
1. Set `this.[[buffer]]` to `[]`.
1. Set `this.[[takeQueue]]` to `[]`.
1. Set `this.[[putQueue]]` to `[]`.

##### get size

1. Return `this.[[size]]`.

##### put(value)

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


##### take()

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

##### close()

1. Set `this.[[isClosed]]` to `true`.
1. If `this.[[takeQueue]].length > 0`,
   1. Let `pendingTake` be `this.[[takeQueue]][0]`.
   1. Shift `pendingTake` from `this.[[takeQueue]]`:
      `this.[[takeQueue]].shift()`.
   1. Run Promise Resolution Procedure
      `[[Resolve]](pendingTake, void 0).
   1. Re-run close `this.close()`.
