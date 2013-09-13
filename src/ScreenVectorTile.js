//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    
	var gmx = layer._gmx;
	var tKey = tilePoint.x + ':' + tilePoint.y;
    var showRaster = 'rasterBGfunc' in gmx.attr &&
        (zoom >= gmx.attr.minZoomRasters);

    var rasters = {},
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
		gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;
    
    //load all missing rasters for items we are going to render
    var getTileRasters = function(items) {	// Получить растры КР для тайла
        var def = new gmxDeferred();
		var needLoadRasters = 0;
		var chkReadyRasters = function() {
			if(needLoadRasters < 1) {
				def.resolve();
			}
		}
        items.forEach(function(geo) {
            var idr = geo.id;
            if (idr in rasters) return;
            var url = '';
            var itemImageProcessingHook = null;
            var item = gmx.vectorTilesManager.getItem(idr);
			if(gmx.attr['IsRasterCatalog']) {
				if(!item.properties['GMX_RasterCatalogID'] && item.properties['sceneid']) {
					url = 'http://search.kosmosnimki.ru/QuickLookImage.ashx?id=' + item.properties['sceneid'];
					itemImageProcessingHook = gmx.attr['imageQuicklookProcessingHook'];
				} else {		// RasterCatalog
					url = gmx.attr.rasterBGfunc(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z, idr)
				}
			} else if(item.properties['urlBG']) {
				url = item.properties['urlBG'];
				itemImageProcessingHook = gmx.attr['imageQuicklookProcessingHook'];
			} else if(gmx.attr['Quicklook']) {
				url = gmx.attr.rasterBGfunc(item);
				itemImageProcessingHook = gmx.attr['imageProcessingHook'];
			}
			if(url) {
				needLoadRasters++;

				gmxImageLoader.push({
					'callback' : function(img) {
						if(itemImageProcessingHook) {
							rasters[idr] = itemImageProcessingHook({
								'image': img,
								'geoItem': geo,
								'item': item,
								'gmxTilePoint': gmxTilePoint
							});
						} else {
							rasters[idr] = img;
						}
						needLoadRasters--;
						chkReadyRasters();
					}
					,'onerror' : function() {
						needLoadRasters--;
						chkReadyRasters();
					}
					,'src': url
				});
			}
		})
        chkReadyRasters();
        return def;
	}

	var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth']	// Ключи стилей в canvas
	var styleCanvasKeysLen = styleCanvasKeys.length;
	var lastStyles = {};
	var setCanvasStyle = function(ctx, style) {				// Установка canvas стилей
		for (var i = 0; i < styleCanvasKeysLen; i++)
		{
			var name = styleCanvasKeys[i];
			if(name in style && style[name] !== lastStyles[name]) ctx[name] = lastStyles[name] = style[name];
		}
	}

    this.drawTile = function() {
        var items = gmx.vectorTilesManager.getItems(gmxTilePoint, zoom); //call each time because of possible items updates
        var itemsLength = items.length;
        if(itemsLength === 0) {
			if (tKey in layer._tiles) {
				layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
			}
			gmx.vectorTilesManager.off(gmx.tileSubscriptions[gmxTileKey]);
			delete gmx.tileSubscriptions[gmxTileKey];
			return 0;
		}

        items = items.sort(gmx.sortItems);
		var tile = layer.gmxGetCanvasTile(tilePoint);
		tile.id = gmxTileKey;
        var ctx = tile.getContext('2d');
        var dattr = {
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
        
        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            for (var i = 0; i < itemsLength; i++) {
                var it = items[i],
                    idr = it.id;

                dattr.style = gmx.styleManager.getObjStyle(idr); //call each time because of possible style can depends from item properties
				setCanvasStyle(ctx, dattr.style);

                if (rasters[idr]) {
                    dattr.bgImage = rasters[idr];
                }

                var geom = it.geometry;
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    var coords = geom.coordinates;
                    for (var j = 0, len1 = coords.length; j < len1; j++) {
                        var coords1 = coords[j];
                        dattr.hiddenLines = it.hiddenLines[j];
                        if(geom.type === 'MULTIPOLYGON') {
                            for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                dattr.coords = coords1[j1];
                                gmxAPIutils.polygonToCanvas(dattr);
                            }
                        } else {
                            dattr.coords = coords1;
                            gmxAPIutils.polygonToCanvas(dattr);
                        }
                    }
                } else if (geom.type === 'LINESTRING' || geom.type === 'MULTILINESTRING') {	// Отрисовка геометрии линий
                    var coords = geom.coordinates;
                    if(geom.type === 'MULTILINESTRING') {
                        for (var j = 0, len1 = coords.length; j < len1; j++) {
                            dattr.coords = coords[j];
                            gmxAPIutils.lineToCanvas(dattr);
                        }
					} else {
						dattr.coords = coords;
						gmxAPIutils.lineToCanvas(dattr);
                    }
                } else if (geom.type === 'POINT' || geom.type === 'MULTIPOINT') {	// Отрисовка геометрии точек
                    var coords = geom.coordinates;
                    if(geom.type === 'MULTIPOINT') {
                        for (var j = 0, len1 = coords.length; j < len1; j++) {
                            dattr.coords = coords[j];
                            gmxAPIutils.pointToCanvas(dattr);
                        }
					} else {
						dattr.coords = coords;
						gmxAPIutils.pointToCanvas(dattr);
                    }
                }
            }
        }
        
        if (showRaster) {
            getTileRasters(items).done(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
		return itemsLength;
    }
}