var gmxDeferred = function() {
    var resolveCallbacks = [],
        rejectCallbacks = [],
        isFulfilled = false,
        isResolved = false;
    
    this.resolve = function(data) {
        if (isFulfilled) {
            return;
        }
        isFulfilled = true;
        isResolved = true;
        resolveCallbacks.forEach(function(callback) { callback(data); });
        resolveCallbacks = rejectCallbacks = [];
    }
    
    this.reject = function(data) {
        if (isFulfilled) {
            return;
        }
        isFulfilled = true;
        isResolved = false;
        rejectCallbacks.forEach(function(callback) { callback(data); });
        resolveCallbacks = rejectCallbacks = [];
    }
    
    this.done = function(resolveCallback, rejectCallback) {
        if (isFulfilled) {
            if (isResolved) {
                resolveCallback && resolveCallback();
            } else {
                rejectCallback && rejectCallback();
            }
        } else {
            resolveCallback && resolveCallbacks.push(resolveCallback);
            rejectCallback && rejectCallbacks.push(rejectCallback);
        }
    }
}