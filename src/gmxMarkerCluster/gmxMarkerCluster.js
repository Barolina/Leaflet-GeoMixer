(function() {
    var _DEFAULTS = {
        radiusFunc: function (count) {
            var r = Math.floor(count / 15);
            if (r > 40) {
                r = 40;
            } else if (r < 20) {
                r = 20;
            }
            return r;
        },
        stopColor: [     // [%, color, opacity]
            [0, '#ffff00', 0.8],
            [1, '#ff0000', 0.8]
        ],
        text: {
            stroke: 'black',
            strokeWidth: 1,
            fill: 'white'
        }
    };

    var GmxMarkerCluster = function(options, layer) {
        this._layer = layer;
        this.options = {
            minZoom: 1,
            maxZoom: 6
        };
        this.options = L.setOptions(this, options);
        var mOptions = {
            spiderfyOnMaxZoom: false,
            showCoverageOnHover: false,
            disableClusteringAtZoom: 1 + Number(this.options.maxZoom)
        };
        if ('iconCreateFunction' in this.options) {
            mOptions.iconCreateFunction = this.options.iconCreateFunction;
        } else if ('clusterIconOptions' in this.options) {
            var opt = this.options.clusterIconOptions;
            if ('radialGradient' in opt) {
                var radialGradient = opt.radialGradient,
                    text = opt.text || _DEFAULTS.text;
                mOptions.iconCreateFunction = function (cluster) {
                    var childCount = cluster.getChildCount();

                    text.count = childCount;
                    return  L.gmxUtil.getSVGIcon({
                        type: 'circle',
                        iconSize: 2 * (radialGradient.radiusFunc || _DEFAULTS.radiusFunc)(childCount),
                        text: text,
                        fillRadialGradient: radialGradient
                    });
                };
            }
        }

        if (this.options.chunkProgress) { mOptions.chunkProgress = this.options.chunkProgress; }

        this._popup = new L.Popup({maxWidth: 10000, className: 'gmxPopup'});
        this.markers = new L.MarkerClusterGroup(mOptions);
        this.markers.on('click', function (ev) {
            var propsArr = ev.layer.options.properties,
                gmx = this._layer._gmx,
                balloonData = gmx.styleManager.getItemBalloon(propsArr[0]);
            if (!balloonData.DisableBalloonOnClick) {
                this._popup
                    .setLatLng(ev.latlng)
                    .setContent(L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
                        properties: this._layer.getItemProperties(propsArr),
                        tileAttributeTypes: gmx.tileAttributeTypes,
                        unitOptions: this.lmap.options || {},
                        geometries: [propsArr[propsArr.length - 1]]
                    }))
                    .openOn(this.lmap);
            }
        }, this);

        this._addObserver();

        layer.on('dateIntervalChanged', this.setDateInterval, this);

        this.onAdd();
    };

    GmxMarkerCluster.prototype = {
        onAdd: function () {
            if (this._layer._map) {
                this.lmap = this._layer._map;
                this._chkZoom();
            }
            if (this.lmap) {
                this.lmap.on({
                    moveend: this._updateBbox,
                    zoomend: this._zoomend,
                    layeradd: this._layeradd,
                    layerremove: this._layerremove
                }, this);
            }
        },

        onRemove: function () {
            if (this._observer) { this._observer.deactivate(); }
            this._layer.off('dateIntervalChanged', this.setDateInterval, this);
            if (this.lmap) {
                this.lmap.off({
                    moveend: this._updateBbox,
                    zoomend: this._zoomend,
                    layeradd: this._layeradd,
                    layerremove: this._layerremove
                }, this);
                if (this.markers._map) {
                    this.lmap.removeLayer(this.markers);
                    this._layer.onAdd(this.lmap);
                }
            }
        },

        setDateInterval: function () {
            if (this._observer) {
                var gmx = this._layer._gmx;
                this._observer.setDateInterval(gmx.beginDate, gmx.endDate);
            }
        },

        _updateData: function (data) {
            var arr = [],
            i, len, vectorTileItem, id, marker;
            if (data.removed) {
                for (i = 0, len = data.removed.length; i < len; i++) {
                    vectorTileItem = data.removed[i];
                    id = vectorTileItem.id;
                    marker = this._items[id];
                    if (marker) {
                        arr.push(marker);
                    }
                }
                this.markers.removeLayers(arr);
                arr = [];
            }
            if (data.added) {
                for (i = 0, len = data.added.length; i < len; i++) {
                    vectorTileItem = data.added[i];
                    id = vectorTileItem.id;
                    marker = this._items[id];
                    if (!marker) {
                        var item = vectorTileItem.properties,
                            geo = item[item.length - 1],
                            parsedStyle = vectorTileItem.item.parsedStyleKeys,
                            p = geo.coordinates,
                            latlng = L.Projection.Mercator.unproject({x: p[0], y: p[1]}),
                            opt = {
                                properties: vectorTileItem.properties,
                                mPoint: p
                            };
                        if (parsedStyle.iconUrl) {
                            opt.icon = L.icon({
                                iconAnchor: [8, 10],
                                iconUrl: parsedStyle.iconUrl
                            });
                        } else {
                            opt.icon = L.gmxUtil.getSVGIcon(parsedStyle);
                        }
                        marker = new L.Marker(latlng, opt);
                        this._items[id] = marker;
                    }
                    arr.push(marker);
                }
                this.markers.addLayers(arr);
            }
        },

        _addObserver: function () {
            this._items = {};
            this._observer = this._layer.addObserver({
                callback: L.bind(this._updateData, this),
                filters: ['styleFilter']
            }).deactivate();
        },

        _layeradd: function (ev) {
            if (ev.layer.options && ev.layer.options.layerID === this._layer.options.layerID) {
                this.lmap.on('zoomend', this._chkZoom, this);
                this._chkZoom();
            }
        },

        _layerremove: function (ev) {
            if (ev.layer.options && ev.layer.options.layerID === this._layer.options.layerID) {
                this.lmap.off('zoomend', this._chkZoom, this);
                if (this.markers._map) {
                    this.markers._map.removeLayer(this.markers);
                }
            }
        },

        _zoomend: function () {
            if (this._popup && this.markers._map) {
                this.markers._map.removeLayer(this._popup);
            }
        },

        _chkZoom: function () {
            if (!this.lmap) { return; }

            var layer = this._layer,
                observer = this._observer,
                lmap = this.lmap;

            var z = lmap.getZoom();
            if (z < this.options.minZoom || z > this.options.maxZoom) {
                if (observer) { observer.deactivate(); }
                if (!layer._map) {
                    if (this.markers._map) {
                        lmap.removeLayer(this.markers);
                    }
                    layer.onAdd(lmap);
                }
            } else if (layer._map) {
                layer.onRemove(lmap);
                if (observer) {
                    this.setDateInterval();
                    observer.activate();
                }
                if (!this.markers._map) {
                    lmap.addLayer(this.markers);
                }
            }
        },

        _updateBbox: function () {
            if (!this.lmap || !this._observer) { return; }

            var screenBounds = this.lmap.getBounds(),
                p1 = screenBounds.getNorthWest(),
                p2 = screenBounds.getSouthEast(),
                bbox = L.gmxUtil.bounds([[p1.lng, p1.lat], [p2.lng, p2.lat]]);
            this._observer.setBounds(bbox);
        }
    };

    L.gmx.VectorLayer.include({
        bindClusters: function (options) {
            if (this._clusters) {
                this.unbindClusters();
            }
            this._clusters = new GmxMarkerCluster(options, this);
            this.on('add', this._clusters.onAdd, this._clusters);
        },

        unbindClusters: function () {
            if (this._clusters) {
                this.off('add', this._clusters.onAdd, this._clusters);
                this._clusters.onRemove();
                this._clusters = null;
            }
        }
    });
})();
