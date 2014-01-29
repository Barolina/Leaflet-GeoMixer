L.gmx = L.gmx || {};

L.gmx.loadLayer = function(mapName, layerName, params) {

    var promise = new gmxDeferred();
    
    var layerParams = {
        mapName: mapName,
        layerName: layerName
    }
    
    params = params || {};
    
    for (var p in params) {
        layerParams[p] = params[p];
    }
    
    var hostName = params.hostName || 'maps.kosmosnimki.ru';
    
    gmxMapManager.getMap(hostName, params.apiKey, mapName).done(
        function(mapInfo) {
            var layerInfo = gmxMapManager.findLayerInfo(hostName, mapName, layerName),
                layer;
            
            if (!layerInfo) {
                promise.reject("There are no layer " + layerName + " in map " + mapName);
                return;
            }
            
            if (layerInfo.properties.type === 'Vector') {
                layer = new L.TileLayer.gmxVectorLayer(layerParams);
            } else {
                layer = new L.TileLayer.gmxRasterLayer(layerParams);
            }
            
			layer.initFromDescription(layerInfo);
            layer.initPromise.done(function() {
                promise.resolve(layer);
            })
            
        },
        function(response) {
            promise.reject("Can't load layer " + layerName + " form map " + mapName + ": " + response.error);
        }
    );

    return promise;
}

L.gmx.loadLayers = function(layers, globalParams) {
    var defs = layers.map(function(layerInfo) {
        var params = L.extend({}, params, layerInfo.params);
        return L.gmx.loadLayer(layerInfo.map, layerInfo.layer, params)
    });
    
    return gmxDeferred.all.apply(null, defs);
}