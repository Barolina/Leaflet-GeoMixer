/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    getMap: function(serverHost, apiKey, mapName) {
        var maps = this._maps;
        if (!maps[serverHost] || !maps[serverHost][mapName]) {
            var def = new gmxDeferred();
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = def;
            
            gmxSessionManager.requestSessionKey(serverHost, apiKey).done(function(sessionKey) {
                gmxAPIutils.requestJSONP(
                    "http://" + serverHost + "/TileSender.ashx", 
                    {
                        WrapStyle: 'func',
                        key: sessionKey,
                        MapName: mapName,
                        ModeKey: 'map'
                    }
                ).done(function(json) {
                    if (json && json.Status === 'ok' && json.Result) {
                        def.resolve(json.Result);
                    } else {
                        def.reject(json);
                    }
                });
            })
        }
        return maps[serverHost][mapName];
    },
    findLayerInfo: function(serverHost, mapName, layerName) {
        var hostMaps = this._maps[serverHost];
        var data = hostMaps && hostMaps[mapName] && hostMaps[mapName].getFulfilledData();
        
        return data && data.layersByName[layerName];
    },
    _maps: {} //Deferred for each map. Structure maps[serverHost][mapName]
}

var gmxMap = function(mapInfo) {
    this.layers = [];
    this.layersByTitle = {};
    this.layersByName = {};
    
    var _this = this;
    
    var interateLayer = function(arr) {
        for(var i=0, len=arr.length; i<len; i++) {
            var layer = arr[i];
            
            if(layer.type === 'group') {
                var res = interateLayer(layer.content.children);
            } else if (layer.type === 'layer') {
                var content = layer.content;
                _this.layers.push(content);
                _this.layersByTitle[content.properties.title] = content;
                _this.layersByName[content.properties.name] = content;
            }
        }
    }
    
    interateLayer(data[0].children);
}