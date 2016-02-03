/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    //serverHost should be host only string like 'maps.kosmosnimki.ru' without any slashes or 'http://' prefixes
    getMap: function(serverHost, apiKey, mapName, skipTiles) {
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
                        skipTiles: skipTiles || 'None', // All, NotVisible, None
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
                }, def.reject);
            }, def.reject);
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

L.gmx.gmxMapManager = gmxMapManager;
