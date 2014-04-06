var gmxImageLoader = {
    maxCount: 20						// макс.кол. запросов
    ,curCount: 0						// номер текущего запроса
    ,timer: null						// таймер
    ,items: []						// массив текущих запросов
    ,itemsHash: {}						// Хэш по image.src
    ,itemsCache: {}					// Кэш загруженных image по image.src
    ,emptyImageUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    ,parseSVG: function(item, str)	{		// парсинг SVG файла
		var out = {};
		var xml = gmxAPIutils.parseXML(str);
		
		var svg = xml.getElementsByTagName("svg");
		out.width = parseFloat(svg[0].getAttribute("width"));
		out.height = parseFloat(svg[0].getAttribute("height"));
		
		var polygons = svg[0].getElementsByTagName("polygon");
		var poly = [];
		for (var i = 0; i < polygons.length; i++)
		{
			var pt = {};
			var it = polygons[i];
			var hexString = it.getAttribute("fill"); hexString = hexString.replace(/^#/, '');
			pt.fill = parseInt(hexString, 16);
			pt.fill_rgba = gmxAPIutils.dec2rgba(pt.fill, 1);
			
			pt['stroke-width'] = parseFloat(it.getAttribute("stroke-width"));
			var points = it.getAttribute("points");
			if(points) {
				var arr = [];
				var pp = points.split(' ');
				for (var j = 0; j < pp.length; j++)
				{
					var t = pp[j];
					var xy = t.split(',');
					arr.push({'x': parseFloat(xy[0]), 'y': parseFloat(xy[1])});
				}
				if(arr.length) arr.push(arr[0]);
			}
			pt.points = arr;
			poly.push(pt);
		}
		out.polygons = poly;
		return out;
	},
    removeItemsByZoom: function(zoom)	{	// остановить и удалить из очереди запросы по zoom
        for (var key in this.itemsCache)
        {
            var q = this.itemsCache[key][0];
            if('zoom' in q && q.zoom != zoom && q.loaderObj) {
                q.loaderObj.src = this.emptyImageUrl;
            }
        }
        var arr = [];
        for (var i = 0, len = this.items.length; i < len; i++)
        {
            var q = this.items[i];
            if(!q.zoom || q.zoom === zoom) {
                arr.push(q);
            }
        }
        this.items = arr;
        return this.items.length;
    },
    callCacheItems: function(item) {		// загрузка item завершена
        if(this.itemsCache[item.src]) {
            var arr = this.itemsCache[item.src];
            var first = arr[0];
            for (var i = 0, len = arr.length; i < len; i++)
            {
                var it = arr[i];
                if(first.isError) {
                    if(it.onerror) it.onerror(item.src);
                } else if(first.imageObj) {
                    if(it.callback) it.callback(first.imageObj);
                } else if(first.svgPattern) {
                    if(it.callback) it.callback(first.svgPattern, true);
                }
            }
            delete this.itemsCache[item.src];
        }
        this.nextLoad();
    },
    nextLoad: function() {			// загрузка следующего
        if(this.curCount > this.maxCount) return;
        if(this.items.length < 1) {
            this.curCount = 0;
            if(this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            return false;
        }
        var item = this.items.shift();

        if(this.itemsCache[item.src]) {
            var pitem = this.itemsCache[item.src][0];
            if(pitem.isError) {
                if(item.onerror) item.onerror(null);
            } else if(pitem.imageObj) {
                if(item.callback) item.callback(pitem.imageObj);
            } else {
                this.itemsCache[item.src].push(item);
            }
        } else {
            this.itemsCache[item.src] = [item];
            this.setImage(item);
        }
    },
    setImage: function(item) {			// загрузка image
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
    chkTimer: function() {			// установка таймера
        var _this = this;
        if(!this.timer) {
            this.timer = setInterval(function() {
                _this.nextLoad();
            }, 50);
        }
    },
    push: function(item)	{			// добавить запрос в конец очереди
        this.items.push(item);
        this.chkTimer();
        return this.items.length;
    },
    unshift: function(item)	{		// добавить запрос в начало очереди
        this.items.unshift(item);
        this.chkTimer();
        return this.items.length;
    },
    getCounts: function()	{		// получить размер очереди + колич.выполняющихся запросов
        return this.items.length + (this.curCount > 0 ? this.curCount : 0);
    }
}