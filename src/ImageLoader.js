var gmxImageLoader = {
    maxCount: 20        // макс.кол. запросов
    ,curCount: 0        // номер текущего запроса
    ,items: []          // массив текущих запросов
    ,itemsCache: {}     // Кэш загруженных image по image.src
    ,emptyImageUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    ,parseSVG: function(item, str) {    // парсинг SVG файла
        var xml = gmxAPIutils.parseXML(str),
            svg = xml.getElementsByTagName("svg"),
            polygons = svg[0].getElementsByTagName("polygon"),
            poly = [];
        polygons.forEach(function(it) {
            var arr = [],
                points = it.getAttribute("points"),
                fill = parseInt(hexString, it.getAttribute("fill").replace(/^#/, ''), 16);
            if(points) {
                var pp = points.split(' ');
                pp.forEach(function(str) {
                    var xy = str.split(',');
                    arr.push({x: parseFloat(xy[0]), y: parseFloat(xy[1])});
                });
                if(arr.length) arr.push(arr[0]);
            }
            poly.push({
                points: arr,
                fill: fill,
                fill_rgba: gmxAPIutils.dec2rgba(fill, 1),
                'stroke-width': parseFloat(it.getAttribute("stroke-width"))
            });
        });
        return {
            width: parseFloat(svg[0].getAttribute("width")),
            height: parseFloat(svg[0].getAttribute("height")),
            polygons: poly
        };
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
    callCacheItems: function(item) {    // загрузка item завершена
        if(this.itemsCache[item.src]) {
            var arr = this.itemsCache[item.src],
                res = item.isError || item.imageObj.src === this.emptyImageUrl ? null : item.imageObj;
           
            arr.forEach(function(it) {
                if(item.isError) {
                    if(it.onerror) it.onerror(item.src);
                } else if(item.svgPattern) {
                    if(it.callback) it.callback(item.svgPattern, true);
                } else {
                    if(it.callback) it.callback(res);
                }
            });
            item.imageObj = null;
            delete this.itemsCache[item.src];
        }
        this.nextLoad();
    },
    nextLoad: function() {  // загрузка следующего
        if (this.curCount > this.maxCount) return;
        if (this.items.length < 1) {
            this.curCount = 0;
            return false;
        }
        var item = this.items.shift(),
            src = item.src;

        if(this.itemsCache[src]) {
            this.itemsCache[src].push(item);
        } else {
            this.itemsCache[src] = [item];
            this.setImage(item);
        }
    },
    setImage: function(item) {  // загрузка image
        var _this = this;
        if(item.src.match(/\.svg$/)) {
            gmxAPIutils.request({
                url: item.src,
                callback: function(ph) {
                    item.svgPattern = _this.parseSVG(item, ph);
                    _this.callCacheItems(item);
                }
            });
            return;
        }
        var imageObj = new Image();
        item.loaderObj = imageObj;
        if(item.crossOrigin) imageObj.crossOrigin = item.crossOrigin;
        imageObj.onload = function() {
            _this.curCount--;
            item.imageObj = imageObj;
            delete item.loaderObj;
            _this.callCacheItems(item);
        };
        imageObj.onerror = function() {
            _this.curCount--;
            item.isError = true;
            _this.callCacheItems(item);
        };
        this.curCount++;
        imageObj.src = item.src;
    },

    push: function(item) {  // добавить запрос в конец очереди
        this.items.push(item);
        this.nextLoad();
        return this.items.length;
    },
    unshift: function(item) {   // добавить запрос в начало очереди
        this.items.unshift(item);
        this.nextLoad();
        return this.items.length;
    },
    getCounts: function() { // получить размер очереди + колич.выполняющихся запросов
        return this.items.length + (this.curCount > 0 ? this.curCount : 0);
    }
}