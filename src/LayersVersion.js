(function() {
var delay = 20000,
    layers = {},
    script = '/Layer/CheckVersion.ashx',
    intervalID = null,
    lastLayersStr = '';

var getRequestParams = function(layer) {
    var hosts = {},
        _gmx;
    if (layer) {
        if (layer instanceof L.gmx.DataManager) {
            hosts[layer.options.hostName] = [{
                Name: layer.options.LayerID,
                Version: layer.options.LayerVersion || 0
            }];
        } else {
            _gmx = layer._gmx;
            var prop = _gmx.properties;
            hosts[_gmx.hostName] = [{
                Name: prop.LayerID,
                Version: prop.LayerVersion || 0
            }];
        }
    } else {
        for (var id in layers) {
            var obj = layers[id];
            if (obj.options.chkUpdate) {
                _gmx = obj._gmx;
                var hostName = _gmx.hostName,
                    pt = {Name: id, Version: _gmx.properties.LayerVersion || 0};
                if (hosts[hostName]) { hosts[hostName].push(pt); }
                else { hosts[hostName] = [pt]; }
            }
        }
    }
    return hosts;
};

var chkVersion = function (layer, callback) {
    var layerID = null;
    if (layer) {
        layerID = layer instanceof L.gmx.DataManager ? layer.options.LayerID : layer._gmx.layerID;
    }
    var processResponse = function(res) {
        if (res && res.Status === 'ok' && res.Result) {
            for (var i = 0, len = res.Result.length; i < len; i++) {
                var item = res.Result[i],
                    prop = item.properties,
                    id = prop.LayerID,
                    curLayer = layers[id] || (id === layerID ? layer : null);
                if (curLayer && 'updateVersion' in curLayer) { curLayer.updateVersion(item); }
            }
        }
        lastLayersStr = '';
        if (callback) { callback(res); }
    };

    if (document.body && !gmxAPIutils.isPageHidden()) {
        var hosts = getRequestParams(layer);
        for (var hostName in hosts) {
            var url = 'http://' + hostName + script,
                layersStr = JSON.stringify(hosts[hostName]);

            if (lastLayersStr !== layersStr) {
                lastLayersStr = layersStr;
                if ('FormData' in window) {
                    gmxAPIutils.request({
                        url: url,
                        async: true,
                        headers: {
                            'Content-type': 'application/x-www-form-urlencoded'
                        },
                        type: 'POST',
                        params: 'WrapStyle=None&layers=' + encodeURIComponent(layersStr),
                        withCredentials: true,
                        callback: function(response) {
                            processResponse(JSON.parse(response));
                        },
                        onError: function(response) {
                            console.log('Error: LayerVersion ', response);
                        }
                    });
                } else {
                    gmxAPIutils.sendCrossDomainPostRequest(url, {
                        WrapStyle: 'message',
                        layers: layersStr
                    }, processResponse);
                }
            }
        }
    }
};

var layersVersion = {

    remove: function(layer) {
        var _gmx = layer._gmx,
            layerID = _gmx.layerID;

        delete layers[layerID];
        _gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
    },

    add: function(layer) {
        var _gmx = layer._gmx,
            prop = _gmx.properties;

        if (_gmx.layerID in layers) {
            return;
        }

        if ('LayerVersion' in prop) {
            layers[_gmx.layerID] = layer;
            _gmx._chkVersion = function () {
                chkVersion(layer);
            };
            _gmx.dataManager.on('chkLayerUpdate', _gmx._chkVersion);

            layersVersion.start();
        }
    },

    chkVersion: chkVersion,

    stop: function() {
        if (intervalID) { clearInterval(intervalID); }
        intervalID = null;
    },

    start: function(msec) {
        if (msec) { delay = msec; }
        layersVersion.stop();
        intervalID = setInterval(chkVersion, delay);
    }
};

if (!L.gmx) { L.gmx = {}; }
L.gmx.layersVersion = layersVersion;

L.gmx.VectorLayer.include({
    updateVersion: function (layerDescription) {
        if (layerDescription) {
            var gmx = this._gmx;
            if (layerDescription.geometry) {
                gmx.geometry = layerDescription.geometry;
            }
            if (layerDescription.properties) {
                L.extend(gmx.properties, layerDescription.properties);
                gmx.rawProperties = gmx.properties;
                gmx.dataManager.updateVersion(layerDescription);
                this.fire('versionchange');
            }
        }
    }
});
})();
