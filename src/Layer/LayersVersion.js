(function() {
var delay = 20000,
    layers = {},
    script = '/Layer/CheckVersion.ashx',
    intervalID = null,
    timeoutID = null,
    lastLayersStr = '';

var isExistsTiles = function(prop) {
    var tilesKey = prop.Temporal ? 'TemporalTiles' : 'tiles';
    return tilesKey in prop;
};
var getParams = function(prop) {
    return {
        Name: prop.name,
        Version: isExistsTiles(prop) ? prop.LayerVersion : -1
    };
};
var getRequestParams = function(layer) {
    var hosts = {},
        prop, hostName;
    if (layer) {
        prop = layer instanceof L.gmx.DataManager ? layer.options : layer._gmx.properties;
        hostName = prop.hostName || layer._gmx.hostName;
        hosts[hostName] = [getParams(prop)];
    } else {
        for (var id in layers) {
            var obj = layers[id];
            if (obj.options.chkUpdate) {
                prop = obj._gmx.properties;
                hostName = prop.hostName || obj._gmx.hostName;
                var pt = getParams(prop);
                if (hosts[hostName]) { hosts[hostName].push(pt); }
                else { hosts[hostName] = [pt]; }
            }
        }
    }
    return hosts;
};

var chkVersion = function (layer, callback) {
    var processResponse = function(res) {
        if (res && res.Status === 'ok' && res.Result) {
            for (var i = 0, len = res.Result.length; i < len; i++) {
                var item = res.Result[i],
                    id = item.properties.name;
                for (var key in layers) {
                    var curLayer = layers[key];
                    if (curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) { curLayer.updateVersion(item); }
                }
            }
        }
        lastLayersStr = '';
        if (callback) { callback(res); }
    };

    if (document.body && !gmxAPIutils.isPageHidden()) {
        var hosts = getRequestParams(layer),
            chkHost = function(hostName) {
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
                    var timeStamp = Date.now();
                    for (var key in layers) {
                        var _gmx = layers[key]._gmx;
                        if (_gmx.hostName === hostName) { _gmx._stampVersionRequest = timeStamp; }
                    }
                }
            };
        for (var hostName in hosts) {
            chkHost(hostName);
        }
    }
};

var layersVersion = {

    remove: function(layer) {
        delete layers[layer._leaflet_id];
        var _gmx = layer._gmx;
        _gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
    },

    add: function(layer) {
        var id = layer._leaflet_id;
        if (id in layers) {
            return;
        }

        var _gmx = layer._gmx,
            prop = _gmx.properties;
        if ('LayerVersion' in prop) {
            layers[id] = layer;
            _gmx._chkVersion = function () {
                chkVersion(layer);
            };
            _gmx.dataManager.on('chkLayerUpdate', _gmx._chkVersion);

            layersVersion.start();
            if (!_gmx._stampVersionRequest || _gmx._stampVersionRequest < Date.now() - 19000 || !isExistsTiles(prop)) {
                if (timeoutID) { clearTimeout(timeoutID); }
                timeoutID = setTimeout(chkVersion, 0);
            }
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
                gmx.properties.GeoProcessing = layerDescription.properties.GeoProcessing;
                gmx.rawProperties = gmx.properties;
                this.fire('versionchange');
                gmx.dataManager.updateVersion(gmx.rawProperties);
            }
        }
    }
});
})();
