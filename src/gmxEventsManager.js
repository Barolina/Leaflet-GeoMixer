/*
 * gmxEventsManager - handlers manager
 */
var gmxEventsManager = L.Handler.extend({
	options: {
	},

	initialize: function (map) {
        this._map = map;
        this._layers = [];
        var _this = this;

		var eventCheck = function (ev) {
            var type = ev.type,
                arr = this._layers,
                cursor = 'default';
            for (var i = 0, len = arr.length; i < len; i++) {
                var id = arr[i],
                    layer = this._map._layers[id],
                    needCheck = 'gmxEventCheck' in layer;
                if('gmxEventCheck' in layer) {
                    if(layer.gmxEventCheck(ev)) {
                        cursor = 'pointer';
                        break;
                    }
                }
            }
            if(map._lastCursor !== cursor) map._container.style.cursor = cursor;
            map._lastCursor = cursor;
        }

		map.on({
			click: eventCheck,
			mousemove: eventCheck,
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
