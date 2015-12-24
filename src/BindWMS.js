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
            var poptions = this.parentLayer.options;
            return L.tileLayer.wms('http://' + poptions.hostName + '/TileService.ashx', {
                apikey: this.options.apikey,
                map: poptions.mapID,
                layers: poptions.layerID,
                format: 'png',
                transparent: true
            });
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minZoom || zoom > this.options.maxZoom);
        }
    });

    L.gmx.VectorLayer.include({
        bindWMS: function (options) {
            if (options && options.apikey) {
                if (this._layerWMS) {
                    this._layerWMS.unbindLayer();
                }
                this._layerWMS = new BindWMS(options, this);
                return this;
            } else {
                return null;
            }
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
