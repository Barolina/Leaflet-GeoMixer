var gmxImageLoader = {
    maxCount: 20        // макс.кол. запросов
    ,curCount: 0        // номер текущего запроса
    ,items: []          // массив текущих запросов
    ,itemsCache: {}     // Кэш загруженных image по image.src
    ,emptyImageUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    ,
    _callCacheItems: function(item) {
        if(this.itemsCache[item.src]) {
            var arr = this.itemsCache[item.src],
                res = item.isError || item.imageObj.src === this.emptyImageUrl ? null : item.imageObj;
           
            arr.forEach(function(it) {
                if(item.isError) {
                    if(it.onerror) it.onerror(item.src);
                } else {
                    if(it.callback) it.callback(res);
                }
            });
            item.imageObj = null;
            delete this.itemsCache[item.src];
        }
        this._nextLoad();
    },
    _nextLoad: function() {  // загрузка следующего
        if (this.curCount > this.maxCount) return;
        if (this.items.length < 1) {
            this.curCount = 0;
            return;
        }
        var item = this.items.shift(),
            src = item.src;

        if(this.itemsCache[src]) {
            this.itemsCache[src].push(item);
        } else {
            this.itemsCache[src] = [item];
            this._setImage(item);
        }
    },
    _setImage: function(item) {  // загрузка image
        var _this = this;
        var imageObj = new Image();
        item.loaderObj = imageObj;
        if(item.crossOrigin) imageObj.crossOrigin = item.crossOrigin;
        imageObj.onload = function() {
            _this.curCount--;
            item.imageObj = imageObj;
            delete item.loaderObj;
			if (L.Browser.ie) setTimeout(function() { _this._callCacheItems(item); } , 0); //IE9 bug - black tiles appear randomly if call setPattern() without timeout
            else _this._callCacheItems(item);
        };
        imageObj.onerror = function() {
            _this.curCount--;
            item.isError = true;
            _this._callCacheItems(item);
        };
        this.curCount++;
        imageObj.src = item.src;
    },

    clearLayer: function(id) {  // Удалить все запросы по слою id
        for (var key in this.itemsCache) {
            var item = this.itemsCache[key][0];
            if(item.layerID == id) {
                if(item.loaderObj) {
                    item.loaderObj.src = this.emptyImageUrl;
                    this.curCount--;
                }
            }
        }
        var arr = [];
        this.items.forEach(function(item) {
            if(item.layerID != id) arr.push(item);
        });
        this.items = arr;
        return this.items.length;
    },

    push: function(item) {  // добавить запрос в конец очереди
        this.items.push(item);
        this._nextLoad();
        return this.items.length;
    },
    unshift: function(item) {   // добавить запрос в начало очереди
        this.items.unshift(item);
        this._nextLoad();
        return this.items.length;
    },
    getCounts: function() { // получить размер очереди + колич.выполняющихся запросов
        return this.items.length + (this.curCount > 0 ? this.curCount : 0);
    }
}