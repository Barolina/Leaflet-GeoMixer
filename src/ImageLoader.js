var gmxImageLoader = {
    'maxCount': 32						// ����.���. ��������
    ,'curCount': 0						// ����� �������� �������
    ,'timer': null						// ������
    ,'items': []						// ������ ������� ��������
    ,'itemsHash': {}						// ��� �� image.src
    ,'itemsCache': {}					// ��� ����������� image �� image.src
    ,'emptyImageUrl': 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    ,
    'removeItemsByZoom': function(zoom)	{	// ���������� � ������� �� ������� ������� �� zoom
        for (var key in this.itemsCache)
        {
            var q = this.itemsCache[key][0];
            if('zoom' in q && q['zoom'] != zoom && q['loaderObj']) {
                q['loaderObj'].src = this.emptyImageUrl;
            }
        }
        var arr = [];
        for (var i = 0, len = this.items.length; i < len; i++)
        {
            var q = this.items[i];
            if(!q['zoom'] || q['zoom'] === zoom) {
                arr.push(q);
            }
        }
        this.items = arr;
        return this.items.length;
    }
    ,
    'callCacheItems': function(item) {		// �������� item ���������
        if(this.itemsCache[item.src]) {
            var arr = this.itemsCache[item.src];
            var first = arr[0];
            for (var i = 0, len = arr.length; i < len; i++)
            {
                var it = arr[i];
                if(first.isError) {
                    if(it.onerror) it.onerror(null);
                } else if(first.imageObj) {
                    if(it.callback) it.callback(first.imageObj);
                } else if(first.svgPattern) {
                    if(it.callback) it.callback(first.svgPattern, true);
                }
            }
            delete this.itemsCache[item.src];
        }
        this.nextLoad();
    }
    ,
    'nextLoad': function() {			// �������� ����������
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
    }
    ,
    'setImage': function(item) {			// �������� image
        var _this = this,
            imageObj = new Image();
        item['loaderObj'] = imageObj;
        if(item['crossOrigin']) imageObj.crossOrigin = item['crossOrigin'];
        imageObj.onload = function() {
            _this.curCount--;
            item.imageObj = imageObj;
            delete item['loaderObj'];
            _this.callCacheItems(item);
        };
        imageObj.onerror = function() {
            _this.curCount--;
            item.isError = true;
            _this.callCacheItems(item);
        };
        this.curCount++;
        imageObj.src = item.src;
    }
    ,
    'chkTimer': function() {			// ��������� �������
        var _this = this;
        if(!this.timer) {
            this.timer = setInterval(function() {
                _this.nextLoad();
            }, 50);
        }
    }
    ,
    'push': function(item)	{			// �������� ������ � ����� �������
        this.items.push(item);
        this.chkTimer();
        return this.items.length;
    }
    ,'unshift': function(item)	{		// �������� ������ � ������ �������
        this.items.unshift(item);
        this.chkTimer();
        return this.items.length;
    }
    ,'getCounts': function()	{		// �������� ������ ������� + �����.������������� ��������
        return this.items.length + (this.curCount > 0 ? this.curCount : 0);
    }
}