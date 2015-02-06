/*
 * gmxEventsManager - handlers manager
 */
var gmxEventsManager = L.Handler.extend({
    options: {
    },

    initialize: function (map) {
        this._map = map;
        this._layers = [];
        this._lastLayer = null;
        this._lastId = null;
        var _this = this;
        this._drawstart = false;

        var clearLastHover = function () {
            if (_this._lastLayer) {
                _this._lastLayer.gmxEventCheck({type: 'mousemove'}, true);
            }
        }
		if (map.gmxDrawing) {
            map.gmxDrawing.on('drawstart', function () {
                this._drawstart = true;
            }, this);
            map.gmxDrawing.on('drawstop', function () {
                this._drawstart = false;
            }, this);
        }

        var eventCheck = function (ev) {
            var type = ev.type,
                arr = [],
                objId = 0,
                layer = null,
                cursor = ''; //default
            _this._map.gmxMouseDown = L.Browser.webkit ? ev.originalEvent.which : ev.originalEvent.buttons;
            
            if(_this._drawstart ||
                (type === 'mousemove' &&  _this._map.gmxMouseDown)) return;

            _this._map.gmxMousePos = _this._map.getPixelOrigin().add(ev.layerPoint);
            _this._layers.map(function (id) {
                layer = _this._map._layers[id];

                if ('gmxEventCheck' in layer && layer.options.clickable) {
                    arr.push(layer);
                }
            });
            arr = arr.sort(function(a, b) {
                var oa = a.options, ob = b.options,
                    za = (oa.zoomOffset || 0) + (oa.zIndex || 0),
                    zb = (ob.zoomOffset || 0) + (ob.zIndex || 0);
                return zb - za;
            });
            for (var i = 0, len = arr.length; i < len; i++) {
                layer = arr[i];
                objId = layer.gmxEventCheck(ev);
                if(objId) {
                    cursor = 'pointer';
                    break;
                }
            }
            if (map._lastCursor !== cursor) map._container.style.cursor = cursor;
            map._lastCursor = cursor;
            if (_this._lastId && (_this._lastLayer != layer || _this._lastId != objId)) {
                clearLastHover();
            }
            if (cursor) {
                _this._lastLayer = layer;
                _this._lastId = objId;
            }
        }

        map.on({
            click: function (ev) {
                if (_this.clickPointTimer) clearTimeout(_this.clickPointTimer);
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
                var layer = ev.layer,
                    needCheck = 'gmxEventCheck' in layer && layer.options.clickable;
                if (needCheck) this._layers.push(layer._leaflet_id);
            },
            layerremove: function (ev) {
                var id = ev.layer._leaflet_id,
                    arr = this._layers;
                for (var i = 0, len = arr.length; i < len; i++) {
                    if(arr[i] === id) {
                        arr.splice(i, 1);
                        break;
                    }
                }
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
    if (this._gmxEventsManager) return;
    this._gmxEventsManager = new gmxEventsManager(this);

    this.on('remove', function () {
        if (this._gmxEventsManager) {
            this._gmxEventsManager.removeHooks();
        }
    });
});
