"use strict";

function spawn(routine) {
  return new Promise(function(resolve, reject) {
    var task = routine();
    var raise = function(error) {
      task.throw(error)
    }
    var next = function(data) {
      var step = task.next(data)
      if (step.done)
        resolve(step.value)
      else
        Promise.cast(step.value).then(next, raise)
    }
    next()
  })
}
exports.spawn = spawn
