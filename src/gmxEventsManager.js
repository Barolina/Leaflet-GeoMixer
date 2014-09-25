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

        var clearLastHover = function () {
            if (_this._lastLayer) {
                _this._lastLayer.gmxEventCheck({type: 'mousemove'}, true);
            }
        }

        var eventCheck = function (ev) {
            var type = ev.type,
                arr = _this._layers,
                id = 0,
                objId = 0,
                layer = null,
                cursor = '';    // default
            _this._map.gmxMouseDown = L.Browser.webkit ? ev.originalEvent.which : ev.originalEvent.buttons;
            if(type === 'mousemove' &&  _this._map.gmxMouseDown) return;

            for (var i = arr.length - 1; i >= 0; i--) {
                id = arr[i];
                layer = _this._map._layers[id];
                var needCheck = 'gmxEventCheck' in layer && layer.options.clickable;

                if(needCheck) {
                    objId = layer.gmxEventCheck(ev);
                    if(objId) {
                        cursor = 'pointer';
                        break;
                    }
                }
            }
            if(map._lastCursor !== cursor) map._container.style.cursor = cursor;
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
            click: eventCheck,
            dblclick: eventCheck,
            mousedown: eventCheck,
            mouseup: eventCheck,
            mousemove: eventCheck,
            contextmenu: eventCheck,
            layeradd: function (ev) {
                this._layers.push(ev.layer._leaflet_id);
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
