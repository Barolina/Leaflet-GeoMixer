//Single observer with vector data
var Observer = L.Class.extend({
    includes: L.Mixin.Events,
    /* options : {
            type: 'resend | update',     // `resend` - send all data (like screen tile observer)
                                         // `update` - send only changed data
            callback: Func,              // will be called when layer's data for this observer is changed
            dateInterval: [dateBegin,dateEnd], // temporal interval
            bbox: bbox,                  // bbox to observe
            filters: [String]            // filter keys array
        }
    */
    initialize: function(options) {
        this.type = options.type || 'update';
        this._callback = options.callback;
        this._items = {};
        this.bbox = options.bbox;      // set bbox by Mercator bounds
        this.filters = options.filters || [];
        this.active = true;

        if (options.bounds) {   // set bbox by LatLngBounds
            this.setBounds(options.bounds);
        }

        if (!this.bbox) {
            var w = gmxAPIutils.worldWidthMerc;
            this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
            this.world = true;
        }

        if (options.dateInterval) {
            this._setDateInterval(options.dateInterval[0], options.dateInterval[1]);
        }
    },

    activate: function() {
        if (!this.active) {
            this.active = true;
            this.fire('activate');
        }
        return this;
    },

    deactivate: function() {
        if (this.active) {
            this.active = false;
            this.fire('activate');
        }
        return this;
    },

    toggleActive: function(isActive) {
        return isActive ? this.activate() : this.deactivate();
    },

    isActive: function() {
        return this.active;
    },

    updateData: function(data) {
        var len = data.length,
            out = {count: len};

        if (this.type === 'update') {
            //calculate difference with previous data
            var prevItems = this._items,
                newItems = {},
                addedFlag = false,
                removedFlag = false,
                added = [],
                removed = [],
                id;

            for (var i = 0; i < len; i++) {
                var it = data[i];

                id = it.properties[0];
                newItems[id] = it;

                if (!prevItems[id]) {
                    added.push(it);
                    addedFlag = true;
                }
            }

            for (id in prevItems) {
                if (!newItems[id]) {
                    removed.push(prevItems[id]);
                    removedFlag = true;
                }
            }

            if (addedFlag) {
                out.added = added;
            }
            if (removedFlag) {
                out.removed = removed;
            }

            this._items = newItems;

        } else {
            out.added = data;
        }
        this._callback(out);

        return this;
    },

    removeData: function(keys) {
        if (this.type !== 'update') {
            return this;
        }

        var items = this._items,
            removed = [];

        for (var id in keys) {
            if (items[id]) {
                removed.push(items[id]);
                delete items[id];
            }
        }

        if (removed.length) {
            this._callback({removed: removed});
        }

        return this;
    },

    /*setFilter: function (func) {
        this._filters.userFilter = func;
        this.fire('update');
        return this;
    },

    removeFilter: function () {
        delete this._filters.userFilter;
        this.fire('update');
        return this;
    },*/

    setBounds: function(bounds) {
        var min = bounds.min,
            max = bounds.max;
        if (!min || !max) {
            var latLngBounds = L.latLngBounds(bounds),
                sw = latLngBounds.getSouthWest(),
                ne = latLngBounds.getNorthEast();
            min = {x: sw.lng, y: sw.lat};
            max = {x: ne.lng, y: ne.lat};
        }
        var minX = min.x, maxX = max.x,
            minY = min.y, maxY = max.y,
            w = (maxX - minX) / 2,
            minX1 = null,
            maxX1 = null;

        this.world = false;
        if (w >= 180) {
            minX = -180; maxX = 180;
            this.world = true;
        } else if (maxX > 180 || minX < -180) {
            var center = ((maxX + minX) / 2) % 360;
            if (center > 180) { center -= 360; }
            else if (center < -180) { center += 360; }
            minX = center - w; maxX = center + w;
            if (minX < -180) {
                minX1 = minX + 360; maxX1 = 180; minX = -180;
            } else if (maxX > 180) {
                minX1 = -180; maxX1 = maxX - 360; maxX = 180;
            }
        }
        var m1 = L.Projection.Mercator.project(L.latLng(minY, minX)),
            m2 = L.Projection.Mercator.project(L.latLng(maxY, maxX));

        this.bbox = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
        this.bbox1 = null;
        if (minX1) {
            m1 = L.Projection.Mercator.project(L.latLng(minY, minX1));
            m2 = L.Projection.Mercator.project(L.latLng(maxY, maxX1));
            this.bbox1 = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
        }

        this.fire('update');
        return this;
    },

    intersects: function(bounds) {
        return this.world || this.bbox.intersects(bounds) || !!(this.bbox1 && this.bbox1.intersects(bounds));
    },

    _setDateInterval: function(beginDate, endDate) {
        if (beginDate && endDate) {
            // var beginValue = beginDate.valueOf(),
                // endValue = endDate.valueOf();
            this.dateInterval = {
                beginDate: beginDate,
                endDate: endDate
            };
        } else {
            this.dateInterval = null;
        }
    },

    setDateInterval: function(beginDate, endDate) {
        this._setDateInterval(beginDate, endDate);
        this.fire('update', {temporalFilter: true});
        return this;
    }
});
