L.gmx = L.gmx || {};

var DEFAULT_HOSTNAME = 'maps.kosmosnimki.ru';
var normalizeHostname = function(hostName) {
    var parsedHost = L.gmxUtil.parseUri(hostName || DEFAULT_HOSTNAME);
    
    hostName = parsedHost.hostOnly + parsedHost.directory;
    
    if (hostName[hostName.length-1] === '/') {
        hostName = hostName.substring(0, hostName.length - 1);
    }
    
    return hostName;
}

//Build in layer classes
L.gmx._layerClasses = {
    'Raster': L.gmx.RasterLayer,
    'Vector': L.gmx.VectorLayer
};


L.gmx.addLayerClass = function(type, layerClass) {
    L.gmx._layerClasses[type] = layerClass;
};

L.gmx.loadLayer = function(mapID, layerID, options) {

    var promise = new L.gmx.Deferred(),
        layerParams = {
            mapID: mapID,
            layerID: layerID
        };

    options = options || {};

    for (var p in options) {
        layerParams[p] = options[p];
    }

    var hostName = normalizeHostname(options.hostName || DEFAULT_HOSTNAME);
    layerParams.hostName = hostName;

    gmxMapManager.getMap(hostName, options.apiKey, mapID).then(
        function() {
            var layerInfo = gmxMapManager.findLayerInfo(hostName, mapID, layerID);

            if (!layerInfo) {
                promise.reject('There is no layer ' + layerID + ' in map ' + mapID);
                return;
            }

            //to know from what host the layer was loaded
            layerInfo.properties.hostName = hostName;

            var layer = L.gmx.createLayer(layerInfo, layerParams);

            if (layer) {
                promise.resolve(layer);
            } else {
                promise.reject('Unknown type of layer ' + layerID);
            }
        },
        function(response) {
            promise.reject('Can\'t load layer ' + layerID + ' from map ' + mapID + ': ' + response.error);
        }
    );

    return promise;
};

L.gmx.loadLayers = function(layers, globalOptions) {
    var defs = layers.map(function(layerInfo) {
        var options = L.extend({}, globalOptions, layerInfo.options);
        return L.gmx.loadLayer(layerInfo.mapID, layerInfo.layerID, options);
    });

    return L.gmx.Deferred.all.apply(null, defs);
};

L.gmx.loadMap = function(mapID, options) {
    options = options || {};

    var def = new L.gmx.Deferred(),
        hostName = normalizeHostname(options.hostName || DEFAULT_HOSTNAME);

    gmxMapManager.getMap(hostName, options.apiKey, mapID).then(function(mapInfo) {
        var loadedMap = new gmxMap(mapInfo, options);

        var curZIndex = 0,
            vectorLayersOffset = 2000000,
            layer;

        if (options.leafletMap || options.setZIndex) {
            for (var l = loadedMap.layers.length - 1; l >= 0; l--) {
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
        def.reject('Can\'t load map ' + mapID + ' from ' + hostName + ': ' + response.ErrorInfo.ErrorMessage);
    });
    return def;
};

L.gmx.createLayer = function(layerInfo, options) {
    if (!layerInfo) { layerInfo = {}; }
    if (!layerInfo.properties) { layerInfo.properties = {type: 'Vector'}; }

    var type = layerInfo.properties.ContentID || layerInfo.properties.type || 'Vector',
        layer;

    if (type in L.gmx._layerClasses) {
        layer = new L.gmx._layerClasses[type](options);
        layer = layer.initFromDescription(layerInfo);
    }

    return layer;
};
