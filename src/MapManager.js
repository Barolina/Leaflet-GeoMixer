/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    getMap: function(serverHost, apiKey, mapName) {
        var maps = this._maps;
        if (!maps[serverHost] || !maps[serverHost][mapName]) {
            var def = new gmxDeferred();
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = def;
            
            gmxSessionManager.requestSessionKey(serverHost, apiKey).then(function(sessionKey) {
                gmxAPIutils.requestJSONP(
                    "http://" + serverHost + "/TileSender.ashx", 
                    {
                        WrapStyle: 'func',
                        key: sessionKey,
                        MapName: mapName,
                        ModeKey: 'map'
                    }
                ).then(function(json) {
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
    findLayerInfo: function(serverHost, mapID, layerID) {
        var hostMaps = this._maps[serverHost];
        var data = hostMaps && hostMaps[mapID] && hostMaps[mapID].getFulfilledData();
		
		var resLayerInfo;
		
		gmxMapManager.iterateLayers(data && data[0], function(layerInfo) {
			if (layerInfo.properties.name === layerID) {
				resLayerInfo = layerInfo;
			}
		})
        
        return resLayerInfo;
    },
    _maps: {} //Deferred for each map. Structure maps[serverHost][mapID]
}

gmxMapManager.iterateLayers = function(treeInfo, callback) {
	var iterate = function(arr) {
        for (var i=0, len=arr.length; i<len; i++) {
            var layer = arr[i];
            
            if(layer.type === 'group') {
                iterate(layer.content.children);
            } else if (layer.type === 'layer') {
                callback(layer.content);
            }
        }
    }
    
    treeInfo && iterate(treeInfo.children);
}

var gmxMap = function(mapInfo, commonLayerOptions) {
    this.layers = [];
    this.layersByTitle = {};
    this.layersByID = {};
    
    var _this = this;
	
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

		layer.initFromDescription(layerInfo);
		
		_this.layers.push(layer);
		_this.layersByTitle[props.title] = layer;
		_this.layersByID[props.name] = layer;
	});
}