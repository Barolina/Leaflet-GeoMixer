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
                fromType: props.type,
                identityField: 'ogc_fid',
                GeometryType: 'POLYGON',
                IsRasterCatalog: true,
                RCMinZoomForRasters: props.styles[0].MinZoom,
                visible: props.visible,
                styles: [{
                    MinZoom: props.styles[0].MinZoom,
                    MaxZoom: props.styles[0].MaxZoom,
                    RenderStyle: {outline: {thickness: 0}, fill: {opacity: 100}},
                    HoverStyle: null
                }]
            },
            gmx = this._gmx,
            worldSize = gmxAPIutils.tileSizes[1];

        if (!ph.geometry) {
            ph.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        }

        var objects = [[777, ph.geometry]],
            itemBounds = gmxAPIutils.geoItemBounds(ph.geometry),
            bounds = itemBounds.bounds;

        if (bounds.max.x > worldSize) {
            // for old layers geometry
            var ww2 = 2*worldSize,
                id = 777,
                objects = [],
                coords = ph.geometry.coordinates,
                bboxArr = itemBounds.boundsArr;

            if (ph.geometry.type === 'POLYGON') {
                coords = [coords];
                bboxArr = [bboxArr];
            }
            
            for (var i = 0, len = coords.length; i < len; i++) {
                var it = coords[i],
                    bounds = bboxArr[i][0],
                    arr = it;
                objects.push([id++, {type: 'POLYGON', coordinates: arr}]);
                if (bounds.max.x > worldSize) {
                    for (var j = 0, arr = [], len1 = it.length; j < len1; j++) {
                        var it1 = it[j];
                        for (var j1 = 0, arr1 = [], len2 = it1.length; j1 < len2; j1++) {
                            var it2 = it1[j1];
                            arr1.push([it2[0] - ww2, it2[1]]);
                        }
                        arr.push(arr1);
                    }
                    objects.push([id++, {type: 'POLYGON', coordinates: arr}]);
                }
            }
        }

		L.gmx.VectorLayer.prototype.initFromDescription.call(this, {geometry: ph.geometry, properties: vectorProperties});

        gmx.rasterBGfunc = function(x, y, z) {
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
			callback(objects);
		}}
		gmx.dataManager.addTile(new gmxVectorTile(vectorDataProvider, -0.5,   -0.5, 0, 0, -1, -1));
    }
});