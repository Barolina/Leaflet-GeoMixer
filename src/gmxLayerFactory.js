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
                layer.initFromDescription(ph);
            } else {
                var vectorProperties = {
                    type: 'Vector',
                    identityField: 'ogc_fid',
                    GeometryType: 'POLYGON',
                    IsRasterCatalog: true,
                    RCMinZoomForRasters: ph.properties.styles[0].MinZoom,
                    styles: []
                };
                
                layer = new L.TileLayer.gmxVectorLayer(layerParams);
                layer.initFromDescription({geometry: ph.geometry, properties: vectorProperties});
                
                var gmx = layer._gmx;
                gmx.attr.rasterBGfunc = function(x, y, z) {
                
                    var tileSenderPrefix = "http://" + gmx.hostName + "/" + 
                        "TileSender.ashx?ModeKey=tile" + 
                        "&key=" + encodeURIComponent(gmx.sessionKey) +
                        "&MapName=" + this._gmx.mapName +
                        "&LayerName=" + this._gmx.layerName;
                
                    return tileSenderPrefix + 
                        "&z=" + z + 
                        "&x=" + x + 
                        "&y=" + y;
                }
                
                var vectorDataProvider = {load: function() {
                    return [{id: 777, properties: {ogc_fid: 777}, geometry: ph.geometry}];
                }}
                
                var theTile = new gmxVectorTile(vectorDataProvider, 0, 0, 0, 0, -1, -1);
                gmx.vectorTilesManager.addTile(theTile);
                
                //layer = new L.TileLayer.gmxRasterLayer(layerParams);
            }
            
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
