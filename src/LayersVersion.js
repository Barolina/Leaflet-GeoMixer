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
        Version: isExistsTiles(prop) ? prop.LayerVersion : 0
    };
};
var getRequestParams = function(layer) {
    var hosts = {},
        prop;
    if (layer) {
        prop = layer instanceof L.gmx.DataManager ? layer.options : layer._gmx.properties;
        hosts[prop.hostName] = [getParams(prop)];
    } else {
        for (var id in layers) {
            var obj = layers[id];
            if (obj.options.chkUpdate) {
                prop = obj._gmx.properties;
                var hostName = prop.hostName,
                    pt = getParams(prop);
                if (hosts[hostName]) { hosts[hostName].push(pt); }
                else { hosts[hostName] = [pt]; }
            }
        }
    }
    return hosts;
};

var chkVersion = function (layer, callback) {
    var layerID = null,
        prop;

    if (layer) {
        prop = layer instanceof L.gmx.DataManager ? layer.options : layer._gmx.properties;
        layerID = prop.name;
    }
    var processResponse = function(res) {
        if (res && res.Status === 'ok' && res.Result) {
            for (var i = 0, len = res.Result.length; i < len; i++) {
                var item = res.Result[i];
                prop = item.properties;
                var id = prop.name,
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
            prop = _gmx.properties;

        delete layers[prop.name];
        _gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
    },

    add: function(layer) {
        var _gmx = layer._gmx,
            prop = _gmx.properties;

        if (prop.name in layers) {
            return;
        }

        if ('LayerVersion' in prop) {
            layers[prop.name] = layer;
            _gmx._chkVersion = function () {
                chkVersion(layer);
            };
            _gmx.dataManager.on('chkLayerUpdate', _gmx._chkVersion);

            layersVersion.start();
            if (!isExistsTiles(prop)) {
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
                gmx.dataManager.updateVersion(layerDescription);
                L.extend(gmx.properties, layerDescription.properties);
                gmx.rawProperties = gmx.properties;
                this.fire('versionchange');
            }
        }
    }
});
})();
