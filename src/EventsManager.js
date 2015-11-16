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
        this._drawstart = null;
        this._lastDragTime = 0;
        this._lastCursor = '';

        var isDrawing = function () {
            if (_this._drawstart) {
                return true;
            } else if (_this._drawstart === null) {
                if (map.gmxDrawing) {
                    map.gmxDrawing.on('drawstart', function () {
                        _this._drawstart = true;
                    }, _this);
                    map.gmxDrawing.on('drawstop', function () {
                        _this._drawstart = false;
                        _this._lastDragTime = Date.now() + 100;
                    }, _this);
                }
                _this._drawstart = false;
            }
            if (_this._lastDragTime - Date.now() > 0) {
                return true;
            }
            return false;
        };

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

        var clearLastHover = function () {
            if (_this._lastLayer) {
                _this._lastLayer.gmxEventCheck({type: 'mousemove'}, true);
                _this._lastLayer = null;
            }
        };

        var eventCheck = function (ev) {
            var type = ev.type,
                map = _this._map,
                skipNode = false;
            if (ev.originalEvent) {
                map.gmxMouseDown = L.Browser.webkit ? ev.originalEvent.which : ev.originalEvent.buttons;
                skipNode = skipNodeName[ev.originalEvent.target.nodeName];
            }

            if (map._animatingZoom ||
                isDrawing() ||
                skipNode ||
                (type === 'mousemove' &&  map.gmxMouseDown)
                ) {
                clearLastHover();
                return;
            }
            if (ev.layerPoint) {
                map.gmxMousePos = map.getPixelOrigin().add(ev.layerPoint);
            }

            var arr = Object.keys(_this._layers).sort(function(a, b) {
                var la = map._layers[a],
                    lb = map._layers[b];
                if (la && lb) {
                    var oa = la.options, ob = lb.options,
                        za = (oa.zoomOffset || 0) + (oa.zIndex || 0),
                        zb = (ob.zoomOffset || 0) + (ob.zIndex || 0),
                        delta = zb - za;
                    return delta ? delta : _this._layers[b] - _this._layers[a];
                }
                return 0;
            });

            var layer,
                foundLayer = null,
                cursor = '';
            for (var i = 0, len = arr.length; i < len; i++) {
                var id = arr[i];
                layer = map._layers[id];
                if (layer && layer._map && !layer._animating && layer.options.clickable) {
                    if (layer.gmxEventCheck(ev)) {
                        if (layer.hasEventListeners('mouseover')) {
                            cursor = 'pointer';
                        }
                        foundLayer = layer;
                        break;
                    }
                }
            }
            if (_this._lastCursor !== cursor) { map._container.style.cursor = cursor; }
            _this._lastCursor = cursor;

            if (foundLayer) {
                if (_this._lastLayer !== foundLayer) {
                    clearLastHover();
                }
                _this._lastLayer = foundLayer;
            } else {
                clearLastHover();
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
            zoomstart: clearLastHover,
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
