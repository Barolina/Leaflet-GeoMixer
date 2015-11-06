(function() {
    var GmxHeatMap = L.Class.extend({
        options: {
            minHeatMapZoom: 1,
            maxHeatMapZoom: 6,
            intensityField: '',
            intensityScale: 1
        },

        initialize: function (options, layer) {
            this._layer = layer;
            L.setOptions(this, options);
            var mOptions = L.extend({
        //      minOpacity: 0.05,
        //      maxZoom: 18,
        //      radius: 25,
        //      blur: 15,
        //      max: 1.0
            }, this.options);

            this.markers = L.heatLayer([], mOptions);

            this._addObserver();
            var _this = this;
            this.addEvent = function (ev) {
                GmxHeatMap.prototype.onAdd.call(_this, ev.target._map);
            };

            layer
                .on('add', this.addEvent, this)
                .on('dateIntervalChanged', this.setDateInterval, this);

            if (this._layer._map) {
                this.addEvent({target:{_map: this._layer._map}});
            }
        },

        unbindHeatMap: function () {
            var map = this._map || this._layer._map;
            this._layer
                .off('add', this.addEvent, this)
                .off('dateIntervalChanged', this.setDateInterval, this);
            this.onRemove(!map);
            if (map) {
                map.off({
                    moveend: this._updateBbox,
                    zoomend: this._chkZoom,
                    layeradd: this._layeradd,
                    layerremove: this._layerremove
                }, this);
            }
        },

        // parent layer added to map
        onAdd: function (map) {
           if (!this._map) {
                this._map = map;
                this._map.on({
                    moveend: this._updateBbox,
                    zoomend: this._chkZoom,
                    layeradd: this._layeradd,
                    layerremove: this._layerremove
                }, this);
                this._updateBbox();
            }
            this._chkZoom();
        },

        // remove heatmap from parent layer
        onRemove: function (fromMapFlag) {
            var map = this._map;
            if (this._observer) {
                this._observer.deactivate();
            }
            if (this.markers._map) {
                this.markers._map.removeLayer(this.markers);
                this.markers._map = null;
            }
            if (!fromMapFlag) {
                this._layer.onAdd(map);
            }
            // this._map = null;
        },

        setDateInterval: function () {
            if (this._observer) {
                var gmx = this._layer._gmx;
                this._observer.setDateInterval(gmx.beginDate, gmx.endDate);
            }
        },

        _updateData: function (data) {
            if (data.added) {
                var latlngs = [],
                    indexes = this._layer._gmx.tileAttributeIndexes,
                    altIndex = null,
                    intensityField = this.options.intensityField || '',
                    intensityScale = this.options.intensityScale || 1;

                if (intensityField && intensityField in indexes) {
                    altIndex = indexes[intensityField];
                }
                for (var i = 0, len = data.added.length; i < len; i++) {
                    var it = data.added[i].properties,
                        alt = altIndex !== null ? it[altIndex] : 1,
                        geo = it[it.length - 1],
                        coord = geo.coordinates,
                        point = L.Projection.Mercator.unproject({x: coord[0], y: coord[1]});

                    latlngs.push([point.lat, point.lng, intensityScale * alt]);
                }
                this.markers.setLatLngs(latlngs);
            }
        },

        _addObserver: function () {
            this._items = {};
            this._observer = this._layer.addObserver({
                type: 'resend',
                bbox: gmxAPIutils.bounds([[Number.MAX_VALUE, Number.MAX_VALUE]]),
                filters: ['clipFilter', 'userFilter', 'clipPointsFilter'],
                callback: L.bind(this._updateData, this)
            }).deactivate();
        },

        _layeradd: function (ev) {
            var layer = ev.layer;
            if (layer._gmx && layer._gmx.layerID === this._layer.options.layerID) {
                this.addEvent({target:{_map: this._map || this._layer._map}});
            }
        },

        _layerremove: function (ev) {
            var layer = ev.layer;
            if (layer._gmx && layer._gmx.layerID === this._layer.options.layerID) {
                this.onRemove(true);
            }
        },

        _chkZoom: function () {
            if (!this._map) { return; }

            var layer = this._layer,
                observer = this._observer,
                lmap = this._map;

            var z = lmap.getZoom();
            if (z < this.options.minHeatMapZoom || z > this.options.maxHeatMapZoom) {
                if (observer) { observer.deactivate(); }
                if (!layer._map) {
                    if (this.markers._map) {
                        lmap.removeLayer(this.markers);
                        this.markers._map = null;
                    }
                    layer.onAdd(lmap);
                }
                layer.enablePopup();
            } else if (layer._map) {
                layer.onRemove(lmap);
                if (!this.markers._map) {
                    lmap.addLayer(this.markers);
                }
                if (observer) {
                    this.setDateInterval();
                    observer.activate();
                }
                layer.disablePopup();
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


    L.gmx.VectorLayer.include({
        bindHeatMap: function (options) {
            if (L.heatLayer) {
                if (this._heatmap) {
                    this.unbindHeatMap();
                }
                this._heatmap = new GmxHeatMap(options, this);
            }
            return this;
        },

        unbindHeatMap: function () {
            if (L.heatLayer) {
                if (this._heatmap) {
                    this._heatmap.unbindHeatMap();
                    this._heatmap = null;
                    this.enablePopup();
                }
            }
            return this;
        }
    });
})();
