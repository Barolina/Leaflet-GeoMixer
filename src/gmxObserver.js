//Single observer with vector data
var gmxObserver = L.Class.extend({
	includes: L.Mixin.Events,
    initialize: function(options) {
        var _this = this,
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
            type = options.type || 'update',
            items = {},
            callback = function(data) {
                var len = data.length,
                    out = {};
                if (type === 'update') {
                    var addedFlag = false,
                        added = {};
                    for (var i = 0; i < len; i++) {
                        var it = data[i],
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
                    out.added = data;
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

        this.filters = options.filters || null;
    },    

    setFilter: function (func) {
        if (!this.filters) this.filters = {};
        this.filters.userFilter = func;
        this.fire('update');
        return this;
    },

    removeFilter: function () {
        if (this.filters) delete this.filters.userFilter;
        this.fire('update');
        return this;
    },

    setBounds: function(bounds) {
        this.bbox = bounds;
        this.active = true;
        this.fire('update');
        return this;
    },

    setDateInterval: function(beginDate, endDate) {
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
        this.fire('update', {temporalFilter: true});
        return this;
    }
});