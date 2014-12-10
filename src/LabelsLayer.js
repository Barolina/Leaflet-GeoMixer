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
        this._labels = {};
        var _this = this;

        this.bbox = gmxAPIutils.bounds();

        var chkData = function (data, layer) {
            if (!data.added && !data.removed) return;
            var added = data.added || [],
                layerId = '_' + layer._leaflet_id,
                gmx = layer._gmx,
                labels = {};
            for (var i = 0, len = added.length; i < len; i++) {
                var item = added[i].item,
                    currentStyle = item.currentStyle || item.parsedStyleKeys || {};

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
                        options.center = item.type === 'POINT' ?
                             [bounds.min.x, bounds.min.y]
                           : [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2]
                        ;
                    }
                    var txt = labelText || gmx.getPropItem(item.properties, labelField);
                    if (!('label' in options) || options.label.txt !== txt) {
                        var size = fontSize || 12,
                            width = gmxAPIutils.getLabelWidth(txt, style);
                        if (!width) {
                            delete labels[id];
                            continue;
                        }
                        options.label = {
                            width: width + 3,
                            txt: txt,
                            style: {
                                font: size + 'px "Arial"',
                                labelHaloColor: currentStyle.labelHaloColor || style.labelHaloColor,
                                labelColor: currentStyle.labelColor || style.labelColor,
                                labelFontSize: fontSize
                            }
                        };
                    }
                    if (options.label.width) {
                        labels[id] = item;
                    }
                }
            }
            _this._labels[layerId] = labels;
        }

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
        }
        this._layeradd = function (ev) {
            var layer = ev.layer,
                id = layer._leaflet_id;
            if (layer._gmx && layer._gmx.labelsLayer) {
                _this._updateBbox();
                var observer = addObserver(layer);
                _this._observers[id] = observer;
                _this._labels['_' + id] = {};
                _this.redraw();

            }
        }
        this._layerremove = function (ev) {
            var layer = ev.layer,
                id = ev.layer._leaflet_id;
            if (_this._observers[id]) {
                var gmx = layer._gmx,
                    dataManager = gmx.dataManager;
                dataManager.removeObserver(_this._observers[id].id);
                delete _this._observers[id];
                delete _this._labels['_' + id];
                _this._reset();
            }
        }
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
            ww = gmxAPIutils.worldWidthMerc,
            ww2 = 2 * ww,
            m1 = L.Projection.Mercator.project(southWest),
            m2 = L.Projection.Mercator.project(northEast),
            w = (m2.x - m1.x) / 2,
            center = (m1.x + m2.x) / 2;
        center %= ww2;
        if (center > ww) center -= ww2;
        else if (center < -ww) center += ww2;

        this.mInPixel = gmxAPIutils.getPixelScale(_map._zoom);
        this.mInPixel2 = 2 * this.mInPixel;
        this._ctxShift = [(w - center) * this.mInPixel, m2.y * this.mInPixel];
        this.bbox.min.x = center - w; this.bbox.min.y = m1.y;
        this.bbox.max.x = center + w; this.bbox.max.y = m2.y;
    },

    _reset: function () {
        this._updateBbox();
        for (var id in this._observers) {
            this._observers[id].fire('update');
        }
    },

    _redraw: function () {
        var out = [],
            _map = this._map,
            size = _map.getSize(),
            _canvas = this._canvas,
            mapTop = _map._getTopLeftPoint(),
            topLeft = _map.containerPointToLayerPoint([0, mapTop.y < 0 ? -mapTop.y : 0]);

        _canvas.width = size.x; _canvas.height = size.y;
        L.DomUtil.setPosition(_canvas, topLeft);

        var ctx = _canvas.getContext('2d');
        ctx.translate(this._ctxShift[0], this._ctxShift[1]);

        for (var layerId in this._labels) {
            var labels = this._labels[layerId];
            for (var id in labels) {
                var it = labels[id],
                    options = it.options,
                    label = options.label,
                    style = label.style,
                    width = label.width,
                    size = style.labelFontSize || 12,
                    ww = width / this.mInPixel2,
                    hh = size / this.mInPixel2,
                    center = options.center,
                    bbox = gmxAPIutils.bounds([
                        [center[0] - ww, center[1] - hh],
                        [center[0] + ww, center[1] + hh]
                    ]),
                    isFiltered = false;

                for (var i = 0, len1 = out.length; i < len1; i++) {
                    if(bbox.intersects(out[i].bbox)) {
                        isFiltered = true;
                        break;
                    }
                }
                if(isFiltered) continue;

                if (!('labelStyle' in options)) {
                    var strokeStyle = gmxAPIutils.dec2color(style.labelHaloColor || 0, 1);
                    options.labelStyle = {
                        font: size + 'px "Arial"'
                        ,strokeStyle: strokeStyle
                        ,fillStyle: gmxAPIutils.dec2color(style.labelColor || 0, 1)
                        ,shadowBlur: 4
                        ,shadowColor: strokeStyle
                    };
                }
                out.push({
                    arr: it.properties
                    ,bbox: bbox
                    ,txt: label.txt
                    ,style: options.labelStyle
                    ,coord: gmxAPIutils.toPixels(center, width/2, size/2, this.mInPixel)
                });
            }
        }
        var _canvas = this._canvas;
        if (out.length) {
            if (!_canvas.parentNode) {
                this._map.getPanes()[this.options.pane].appendChild(_canvas);
            }

            var ctx = _canvas.getContext('2d'),
                p = this._ctxShift;

            ctx.clearRect(-p[0], -p[1], _canvas.width, _canvas.height);
            for (var i = 0, len = out.length; i < len; i++) {
                var it = out[i];
                gmxAPIutils.setLabel(ctx, it.txt, it.coord, it.style);
            }
        } else {
            if (_canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
        }

        this._frame = null;
    },

    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom),
            pixelBoundsMin = this._map.getPixelBounds().min;

        var offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());
        if (pixelBoundsMin.y < 0) offset.y += pixelBoundsMin.multiplyBy(-scale).y;

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
