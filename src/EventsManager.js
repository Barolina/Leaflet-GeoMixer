/*
 * gmxEventsManager - handlers manager
 */
var GmxEventsManager = L.Handler.extend({
    options: {
    },

    initialize: function (map) {
        this._map = map;
        this._layers = {};
        this._lastLayer = null;
        this._lastId = null;
        var _this = this;
        this._drawstart = false;
        this._lastCursor = '';

        if (map.gmxDrawing) {
            map.gmxDrawing.on('drawstart', function () {
                this._drawstart = true;
            }, this);
            map.gmxDrawing.on('drawstop', function () {
                this._drawstart = false;
            }, this);
        }

        var getDomIndex = function (layer) {
            var container = layer._container;
            if (container) {
                var arr = container.parentNode.childNodes;
                for (var i = 0, len = arr.length; i < len; i++) {
                    if (container === arr[i]) {
                        return i;
                    }
                }
            }
            return 0;
        };

        var skipNodeName = {
            IMG: true,
            DIV: true,
            path: true
        };

        var eventCheck = function (ev) {
            var type = ev.type;
            _this._map.gmxMouseDown = L.Browser.webkit ? ev.originalEvent.which : ev.originalEvent.buttons;

            if (_this._map._animatingZoom ||
                _this._drawstart ||
                skipNodeName[ev.originalEvent.target.nodeName] ||
                (type === 'mousemove' &&  _this._map.gmxMouseDown)
                ) {
                return;
            }
            _this._map.gmxMousePos = _this._map.getPixelOrigin().add(ev.layerPoint);

            var objId = 0,
                layer,
                cursor = '';

            // if (!skipNodeName[ev.originalEvent.target.nodeName]) {
                var arr = Object.keys(_this._layers).sort(function(a, b) {
                    var la = _this._map._layers[a],
                        lb = _this._map._layers[b];
                    if (la && lb) {
                        var oa = la.options, ob = lb.options,
                            za = (oa.zoomOffset || 0) + (oa.zIndex || 0),
                            zb = (ob.zoomOffset || 0) + (ob.zIndex || 0),
                            delta = zb - za;
                        return delta ? delta : _this._layers[b] - _this._layers[a];
                    }
                    return 0;
                });
                for (var i = 0, len = arr.length; i < len; i++) {
                    var id = arr[i];
                    layer = _this._map._layers[id];
                    if (layer && layer._map && !layer._animating) {
                        objId = layer.gmxEventCheck(ev);
                        if (objId) {
                            cursor = 'pointer';
                            break;
                        }
                    }
                }
            // }
            if (_this._lastCursor !== cursor) { map._container.style.cursor = cursor; }
            _this._lastCursor = cursor;
            if (cursor) {
                _this._lastLayer = layer;
            } else if (_this._lastLayer) {
                _this._lastLayer.gmxEventCheck({type: 'mousemove'}, true);
                _this._lastLayer = null;
            }
        };

        map.on({
            click: function (ev) {
                if (_this.clickPointTimer) { clearTimeout(_this.clickPointTimer); }
                _this.clickPointTimer = setTimeout(function () {
                    clearTimeout(_this.clickPointTimer);
                    eventCheck(ev);
                }, 0);
            },
            dblclick: eventCheck,
            mousedown: eventCheck,
            mouseup: eventCheck,
            mousemove: eventCheck,
            contextmenu: eventCheck,
            layeradd: function (ev) {
                var layer = ev.layer;
                if ('gmxEventCheck' in layer && layer.options.clickable) {
                    _this._layers[layer._leaflet_id] = getDomIndex(layer);
                }
            },
            layerremove: function (ev) {
                var id = ev.layer._leaflet_id;
                delete _this._layers[id];
                if (_this._lastLayer && _this._lastLayer._leaflet_id === id) {
                    _this._lastLayer = null;
                    _this._lastId = 0;
                }
            }
        }, this);
    }
});

L.Map.addInitHook(function () {
    // Check to see if handler has already been initialized.
    if (!this._gmxEventsManager) {
        this._gmxEventsManager = new GmxEventsManager(this);

        this.on('remove', function () {
            if (this._gmxEventsManager) {
                this._gmxEventsManager.removeHooks();
            }
        });
    }
});
