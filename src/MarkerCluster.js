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
        text: {
            stroke: 'black',
            'stroke-width': 1,
            'text-anchor': 'middle',
            fill: 'white'
        }
    };

    var GmxMarkerCluster = L.Class.extend({
        options: {
            spiderfyOnMaxZoom: true,
            minZoom: 1,
            maxZoom: 6
        },

        initialize: function (options, layer) {
            this._layer = layer;
            L.setOptions(this, options);
            var mOptions = L.extend({
                showCoverageOnHover: false,
                disableClusteringAtZoom: 1 + Number(this.options.maxZoom)
            }, this.options);

            if ('clusterIconOptions' in this.options) {
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

            if (this.options.clusterclick) {
                mOptions.clusterclick = this.options.clusterclick;
                if (mOptions.clusterclick === true) { mOptions.zoomToBoundsOnClick = false; }
            }

            this._popup = new L.Popup({maxWidth: 10000, className: 'gmxPopup'});
            this.markers = new L.MarkerClusterGroup(mOptions);
            this.markers.on('click', function (ev) {
                var propsArr = ev.layer.options.properties,
                    properties = this._layer.getItemProperties(propsArr),
                    geometry = [propsArr[propsArr.length - 1]],
                    gmx = this._layer._gmx,
                    id = propsArr[0],
                    balloonData = gmx.styleManager.getItemBalloon(id);

                if (balloonData && !balloonData.DisableBalloonOnClick) {
                    var style = this._layer.getItemStyle(id);
                    if (style && style.iconAnchor) {
                        var protoOffset = L.Popup.prototype.options.offset;
                        this._popup.options.offset = [
                            -protoOffset[0] - style.iconAnchor[0] + style.sx / 2,
                            protoOffset[1] - style.iconAnchor[1] + style.sy / 2
                        ];
                    }
                    this._popup
                        .setLatLng(ev.latlng)
                        .setContent(L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
                            properties: properties,
                            tileAttributeTypes: gmx.tileAttributeTypes,
                            unitOptions: this._map.options || {},
                            geometries: geometry
                        }))
                        .openOn(this._map);
                }
                this._layer.fire('click', L.extend(ev, {
                    eventFrom: 'markerClusters',
                    originalEventType: 'click',
                    gmx: {
                        id: id,
                        layer: this._layer,
                        properties: properties,
                        target: {
                            id: id,
                            properties: propsArr,
                            geometry: geometry
                        }
                    }
                }));
            }, this);
            this.markers.on('clusterclick', function (ev) {
                this._layer.fire('clusterclick', L.extend(ev, {eventFrom: 'markerClusters', originalEventType: 'clusterclick'}));
            }, this);

            if (mOptions.clusterclick) {
                this.markers.on('clusterclick', mOptions.clusterclick instanceof Function ? mOptions.clusterclick : function (a) {
                    a.layer.spiderfy();
                });
            }

            this._layer
                .on('add', this.addEvent, this)
                .on('dateIntervalChanged', this.setDateInterval, this);

            var _this = this;
            this._layer._gmx.styleManager.initStyles().then(function () {
                _this._addObserver();

                if (_this._layer._map) {
                    _this.addEvent({target:{_map: _this._layer._map}});
                }
            });
        },

        closePopup: function () {
            if (this._popup && this._popup._map) { this._popup._map.removeLayer(this._popup); }
        },

        unspiderfy: function () {
            if (this.markers._unspiderfy) { this.markers._unspiderfy(); }
        },

        unbindClusters: function () {
            var map = this._map || this._layer._map;
            this._layer
                .off('add', this.addEvent, this)
                .off('dateIntervalChanged', this.setDateInterval, this);

            this.onRemove(!map);
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
            this._chkZoom();
        },

        // remove clusters from parent layer
        onRemove: function (fromMapFlag) {
            var map = this._map;
            if (this._observer) {
                this._observer.deactivate();
            }
            if (this.markers._map) {
                this._zoomend();
                this.markers._map.removeLayer(this.markers);
            }
            if (!fromMapFlag) {
                this._layer.onAdd(map);
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
                        if (parsedStyle) {
                            if (parsedStyle.iconUrl) {
                                var iconAnchor = parsedStyle.iconAnchor;
                                if (!iconAnchor) {
                                    var style = this._layer.getItemStyle(id);
                                    iconAnchor = style.image ? [style.sx / 2, style.sy / 2] : [8, 10];
                                }
                                opt.icon = L.icon({
                                    iconAnchor: iconAnchor,
                                    iconUrl: parsedStyle.iconUrl
                                });
                            } else {
                                opt.icon = L.gmxUtil.getSVGIcon(parsedStyle);
                            }
                        } else if (this.options.notClusteredIcon) {
                            var icon = this.options.notClusteredIcon;
                            if (icon instanceof L.Icon) {
                                opt.icon = icon;
                            } else {
                                opt.icon = L.icon(icon);
                            }
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
            var filters = ['clipFilter', 'userFilter', 'clipPointsFilter'];
            if (!('notClusteredIcon' in this.options)) {
                filters.push('styleFilter');
            }
            this._observer = this._layer.addObserver({
                callback: L.bind(this._updateData, this),
                filters: filters
            }).deactivate();
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
                this.onRemove(true);
                this._removeMapHandlers();
            }
        },

        _zoomend: function () {
            if (this._popup && this.markers._map) {
                this.markers._map.removeLayer(this._popup);
            }
            this._chkZoom();
        },

        _chkZoom: function () {
            if (!this._map) { return; }

            var layer = this._layer,
                observer = this._observer,
                lmap = this._map;

            var z = lmap.getZoom();
            if (z < this.options.minZoom || z > this.options.maxZoom) {
                if (observer) { observer.deactivate(); }
                if (!layer._map) {
                    if (this.markers._map) {
                        lmap.removeLayer(this.markers);
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
        bindClusters: function (options) {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this.unbindClusters();
                }
                this._clusters = new GmxMarkerCluster(options, this);
            }
            return this;
        },

        unbindClusters: function () {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this._clusters.unbindClusters();
                    this._clusters = null;
                    this.enablePopup();
                }
            }
            return this;
        }
    });
})();
