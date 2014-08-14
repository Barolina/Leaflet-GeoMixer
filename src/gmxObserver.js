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
            filters: {}                     // hash filters
        }
    */
    var type = options.type || 'update',
        _this = this,
        items = {},
        callback = function() {
            var geoItems = dataManager.getItems(_this.id),
                len = geoItems.length,
                out = {};
            if (type === 'update') {
                var addedFlag = false,
                    added = {};
                for (var i = 0; i < len; i++) {
                    var it = geoItems[i],
                        prop = it.arr,
                        id = prop[0];
                    if (!items[id]) {
                        items[id] = it;
                        added[id] = prop;
                        addedFlag = true;
                    }
                }
                len = 0;
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
                    } else {
                        len++;
                    }
                }
                if (!addedFlag && !removedFlag) return;
                if (addedFlag) out.added = added;
                if (removedFlag) out.removed = removed;
            } else {
                out.added = geoItems;
            }
            out.count = len;
            options.callback(out);
        };

    this.bbox = options.bbox;
    if (!this.bbox) {
        var w = gmxAPIutils.worldWidthMerc;
        this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
    }
    
    this.active = true;

    this.callback = callback;
    this.type = type;
    this.setBounds = function(bounds) {
        this.bbox = bounds;
        this.active = true;
        //console.log('setBounds', _this.active, this);
        this.callback();
        return this;
    };

    this.filters = options.filters || null;
    this.setDateInterval = function(beginDate, endDate) {
        if (!this.filters) this.filters = {};
        var beginValue = beginDate.valueOf(),
            endValue = endDate.valueOf();
        this.dateInterval = {
            beginDate: beginDate,
            endDate: endDate
        };
        this.filters.TemporalFilter = function(item) {
            var unixTimeStamp = item.options.unixTimeStamp;
            return unixTimeStamp >= beginValue && unixTimeStamp <= endValue;
        };
        this.active = true;
        //console.log('setDateInterval', beginDate, endDate);
        dataManager.chkMaxDateInterval();
        return this;
    };

    this.setFilter = function (func) {
        if (!this.filters) this.filters = {};
        this.filters.userFilter = func;
        return this;
    };

    this.removeFilter = function () {
        if (this.filters) delete this.filters.userFilter;
        return this;
    };
    
}