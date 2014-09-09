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
            _trigger = function(data) {
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
                            added[id] = it;
                            addedFlag = true;
                        }
                    }
                    var removed = {},
                        temporalFilter = _this.filters ? _this.filters.TemporalFilter : null,
                        removedFlag = false;
                    for (var id in items) {
                        var it = items[id],
                            prop = it.arr,
                            bounds = it.dataOption.bounds;
                        if (
                            (temporalFilter && !temporalFilter(it.item))
                         || !_this.intersects(bounds)
                         ) {
                            removed[id] = it;
                            delete items[id];
                            removedFlag = true;
                        }
                    }
                    if (addedFlag) {
                        out.added = [];
                        for (var id in added) {
                            out.added.push(added[id]);
                        }
                    }
                    if (removedFlag) {
                        out.removed = [];
                        for (var id in removed) {
                            out.removed.push(removed[id]);
                        }
                    }
                } else {
                    out.added = data;
                }
                out.count = len;
                options.callback(out);
            };

            this.removeData = function(keys) {
                if (type === 'update') {
                    var removed = [];
                    for (var id in keys) {
                        if (items[id]) {
                            removed.push(items[id]);
                            delete items[id];
                        }
                    }
                    if (removed.length) options.callback({removed: removed});
                }
            }

        this.bbox = options.bbox;
        if (!this.bbox) {
            var w = gmxAPIutils.worldWidthMerc;
            this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
            this.world = true;
        }

        this.active = true;

        this.trigger = _trigger;
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
        var min = bounds.min,
            max = bounds.max,
            minX = min.x, maxX = max.x,
            minY = min.y, maxY = max.y,
            w = (maxX - minX) / 2,
            minX1 = null,
            maxX1 = null;

        this.world = false;
        if (w >= 180) {
            minX = -180, maxX = 180;
            this.world = true;
        } else if (maxX > 180 || minX < -180) {
            var center = ((maxX + minX) / 2) % 360;
            if (center > 180) center -= 360;
            else if (center < -180) center += 360;
            minX = center - w, maxX = center + w;
            if (minX < -180) {
                minX1 = minX + 360, maxX1 = 180, minX = -180;
            } else if (maxX > 180) {
                minX1 = -180, maxX1 = maxX - 360, maxX = 180;
            }
        }
        var m1 = L.Projection.Mercator.project(new L.latLng([minY, minX])),
            m2 = L.Projection.Mercator.project(new L.latLng([maxY, maxX]));

        //var deltaY = 'getDeltaY' in this ? this.getDeltaY() : 0;
        //m1.y += deltaY; m2.y += deltaY;
        //console.log('setBounds', this.id, this.type, deltaY, m1, m2);
        this.bbox = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
        this.bbox1 = null;
        if (minX1) {
            m1 = L.Projection.Mercator.project(new L.latLng([minY, minX1])),
            m2 = L.Projection.Mercator.project(new L.latLng([maxY, maxX1]));
            this.bbox1 = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
        }
        
        this.active = true;
        this.fire('update');
        return this;
    },

    intersects: function(bounds) {
        return this.world || this.bbox.intersects(bounds)
            || (this.bbox1 && this.bbox1.intersects(bounds))
            || false;
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