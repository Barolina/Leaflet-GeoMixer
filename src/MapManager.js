/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    //serverHost should be host only string like 'maps.kosmosnimki.ru' without any slashes or 'http://' prefixes
    getMap: function(serverHost, apiKey, mapName) {
        var maps = this._maps;
        if (!maps[serverHost] || !maps[serverHost][mapName]) {
            var def = new L.gmx.Deferred();
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {promise: def};

            gmxSessionManager.requestSessionKey(serverHost, apiKey).then(function(sessionKey) {
                gmxAPIutils.requestJSONP(
                    'http://' + serverHost + '/TileSender.ashx',
                    {
                        WrapStyle: 'func',
                        key: sessionKey,
                        MapName: mapName,
                        ModeKey: 'map'
                    }
                ).then(function(json) {
                    if (json && json.Status === 'ok' && json.Result) {
                        json.Result.properties.hostName = serverHost;
                        def.resolve(json.Result);
                    } else {
                        def.reject(json);
                    }
                });
            });
        }
        return maps[serverHost][mapName].promise;
    },

    //we will (lazy) create index by layer name to speed up multiple function calls
    findLayerInfo: function(serverHost, mapID, layerID) {
        var hostMaps = this._maps[serverHost],
            mapInfo = hostMaps && hostMaps[mapID];

        if (!mapInfo) {
            return null;
        }

        if (mapInfo.layers) {
            return mapInfo.layers[layerID];
        }

        var serverData = mapInfo.promise.getFulfilledData();

        if (!serverData) {
            return null;
        }

        mapInfo.layers = {};

        //create index by layer name
        gmxMapManager.iterateLayers(serverData[0], function(layerInfo) {
            mapInfo.layers[layerInfo.properties.name] = layerInfo;
        });

        return mapInfo.layers[layerID];
    },
    iterateLayers: function(treeInfo, callback) {
        var iterate = function(arr) {
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

                if (layer.type === 'group') {
                    iterate(layer.content.children);
                } else if (layer.type === 'layer') {
                    callback(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo.children);
    },
    _maps: {} //Promise for each map. Structure: maps[serverHost][mapID]: {promise:, layers:}
};

var gmxMap = function(mapInfo, commonLayerOptions) {
    this.layers = [];
    this.layersByTitle = {};
    this.layersByID = {};

    var _this = this;

    this.properties = L.extend({}, mapInfo.properties);
    this.properties.BaseLayers = this.properties.BaseLayers ? JSON.parse(this.properties.BaseLayers) : [];
    this.rawTree = mapInfo;

    gmxMapManager.iterateLayers(mapInfo, function(layerInfo) {
        var props = layerInfo.properties,
            layerOptions = L.extend({
                mapName: mapInfo.properties.name,
                layerID: props.name
            }, commonLayerOptions),
            layer;

        if (props.type === 'Vector') {
            layer = new L.gmx.VectorLayer(layerOptions);
        } else {
            layer = new L.gmx.RasterLayer(layerOptions);
        }

        layerInfo.properties.hostName = mapInfo.properties.hostName;
        layer.initFromDescription(layerInfo);

        _this.addLayer(layer);
    });
};

gmxMap.prototype.addLayer = function(layer) {
    var props = layer.getGmxProperties();

    this.layers.push(layer);
    this.layersByTitle[props.title] = layer;
    this.layersByID[props.name] = layer;

    return this;
};

gmxMap.prototype.removeLayer = function(layer) {
    var props = layer.getGmxProperties();

    for (var i = 0; i < this.layers.length; i++) {
        if (this.layers[i].getGmxProperties().name === props.name) {
            this.layers.splice(i, 1);
            break;
        }
    }
    
    delete this.layersByTitle[props.title];
    delete this.layersByID[props.name];

    return this;
};

gmxMap.prototype.addLayersToMap = function(leafletMap) {
    for (var l = this.layers.length - 1; l >= 0; l--) {
        var layer = this.layers[l];
        if (layer._gmx.properties.visible) {
            layer.addTo(leafletMap);
        }
    }

    return this;
};
