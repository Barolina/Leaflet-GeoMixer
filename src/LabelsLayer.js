/*
 (c) 2014, Sergey Alekseev
 Leaflet.LabelsLayer, plugin for Gemixer layers.
*/
L.LabelsLayer = L.Class.extend({

    options: {
        pane: 'markerPane'
    },

    initialize: function (map, options) {
        L.setOptions(this, options);
        this._observers = {};
        this._styleManagers = {};
        this._labels = {};
        var _this = this;

        this.bbox = gmxAPIutils.bounds();

        var chkData = function (data, layer) {
            if (!data.added && !data.removed) { return; }

            var opt = layer.options,
                added = map._zoom >= opt.minZoom && map._zoom <= opt.maxZoom ? data.added : [],
                layerId = '_' + layer._leaflet_id,
                gmx = layer._gmx,
                labels = {};

            for (var i = 0, len = added.length; i < len; i++) {
                var item = added[i].item,
                    isPoint = item.type === 'POINT' || item.type === 'MULTIPOINT',
                    currentStyle = item.parsedStyleKeys || item.currentStyle || {};

                if (gmx.styleHook) {
                    currentStyle = gmx.styleManager.applyStyleHook(item, gmx.lastHover && item.id === gmx.lastHover.id);
                }
                var style = gmx.styleManager.getObjStyle(item),
                    labelText = currentStyle.labelText || style.labelText,
                    labelField = currentStyle.labelField || style.labelField,
                    fontSize = currentStyle.labelFontSize || style.labelFontSize,
                    id = '_' + item.id,
                    options = item.options;

                if (labelText || labelField) {
                    if (!('center' in options)) {
                        var bounds = item.bounds;
                        options.center = isPoint ? [bounds.min.x, bounds.min.y] : [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2];
                    }
                    var txt = labelText || gmx.getPropItem(item.properties, labelField);
                    if (!('label' in options) || options.label.txt !== txt) {
                        var size = fontSize || 12,
                            labelStyle = {
                                font: size + 'px "Arial"',
                                labelHaloColor: currentStyle.labelHaloColor || style.labelHaloColor || 0,
                                labelColor: currentStyle.labelColor || style.labelColor,
                                labelAlign: currentStyle.labelAlign || style.labelAlign,
                                labelFontSize: fontSize
                            },
                            width = gmxAPIutils.getLabelWidth(txt, labelStyle);
                        if (!width) {
                            delete labels[id];
                            continue;
                        }
                        options.label = {
                            isPoint: isPoint,
                            width: width + 4,
                            sx: style.sx || 0,
                            txt: txt,
                            style: labelStyle
                        };
                    }
                    if (options.label.width) {
                        labels[id] = item;
                    }
                }
            }
            _this._labels[layerId] = labels;
        };

        var addObserver = function (layer) {
            var gmx = layer._gmx,
                filters = ['styleFilter', 'userFilter'],
                options = {
                    type: 'resend',
                    bbox: _this.bbox,
                    filters: filters,
                    callback: function(data) {
                        chkData(data, layer);
                        _this.redraw();
                    }
                };
            if (gmx.beginDate && gmx.endDate) {
                options.dateInterval = [gmx.beginDate, gmx.endDate];
            }
            return gmx.dataManager.addObserver(options, '_Labels');
        };
        this.add = function (layer) {
            var id = layer._leaflet_id,
                labels = _this._labels['_' + id],
                gmx = layer._gmx;

            for (var gid in labels) {
                delete labels[gid].options.labelStyle;
                delete labels[gid].options.label;
            }
            if (!_this._observers[id] && gmx && gmx.labelsLayer && id) {
                gmx.styleManager.deferred.then(function () {
                    var observer = addObserver(layer);
                    if (!gmx.styleManager.isVisibleAtZoom(_this._map._zoom)) {
                        observer.deactivate();
                    }
                    _this._observers[id] = observer;
                    _this._styleManagers[id] = gmx.styleManager;
                    _this._updateBbox();

                    _this._labels['_' + id] = {};
                    _this.redraw();
                });
            }
        };
        this.remove = function (layer) {
            var id = layer._leaflet_id;
            if (_this._observers[id]) {
                var gmx = layer._gmx,
                    dataManager = gmx.dataManager;
                dataManager.removeObserver(_this._observers[id].id);
                delete _this._observers[id];
                delete _this._styleManagers[id];
                delete _this._labels['_' + id];
                _this.redraw();
            }
        };
        this._layeradd = function (ev) {
            _this.add(ev.layer);
        };
        this._layerremove = function (ev) {
            _this.remove(ev.layer);
        };
    },

    redraw: function () {
        if (!this._frame && !this._map._animating) {
            this._frame = L.Util.requestAnimFrame(this._redraw, this);
        }
        return this;
    },

    onAdd: function (map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }
        map.getPanes()[this.options.pane].appendChild(this._canvas);

        map.on('moveend', this._reset, this);
        map.on({
            layeradd: this._layeradd,
            layerremove: this._layerremove
        });
        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }

        this._reset();
    },

    onRemove: function (map) {
        map.getPanes()[this.options.pane].removeChild(this._canvas);

        map.off('moveend', this._reset, this);
        map.off('layeradd', this._layeradd);
        map.off('layerremove', this._layerremove);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoom, this);
        }
    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        var canvas = L.DomUtil.create('canvas', 'leaflet-labels-layer leaflet-layer'),
            size = this._map.getSize();
        canvas.width  = size.x; canvas.height = size.y;
        canvas.style.pointerEvents = 'none';
        this._canvas = canvas;

        var animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
    },

    _updateBbox: function () {
        var _map = this._map,
            screenBounds = _map.getBounds(),
            southWest = screenBounds.getSouthWest(),
            northEast = screenBounds.getNorthEast(),
            m1 = L.Projection.Mercator.project(southWest),
            m2 = L.Projection.Mercator.project(northEast);

        this.mInPixel = gmxAPIutils.getPixelScale(_map._zoom);
        this._ctxShift = [m1.x * this.mInPixel, m2.y * this.mInPixel];
        for (var id in this._observers) {
            this._observers[id].setBounds({
                min: {x: southWest.lng, y: southWest.lat},
                max: {x: northEast.lng, y: northEast.lat}
            });
        }
    },

    _reset: function () {
        this._updateBbox();
        for (var id in this._observers) {
            var observer = this._observers[id];
            if (!observer.isActive() &&
                this._styleManagers[id].isVisibleAtZoom(this._map._zoom)
            ) {
                observer.activate();
            }
            observer.fire('update');
        }
    },

    _redraw: function () {
        var out = [],
            _map = this._map,
            mapSize = _map.getSize(),
            _canvas = this._canvas,
            mapTop = _map._getTopLeftPoint(),
            topLeft = _map.containerPointToLayerPoint([0, mapTop.y < 0 ? -mapTop.y : 0]);

        _canvas.width = mapSize.x; _canvas.height = mapSize.y;
        L.DomUtil.setPosition(_canvas, topLeft);

        var w2 = 2 * this.mInPixel * gmxAPIutils.worldWidthMerc,
            start = w2 * Math.floor(_map.getPixelBounds().min.x / w2),
            ctx = _canvas.getContext('2d');

        for (var layerId in this._labels) {
            var labels = this._labels[layerId];
            for (var id in labels) {
                var it = labels[id],
                    options = it.options,
                    label = options.label,
                    style = label.style,
                    width = label.width,
                    width2 = width / 2,
                    size = style.labelFontSize || 12,
                    size2 = size / 2,
                    center = options.center,
                    pos = [center[0] * this.mInPixel, center[1] * this.mInPixel],
                    isFiltered = false;

                if (label.isPoint) {
                    var labelAlign = style.labelAlign || 'left',
                        delta = label.sx;
                    if (labelAlign === 'left') {
                        pos[0] += width2 + delta;
                    } else if (labelAlign === 'right') {
                        pos[0] -= width + delta;
                    }
                }
                pos[0] -= width2 + this._ctxShift[0];
                pos[1] = size2 - pos[1] + this._ctxShift[1];
                for (var tx = pos[0] + start; tx < mapSize.x; tx += w2) {
                    var coord = [Math.floor(tx), Math.floor(pos[1])],
                        bbox = gmxAPIutils.bounds([
                            [coord[0] - width2, coord[1] - size2],
                            [coord[0] + width2, coord[1] + size2]
                        ]);
                    for (var i = 0, len1 = out.length; i < len1; i++) {
                        if (bbox.intersects(out[i].bbox)) {
                            isFiltered = true;
                            break;
                        }
                    }
                    if (isFiltered) { continue; }

                    if (!('labelStyle' in options)) {
                        var strokeStyle = gmxAPIutils.dec2color(style.labelHaloColor, 1);
                        options.labelStyle = {
                            font: size + 'px "Arial"',
                            strokeStyle: strokeStyle,
                            fillStyle: gmxAPIutils.dec2color(style.labelColor || 0, 1),
                            shadowBlur: 4,
                            shadowColor: strokeStyle
                        };
                    }
                    out.push({
                        arr: it.properties,
                        bbox: bbox,
                        txt: label.txt,
                        style: options.labelStyle,
                        coord: coord
                    });
                }
            }
        }
        if (out.length) {
            if (!_canvas.parentNode) {
                this._map.getPanes()[this.options.pane].appendChild(_canvas);
            }
            ctx.clearRect(0, 0, _canvas.width, _canvas.height);
            out.forEach(function(it) {
                gmxAPIutils.setLabel(ctx, it.txt, it.coord, it.style);
            });
        } else if (_canvas.parentNode) {
            _canvas.parentNode.removeChild(_canvas);
        }

        this._frame = null;
    },

    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom),
            pixelBoundsMin = this._map.getPixelBounds().min;

        var offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());
        if (pixelBoundsMin.y < 0) {
            offset.y += pixelBoundsMin.multiplyBy(-scale).y;
        }

        this._canvas.style[L.DomUtil.TRANSFORM] = L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ')';
    }
});

L.labelsLayer = function (map, options) {
    return new L.LabelsLayer(map, options);
};

L.Map.addInitHook(function () {
	// Check to see if Labels has already been initialized.
    if (!this._labelsLayer) {
        this._labelsLayer = new L.LabelsLayer(this);
        this._labelsLayer.addTo(this);
    }
});
