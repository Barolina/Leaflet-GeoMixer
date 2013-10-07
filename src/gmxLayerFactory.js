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
    
    var layer = new L.TileLayer.gmxVectorLayer(layerParams);
    
    layer.initPromise.done(function() {
        promise.resolve(layer);
    })
    
    return promise;
}
