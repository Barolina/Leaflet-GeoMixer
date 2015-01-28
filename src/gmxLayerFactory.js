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
    
    var hostName = options.hostName || DEFAULT_HOSTNAME;
    
    gmxMapManager.getMap(hostName, options.apiKey, mapID).then(
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
        hostName = options.hostName || DEFAULT_HOSTNAME;

    gmxMapManager.getMap(hostName, options.apiKey, mapID).then(function(mapInfo) {
        var loadedMap = new gmxMap(mapInfo, options);
        
        var curZIndex = 0,
            vectorLayersOffset = 2000000,
            layer;
            
        if (options.leafletMap || options.setZIndex) {
            for (var l = loadedMap.layers.length - 1; l >= 0 ; l--) {
                layer = loadedMap.layers[l];
                if (options.setZIndex) {
                    var zIndex = curZIndex++;
                    if (layer._gmx.properties.type === 'Vector') {
                        zIndex += vectorLayersOffset;
                    }
                    layer.options.zIndex = zIndex;
                }
                
                if (options.leafletMap && loadedMap.layers[l]._gmx.properties.visible) {
                    layer.addTo(options.leafletMap);
                }
                
            }
        }
        
        def.resolve(loadedMap);
    },
    function(response) {
        def.reject("Can't load map " + mapID + " from " + hostName + ": " + response.ErrorInfo.ErrorMessage);
    });
    return def;
}


L.gmx.createLayer = function(layerInfo, options) {
    if (!layerInfo) layerInfo = {};
    if (!layerInfo.properties) layerInfo.properties = { type: 'Vector'};
    var layer = layerInfo.properties.type === 'Raster'
        ? new L.gmx.RasterLayer(options)
        : new L.gmx.VectorLayer(options)
    ;

    layer.initFromDescription(layerInfo);
    return layer;
}
