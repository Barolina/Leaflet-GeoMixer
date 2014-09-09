L.gmx = L.gmx || {};

var DEFAULT_HOSTNAME = 'maps.kosmosnimki.ru';

L.gmx.loadLayer = function(mapID, layerID, options) {

    var promise = new gmxDeferred(),
        layerParams = {
            mapID: mapID,
            layerID: layerID
        };
    
    options = options || {};
    
    for (var p in options) {
        layerParams[p] = options[p];
    }
    
    var hostName = options.hostName || DEFAULT_HOSTNAME,
        apiKey = options.apiKey || '';
    
    gmxMapManager.getMap(hostName, apiKey, mapID).then(
        function() {
            var layerInfo = gmxMapManager.findLayerInfo(hostName, mapID, layerID);
            
            if (!layerInfo) {
                promise.reject("There are no layer " + layerID + " in map " + mapID);
                return;
            }
            var layer = L.gmx.createLayer(layerInfo, layerParams);
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
	options = options || {};

	var def = new gmxDeferred(),
        hostName = options.hostName || DEFAULT_HOSTNAME,
        apiKey = options.apiKey || '';

	gmxMapManager.getMap(hostName, apiKey, mapID).then(function(mapInfo) {
		var loadedMap = new gmxMap(mapInfo, options);
		
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


L.gmx.createLayer = function(layerInfo, options) {
    if (!layerInfo) layerInfo = {};
    if (!layerInfo.properties) layerInfo.properties = { type: 'Vector'};
    if (layerInfo.properties.type === 'Raster') {
        layer = new L.gmx.RasterLayer(options);
    } else {
        layer = new L.gmx.VectorLayer(options);
    }
    
    layer.initFromDescription(layerInfo);
    return layer;
}
