//Single observer with vector data
var gmxObserver = function(dataManager, options) {
    /* options : {
            type: 'resend | update',    // `resend` - send all data (like screen tile observer)
                                        // `update` - send only changed data
            callback: Func,             // will be called at least once:
                                        // - immediately, if all the data for a given bbox is already loaded
                                        // - after all the data for a given bbox will be loaded
            dateInterval: [date1,date2],    // temporal Interval
            bbox: bbox,                     // static bbox observer
            bboxFunction: bboxFunction,     // dynamic bbox

            zKey: z:x:y,                    // leaflet ID for screen tile observer
            gmxTilePoint: gmxTilePoint,     // Geomixer tile point
            //temporal: Func,             // temporal filter
            //spatial: Func,              // bounds filter
        }
    */
    var type = options.type || 'update',
        _this = this,
        //gmx = layer._gmx,
        //callback = options.callback || null,
        items = {},
        callback = function() {
            var geoItems = dataManager.getItems(_this.id),
                out = {};
            if (type === 'update') {
                if (_this.bboxFunction) _this.bbox = _this.bboxFunction();
            
                var addedFlag = false,
                    added = {};
                for (var i = 0, len = geoItems.length; i < len; i++) {
                    var it = geoItems[i],
                        prop = it.arr,
                        id = prop[0];
                    if (!items[id]) {
                        items[id] = it;
                        added[id] = prop;
                        addedFlag = true;
                    }
                }
                var removed = {},
                    removedFlag = false;
                for (var id in items) {
                    var it = items[id],
                        prop = it.arr,
                        bounds = it.dataOption.bounds;
                    if (!added[id] && !_this.bbox.intersects(bounds)) {
                        removed[id] = prop;
                        delete items[id];
                        removedFlag = true;
                    }
                }
                if (!addedFlag && !removedFlag) return;
                if (addedFlag) out.added = added;
                if (removedFlag) out.removed = removed;
            } else {
                out.added = geoItems;
            }
            options.callback(out);
        };

    this.bbox = options.bbox;
    if (!this.bbox) {
        var w = gmxAPIutils.worldWidthMerc;
        this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
    }
    // if (options.bboxFunction) {
        // this.bboxFunction = options.bboxFunction;
        
        // dataManager.on('moveend', function() {
            // this.active = true;
            // callback();
        // }, this);
    // }
    
    this.dateInterval = options.dateInterval || null;
    this.filters = options.filters || null;
    this.active = true;

    this.gmxTilePoint = options.gmxTilePoint || null;
    this.callback = callback;
    this.type = type;
    this.zKey = options.zKey;
    this.setBounds = function(bounds) {
        _this.bbox = bounds;
        _this.active = true;
console.log('setBounds', _this.active, this);
        _this.callback();
    };
    
}