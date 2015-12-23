(function() {
    'use strict';
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
    var GmxMarkerCluster = L.gmx.ExternalLayer.extend({
        options: {
            spiderfyOnMaxZoom: true,
            minZoom: 1,
            maxZoom: 6
        },

        createExternalLayer: function () {
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
            var markers = new L.MarkerClusterGroup(mOptions);
            markers.on('click', function (ev) {
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
            markers.on('clusterclick', function (ev) {
                this._layer.fire('clusterclick', L.extend(ev, {eventFrom: 'markerClusters', originalEventType: 'clusterclick'}));
            }, this);

            if (mOptions.clusterclick) {
                markers.on('clusterclick', mOptions.clusterclick instanceof Function ? mOptions.clusterclick : function (a) {
                    a.layer.spiderfy();
                });
            }

            return markers;
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minZoom || zoom > this.options.maxZoom);
        },

        updateData: function (data) {
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
                this.extLayer.removeLayers(arr);
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
                this.extLayer.addLayers(arr);
            }
        }
    });

    L.gmx.VectorLayer.include({
        bindClusters: function (options) {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this._clusters.unbindLayer();
                }
                this._clusters = new GmxMarkerCluster(options, this);
            }
            return this;
        },

        unbindClusters: function () {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this._clusters.unbindLayer();
                    this._clusters = null;
                    this.enablePopup();
                }
            }
            return this;
        }
    });
})();
