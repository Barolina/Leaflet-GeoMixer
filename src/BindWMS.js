(function() {
    'use strict';
    var BindWMS = L.gmx.ExternalLayer.extend({
        options: {
            minZoom: 1,
            maxZoom: 6,
            useDataManager: false,
            format: 'png',
            transparent: true
        },

        createExternalLayer: function () {
            var poptions = this.parentLayer.options,
                opt = {
                    map: poptions.mapID,
                    layers: poptions.layerID,
                    format: this.options.format,
                    transparent: this.options.transparent
                };
            if (this.options.apikey) { opt.apikey = this.options.apikey; }
            return L.tileLayer.wms('http://' + poptions.hostName + '/TileService.ashx', opt);
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minZoom || zoom > this.options.maxZoom);
        }
    });

    L.gmx.VectorLayer.include({
        bindWMS: function (options) {
            if (this._layerWMS) {
                this._layerWMS.unbindLayer();
            }
            this._layerWMS = new BindWMS(options, this);
            return this;
        },

        unbindWMS: function () {
            if (this._layerWMS) {
                this._layerWMS.unbindLayer();
                this._layerWMS = null;
                this.enablePopup();
            }
            return this;
        }
    });
})();
