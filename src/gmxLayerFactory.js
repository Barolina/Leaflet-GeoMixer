L.gmx = L.gmx || {};

L.gmx.loadLayer = function(mapID, layerID, options) {

    var promise = new gmxDeferred();
    
    var layerParams = {
        mapID: mapID,
        layerID: layerID
    }
    
    options = options || {};
    
    for (var p in options) {
        layerParams[p] = options[p];
    }
    
    var hostName = options.hostName || 'maps.kosmosnimki.ru';
    
    gmxMapManager.getMap(hostName, options.apiKey, mapID).then(
        function(mapInfo) {
            var layerInfo = gmxMapManager.findLayerInfo(hostName, mapID, layerID),
                layer;
            
            if (!layerInfo) {
                promise.reject("There are no layer " + layerID + " in map " + mapID);
                return;
            }
            
            if (layerInfo.properties.type === 'Vector') {
                layer = new L.gmx.VectorLayer(layerParams);
            } else {
                layer = new L.gmx.RasterLayer(layerParams);
            }
            
			layer.initFromDescription(layerInfo);
            layer.initPromise.then(function() {
                promise.resolve(layer);
            })
            
        },
        function(response) {
            promise.reject("Can't load layer " + layerID + " from map " + mapID + ": " + response.error);
        }
    );

    return promise;
}

L.gmx.loadLayers = function(layers, globalOptions) {
    var defs = layers.map(function(layerInfo) {
        var options = L.extend({}, globalOptions, layerInfo.options);
        return L.gmx.loadLayer(layerInfo.mapID, layerInfo.layerID, options)
    });
    
    return gmxDeferred.all.apply(null, defs);
}

L.gmx.loadMap = function(mapID, options) {
	var def = new gmxDeferred();
	var hostName = 'maps.kosmosnimki.ru';
	
	options = options || {};
	
	gmxMapManager.getMap(hostName, options.apiKey, mapID).then(function(mapInfo) {
		var loadedMap = new gmxMap(mapInfo);
		
		if (options.leafletMap) {
			for (var l = 0; l < loadedMap.layers.length; l++) {
				if (loadedMap.layers[l]._gmx.properties.visible) {
					loadedMap.layers[l].addTo(options.leafletMap);
				}
			}
		}
		
		def.resolve(loadedMap);
	})
	return def;
}