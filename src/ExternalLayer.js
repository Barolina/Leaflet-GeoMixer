L.gmx.ExternalLayer = L.Class.extend({
    createExternalLayer: function () {          // extend: must return <ILayer> or null
        return null;
    },

    isExternalVisible: function (/*zoom*/) {    // extend: return true if on this zoom external Layer must be visible
        return true;
    },

    updateData: function (/*data*/) {           // extend: for data update
    },

    options: {
        observerOptions: {
            filters: ['clipFilter', 'userFilter', 'clipPointsFilter']
        }
    },

    initialize: function (options, layer) {
        this._layer = layer;
        this.indexes = this._layer._gmx.tileAttributeIndexes;
        L.setOptions(this, options);
        this._layer
            .on('add', this.addEvent, this)
            .on('dateIntervalChanged', this.setDateInterval, this);

        this._addObserver(this.options.observerOptions);

        this.extLayer = this.createExternalLayer();

        if (this._layer._map) {
            this.addEvent({target:{_map: this._layer._map}});
            this._updateBbox();
        }
    },

    _addObserver: function (opt) {
        this._items = {};
        this._observer = this._layer.addObserver(
            L.extend({
                bbox: gmxAPIutils.bounds([[Number.MAX_VALUE, Number.MAX_VALUE]]),
                callback: L.bind(this.updateData, this)
            }, opt)
        ).deactivate();
    },

    unbindLayer: function () {
        this._layer
            .off('add', this.addEvent, this)
            .off('dateIntervalChanged', this.setDateInterval, this);

        var map = this._map || this._layer._map;
        this._onRemove(!map);
    },

    _addMapHandlers: function (map) {
        this._map = map;
        this._map.on({
            moveend: this._updateBbox,
            zoomend: this._zoomend,
            layeradd: this._layeradd,
            layerremove: this._layerremove
        }, this);
    },

    _removeMapHandlers: function () {
        this._map.off({
            moveend: this._updateBbox,
            zoomend: this._zoomend,
            layeradd: this._layeradd,
            layerremove: this._layerremove
        }, this);
        this._map = null;
    },

    addEvent: function (ev) {
        this._addMapHandlers(ev.target._map);
        this._updateBbox();
        this._chkZoom();
    },

    _layeradd: function (ev) {
        var layer = ev.layer;
        if (layer._gmx && layer._gmx.layerID === this._layer.options.layerID) {
            this._chkZoom();
        }
    },

    _layerremove: function (ev) {
        var layer = ev.layer;
        if (layer._gmx && layer._gmx.layerID === this._layer.options.layerID) {
            this._onRemove(true);
            this._removeMapHandlers();
        }
    },

    _onRemove: function (fromMapFlag) {    // remove external layer from parent layer
        if (this._observer) {
            this._observer.deactivate();
        }
        var map = this._map;
        if (map) {
            if (map.hasLayer(this.extLayer)) {
                this._zoomend();
                map.removeLayer(this.extLayer);
            }
            if (!fromMapFlag) {
                this._layer.onAdd(map);
            }
        }
    },

    _zoomend: function () {
        if (this._popup && this._popup._map) {
            this._popup._map.removeLayer(this._popup);
        }
        this._chkZoom();
    },

    _chkZoom: function () {
        if (!this._map) { return; }

        var layer = this._layer,
            observer = this._observer,
            map = this._map,
            isExtLayerOnMap = map.hasLayer(this.extLayer);

        if (!this.isExternalVisible(map.getZoom())) {
            if (observer) { observer.deactivate(); }
            if (!layer._map) {
                if (isExtLayerOnMap) {
                    map.removeLayer(this.extLayer);
                }
                layer.onAdd(map);
            }
            layer.enablePopup();
        } else if (layer._map) {
            layer.onRemove(map);
            if (!isExtLayerOnMap) {
                map.addLayer(this.extLayer);
            }
            if (observer) {
                this.setDateInterval();
                observer.activate();
            }
            layer.disablePopup();
        }
    },

    setDateInterval: function () {
        if (this._observer) {
            var gmx = this._layer._gmx;
            this._observer.setDateInterval(gmx.beginDate, gmx.endDate);
        }
    },

    _updateBbox: function () {
        if (!this._map || !this._observer) { return; }

        var screenBounds = this._map.getBounds(),
            p1 = screenBounds.getNorthWest(),
            p2 = screenBounds.getSouthEast(),
            bbox = L.gmxUtil.bounds([[p1.lng, p1.lat], [p2.lng, p2.lat]]);
        this._observer.setBounds(bbox);
    }
});
