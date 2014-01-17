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
        var maps = this._maps;
        var data = maps[serverHost] && maps[serverHost][mapName] && maps[serverHost][mapName].getFulfilledData();
        
        if (!data) return;
        
        var findLayer = function(arr) {
            for(var i=0, len=arr.length; i<len; i++) {
                var layer = arr[i];
                
                if(layer.type === 'group') {
					var res = findLayer(layer.content.children);
                    if (res) return res;
				} else if(layer.type === 'layer' && layerName === layer.content.properties.name) {
                    return layer.content;
                }
            }
        }
        
        return findLayer(data[0].children);
    },
    _maps: {} //Deferred for each map. Structure maps[serverHost][mapName]
}