//Raster layer is just vector layer with the single object and special background tiles
L.gmx.RasterLayer = L.gmx.VectorLayer.extend(
{
	options: {
        clickable: false
    },
    initFromDescription: function(ph){
        var props = ph.properties,
            vectorProperties = {
                type: 'Vector',
                identityField: 'ogc_fid',
                GeometryType: 'POLYGON',
                IsRasterCatalog: true,
                RCMinZoomForRasters: props.styles[0].MinZoom,
                visible: props.visible,
                styles: [{
                    MinZoom: props.styles[0].MinZoom,
                    MaxZoom: props.styles[0].MaxZoom,
                    RenderStyle: {outline: {thickness: 0}, fill: {opacity: 0}},
                    HoverStyle: null
                }]
            };

		L.gmx.VectorLayer.prototype.initFromDescription.call(this, {geometry: ph.geometry, properties: vectorProperties});
		
		var gmx = this._gmx;
		
		var bounds = gmxAPIutils.bounds(ph.geometry.coordinates[0]);
		
		gmx.rasterBGfunc = function(x, y, z) {
		
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
				"&LayerName=" + gmx.layerID;
		
			return tileSenderPrefix + 
				"&z=" + z + 
				"&x=" + x + 
				"&y=" + y;
		}
		
		var vectorDataProvider = {load: function(x, y, z, v, s, d, callback) {
			callback([{id: 777, properties: {ogc_fid: 777}, geometry: ph.geometry}]);
		}}
		
		//there are no z=0 tile in GeoMixer - use 4 tiles with z=1
		gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, 0,   0, 1, 0, -1, -1));
		gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, 0,  -1, 1, 0, -1, -1));
		gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, -1,  0, 1, 0, -1, -1));
		gmx.vectorTilesManager.addTile(new gmxVectorTile(vectorDataProvider, -1, -1, 1, 0, -1, -1));
	}
});