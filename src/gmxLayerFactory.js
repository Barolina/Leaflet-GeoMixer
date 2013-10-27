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
                    styles: [{
						MinZoom: ph.properties.styles[0].MinZoom,
						MaxZoom: ph.properties.styles[0].MaxZoom,
						RenderStyle: {outline: {thickness: 0}, fill: {opacity: 0}}
					}]
                };
                
                layer = new L.TileLayer.gmxVectorLayer(layerParams);
                layer.initFromDescription({geometry: ph.geometry, properties: vectorProperties});
                
                var gmx = layer._gmx;
				
				var bounds = gmxAPIutils.bounds(ph.geometry.coordinates[0]);
				
                gmx.attr.rasterBGfunc = function(x, y, z) {
				
					var tileSize = gmxAPIutils.tileSizes[z];
					var minx = x * tileSize;
					var maxx = minx + tileSize;
					if (maxx < bounds.min.x) {
						x += Math.pow(2, z);
					}
					else if (minx > bounds.max.x) {
						x -= Math.pow(2, z);
					}
                
                    var tileSenderPrefix = "http://" + gmx.hostName + "/" + 
                        "TileSender.ashx?ModeKey=tile" + 
                        "&key=" + encodeURIComponent(gmx.sessionKey) +
                        "&MapName=" + gmx.mapName +
                        "&LayerName=" + gmx.layerName;
                
                    return tileSenderPrefix + 
                        "&z=" + z + 
                        "&x=" + x + 
                        "&y=" + y;
                }
                
                var vectorDataProvider = {load: function(x, y, z, v, s, d, callback) {
                    callback([{id: 777, properties: {ogc_fid: 777}, geometry: ph.geometry}]);
                }}
                
                gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, 0,   0, 1, 0, -1, -1));
                gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, 0,  -1, 1, 0, -1, -1));
                gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, -1,  0, 1, 0, -1, -1));
                gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, -1, -1, 1, 0, -1, -1));
                
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
