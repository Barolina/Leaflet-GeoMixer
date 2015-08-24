(function() {

var ImageRequest = function(id, url, options) {
    this._id = id;
    this.def = new L.gmx.Deferred(L.gmx.imageLoader._cancelRequest.bind(L.gmx.imageLoader, this));
    this.url = url;
    this.options = options || {};
};

var GmxImageLoader = L.Class.extend({
    includes: L.Mixin.Events,
    statics: {
        MAX_COUNT: 20, // max number of parallel requests
        EMPTY_IMAGE_URL: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    },
    
    initialize: function() {
        this.curCount = 0;        // number of currently processing requests (number of items in "inProgress")
        this.requests = [];       // not yet processed image requests
        this.inProgress = {};     // hash of in progress image loadings
        this.uniqueID = 0;
    },
    
    _imageLoaded: function(url, image) {
        if (url in this.inProgress) {
            var requests = this.inProgress[url].requests;
            for (var k = 0; k < requests.length; k++) {
                var def = requests[k].def;
                image ? def.resolve(image) : def.reject();
                this.fire('requestdone', {request: requests[k]});
            }
            --this.curCount;
            delete this.inProgress[url];
        }
        L.gmxUtil.loaderStatus(url, true);
        this.fire('imageloaded', {url: url});
        this._nextLoad();
    },

    _nextLoad: function() {  // загрузка следующего
        if (this.curCount >= GmxImageLoader.MAX_COUNT || !this.requests.length) {
            return;
        }

        var request = this.requests.shift(),
            url = request.url;

        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            var requests = [request];
            this.inProgress[url] = {requests: requests};
            ++this.curCount;

            for (var k = this.requests.length - 1; k >= 0; k--) {
                if (this.requests[k].url === url) {
                    requests.push(this.requests[k]);
                    this.requests.splice(k, 1);
                }
            }

            var image = this._loadImage(request);
            if (!image.width) {
                L.gmxUtil.loaderStatus(url);
            }

            //theoretically image loading can be synchronous operation
            if (this.inProgress[url]) {
                this.inProgress[url].image = image;
            }
        }
    },

    _loadImage: function(request) {
        var imageObj = new Image(),
            url = request.url,
            _this = this;

        if (request.options.crossOrigin) {
            imageObj.crossOrigin = request.options.crossOrigin;
        }

        imageObj.onload = this._imageLoaded.bind(this, url, imageObj);
        imageObj.onerror = function() {
            _this._imageLoaded(url);
        };
        imageObj.src = url;
        
        this.fire('imageloadstart', {url: url});
        
        return imageObj;
    },

    _cancelRequest: function(request) {
        var id = request._id,
            i = 0;
        if (request.url in this.inProgress) {
            var loadingImg = this.inProgress[request.url];
            if (loadingImg.requests.length === 1 && loadingImg.requests[0]._id === id) {
                --this.curCount;
                delete this.inProgress[request.url];
                loadingImg.image = GmxImageLoader.EMPTY_IMAGE_URL;
                this.fire('imageloaded', {url: request.url});
                this._nextLoad();
            } else {
                for (i = 0; i < loadingImg.requests.length; i++) {
                    if (loadingImg.requests[i].id === id) {
                        loadingImg.requests.splice(i, 1);
                        break;
                    }
                }
            }
        } else {
            for (i = 0; i < this.requests.length; i++) {
                if (this.requests[i].id === id) {
                    this.requests.splice(i, 1);
                    break;
                }
            }
        }
        
        this.fire('requestdone', {request: request});
    },
    
    _add: function(atBegin, url, options) {
        var id = 'id' + (++this.uniqueID);
        var request = new ImageRequest(id, url, options);
        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            atBegin ? this.requests.unshift(request) : this.requests.push(request);
            this._nextLoad();
        }
        
        this.fire('request', {request: request});
        
        return request.def;
    },

    clearLayer: function(layerID) {  // remove all the items for a given layer ID
        var requestsToCancel = [],
            i = 0;
        for (var iP in this.inProgress) {
            var requests = this.inProgress[iP].requests;
            for (i = 0; i < requests.length; i++) {
                if (requests[i].options.layerID === layerID) {
                    requestsToCancel.push(requests[i]);
                }
            }
        }

        for (i = 0; i < this.requests.length; i++) {
            if (this.requests[i].options.layerID === layerID) {
                requestsToCancel.push(this.requests[i]);
            }
        }

        requestsToCancel.forEach(this._cancelRequest.bind(this));
    },

    push: function(url, options) {  // добавить запрос в конец очереди
        return this._add(false, url, options);
    },

    unshift: function(url, options) {   // добавить запрос в начало очереди
        return this._add(true, url, options);
    }
});

L.gmx.imageLoader = new GmxImageLoader();

})();