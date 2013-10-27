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
        function() {
            var ph = gmxMapManager.findLayerInfo(hostName, mapName, layerName);
            
            var layer;
            
            if (ph.properties.type === 'Vector') {
                layer = new L.TileLayer.gmxVectorLayer(layerParams);
            } else {
                layer = new L.TileLayer.gmxRasterLayer(layerParams);
            }
            
			layer.initFromDescription(ph);
            layer.initPromise.done(function() {
                promise.resolve(layer);
            })
            
        },
        function(ph) {
            console.error('Error: ' + mapName + ' - ' + ph.error);
        }
    );

    return promise;
}
