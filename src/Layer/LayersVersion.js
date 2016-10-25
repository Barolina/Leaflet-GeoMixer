(function() {
var delay = 20000,
    layers = {},
    dataManagersLinks = {},
    script = '/Layer/CheckVersion.ashx',
    intervalID = null,
    timeoutID = null,
    lastLayersStr = '';

var isExistsTiles = function(prop) {
    var tilesKey = prop.Temporal ? 'TemporalTiles' : 'tiles';
    return tilesKey in prop;
};
var getParams = function(prop, dm, layerDateInterval) {
    var pt = {
        Name: prop.name,
        Version: isExistsTiles(prop) ? prop.LayerVersion : -1
    };
	if (dm && (prop.UseTiles === false || window.gmxSkipTiles === 'NotVisible')) {
		var maxDateInterval = dm.getMaxDateInterval(),
			beginDate = maxDateInterval.beginDate || layerDateInterval.beginDate,
			endDate = maxDateInterval.endDate || layerDateInterval.endDate;
        if (beginDate) { pt.dateBegin = Math.floor(beginDate.getTime() / 1000); }
        if (endDate) { pt.dateEnd = Math.floor(endDate.getTime() / 1000); }
    }
    return pt;
};
var getRequestParams = function(layer) {
    var hosts = {},
        prop, hostName, dm, layerDateInterval;
    if (layer) {
        if (layer instanceof L.gmx.DataManager) {
			dm = layer;
			prop = dm.options;
		} else {
			prop = layer._gmx.properties;
			dm = layer._gmx.dataManager;
			layerDateInterval = layer._gmx;
		}
        hostName = prop.hostName || layer._gmx.hostName;
		hosts[hostName] = [getParams(prop, dm, layerDateInterval)];
    } else {
        var skipItems = {};
        for (var id in layers) {
            var obj = layers[id],
				isDataManager = obj instanceof L.gmx.DataManager;
            if (obj.options.chkUpdate || isDataManager) {
				dm = isDataManager ? obj : obj._gmx.dataManager;
                prop = isDataManager ? obj.options : obj._gmx.properties;
				layerDateInterval = isDataManager ? obj : obj._gmx;
                hostName = prop.hostName || obj._gmx.hostName;
                var pt = getParams(prop, dm, layerDateInterval),
                    key = pt.Name + pt.Version;
                if (!skipItems[key]) {
                    if (hosts[hostName]) { hosts[hostName].push(pt); }
                    else { hosts[hostName] = [pt]; }
                }
                skipItems[key] = true;
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
				if (layer && layer._gmx.properties.name === id && 'updateVersion' in layer) { layer.updateVersion(item); }
                for (var key in layers) {
                    var curLayer = layers[key];
					if (layer && layer === curLayer) { continue; }
                    if (curLayer._gmx && curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) { curLayer.updateVersion(item); }
					else {
						curLayer.updateVersion(item.properties);
					}
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
                        var it = layers[key];
                        var options = it._gmx || it.options;
                        if (options.hostName === hostName) { options._stampVersionRequest = timeStamp; }
                    }
                }
            };
        for (var hostName in hosts) {
            chkHost(hostName);
        }
    }
};

var layersVersion = {

    addDataManager: function(dataManager) {
        var id = dataManager.options.name;
        if (id in layers) {
            return;
		}
		dataManager.on('chkLayerUpdate', chkVersion.bind(dataManager));
		layers[id] = dataManager;
    },

    removeDataManager: function(dataManager) {
        var id = dataManager.options.name;
        if (id in layers) {
			dataManager.off('chkLayerUpdate', chkVersion.bind(dataManager));
			delete layers[id];
		}
    },

    remove: function(layer) {
        delete layers[layer._leaflet_id];
        var _gmx = layer._gmx,
			pOptions = layer.options.parentOptions;
		if (pOptions) {
			var pId = pOptions.name;
			if (dataManagersLinks[pId]) {
				delete dataManagersLinks[pId][_gmx.properties.name];
				if (!Object.keys(dataManagersLinks[pId]).length) {
					layersVersion.removeDataManager(_gmx.dataManager);
					delete dataManagersLinks[pId];
				}
			}
		} else {
			_gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
		}
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
			var pOptions = layer.options.parentOptions;
			if (pOptions) {
				var pId = pOptions.name;
				layersVersion.addDataManager(_gmx.dataManager);
				if (!dataManagersLinks[pId]) { dataManagersLinks[pId] = {}; }
				dataManagersLinks[pId][prop.name] = layer;
			}

            layersVersion.start();
            if (!_gmx._stampVersionRequest || _gmx._stampVersionRequest < Date.now() - 19000 || !isExistsTiles(prop)) {
				layersVersion.now();
            }
        }
    },

    chkVersion: chkVersion,

    now: function() {
		if (timeoutID) { clearTimeout(timeoutID); }
		timeoutID = setTimeout(chkVersion, 0);
    },

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
