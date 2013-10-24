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
    var getTileRasters = function(geoItems) {	// Получить растры КР для тайла
        var def = new gmxDeferred();
		var needLoadRasters = 0;
		var chkReadyRasters = function() {
			if(needLoadRasters < 1) {
				def.resolve();
			}
		}
        geoItems.forEach(function(geo) {
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
                    ,'crossOrigin': 'anonymous'
				});
			}
		})
        chkReadyRasters();
        return def;
	}

	var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth']	// Ключи стилей в canvas
	var styleCanvasKeysLen = styleCanvasKeys.length;
	var lastStyles = {};
	var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
		var ctx = dattr['ctx'];
		var style = dattr['style'];
		var parsedStyleKeys = item['propHiden']['parsedStyleKeys'] || {};
		for (var i = 0; i < styleCanvasKeysLen; i++)
		{
			var key = styleCanvasKeys[i];
			var valKey = parsedStyleKeys[key] || style[key];
			if(key in style && valKey !== lastStyles[key]) {
                ctx[key] = lastStyles[key] = valKey;
            }
        }
        if(style.dashes) {
            var dashes = style.dashes;
            var dashOffset = style.dashOffset || 0;
            if ('setLineDash' in ctx) {     //Chrome
                ctx.setLineDash(dashes);
                //ctx.lineDashOffset(dashOffset);
            } else {                        //Firefox
                ctx.mozDash = dashes;
                ctx.mozDashOffset = dashOffset;
            }            
        }

        if(parsedStyleKeys['canvasPattern']) {
            ctx.fillStyle = ctx.createPattern(parsedStyleKeys['canvasPattern']['canvas'], "repeat");
        } else if(style['linearGradient']) {
            var rgr = style['linearGradient'];
            var x1 = rgr['x1Function'] ? rgr['x1Function'](prop) : rgr['x1'];
            var y1 = rgr['y1Function'] ? rgr['y1Function'](prop) : rgr['y1'];
            var x2 = rgr['x2Function'] ? rgr['x2Function'](prop) : rgr['x2'];
            var y2 = rgr['y2Function'] ? rgr['y2Function'](prop) : rgr['y2'];
            var lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
            for (var i = 0; i < style['linearGradient']['addColorStop'].length; i++)
            {
                var arr1 = style['linearGradient']['addColorStop'][i];
                var arrFunc = style['linearGradient']['addColorStopFunctions'][i];
                var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]);
                var p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2]));
                var p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
                lineargrad.addColorStop(p0, p1);
            }
            ctx.fillStyle = lineargrad; 
        }
    }

    var getObjectsByPoint = function(arr, point) {    // Получить верхний обьект по координатам mouseClick
        var mInPixel = gmx['mInPixel'];
        var mercPoint = [point[0] / mInPixel, point[1] / mInPixel];
        var bounds = gmxAPIutils.bounds([mercPoint]);
        var getMarkerPolygon = function(mb, dx, dy) {    // Получить полигон по bounds маркера
            var center = [(mb.min.x + mb.max.x) / 2, (mb.min.y + mb.max.y) / 2];
            return [
                [center[0] - dx, center[1] - dy]
                ,[center[0] - dx, center[1] + dy]
                ,[center[0] + dx, center[1] + dy]
                ,[center[0] + dx, center[1] - dy]
                ,[center[0] - dx, center[1] - dy]
            ];
        }
        
        for (var i = arr.length - 1; i >= 0; i--) {
            var geoItem = arr[i],
                idr = geoItem.id,
                item = gmx.vectorTilesManager.getItem(idr),
                parsedStyle = item.propHiden.parsedStyleKeys,
                lineWidth = parsedStyle.lineWidth || 0,
                dx = (parsedStyle.sx + lineWidth) / mInPixel,
                dy = (parsedStyle.sy + lineWidth) / mInPixel;
            if (!geoItem.bounds.intersects(bounds, dx, dy)) continue;

            var type = geoItem.geometry.type;
            var coords = geoItem.geometry.coordinates;
            if(type === 'LINESTRING') {
                if (!gmxAPIutils.chkPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) continue;
            } else if(type === 'MULTILINESTRING') {
                var flag = false;
                for (var j = 0, len = coords.length; j < len; j++) {
                    if (gmxAPIutils.chkPointInPolyLine(mercPoint, lineWidth / mInPixel, coords[j])) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) continue;
            } else {
                if(type === 'MULTIPOLYGON') {
                    if(parsedStyle.marker) {
                        coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                        if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                    } else {
                        var flag = false;
                        for (var j = 0, len = coords.length; j < len; j++) {
                            if (gmxAPIutils.isPointInPolygonArr(mercPoint, coords[j][0])) {
                                flag = true;
                                break;
                            }
                        }
                        if (!flag) continue;
                    }
                } else if(type === 'POLYGON') {
                    coords = (parsedStyle.marker ? getMarkerPolygon(geoItem.bounds, dx, dy) : coords[0]);
                    if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                } else if(type === 'POINT') {
                    coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                    if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                }
            }
            
            return { 'id': idr
                ,'properties': item.properties
                ,'geometry': geoItem.geometry
                ,'crs': 'EPSG:3395'
                ,'latlng': L.Projection.Mercator.unproject({'x':bounds.min.x, 'y':bounds.min.y})
            };
		}
        return null;
    }

    this.drawTile = function() {
        var geoItems = gmx.vectorTilesManager.getItems(gmxTilePoint, zoom); //call each time because of possible items updates
        var itemsLength = geoItems.length;
        if(itemsLength === 0) {
			if (tKey in layer._tiles) {
				layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
			}
			return 0;
		}

        geoItems = geoItems.sort(gmx.sortItems);
		var tile = layer.gmxGetCanvasTile(tilePoint);
		tile.id = gmxTileKey;

        var ctx = tile.getContext('2d');
        var dattr = {
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };

        var chkMousePos = function (e) {
            var rect = tile.getBoundingClientRect();
            var pos = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
            };
            var pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
            var empty = (pixel[0] + pixel[1] + pixel[2] + pixel[3] === 0);
            return (empty ? null : pos);
        };

        if(layer.hasEventListeners('mousemove') || layer.hasEventListeners('click')) {
            var lastCursor = null;

            L.DomEvent.addListener(tile, 'mousemove', function (e) {
                var pos = chkMousePos(e);
                var cursor = '';    // default
                if(pos) {
                    cursor = 'pointer';
                    layer.fire('mousemove', {'originalEvent': e, 'pixel': pos});
                }
                if(lastCursor !== cursor) tile.style.cursor = cursor;
                lastCursor = cursor;
            });
            
            L.DomEvent.addListener(tile, 'click', function (e) {
                if(zoom !== gmx.currentZoom) return;
                L.DomEvent.stopPropagation(e);
                var pixel = chkMousePos(e);
                if(!pixel) return;
                var item = getObjectsByPoint(geoItems, [dattr.tpx + pixel.x, dattr.tpy - pixel.y]);
                if(item) layer.fire('click', {'originalEvent': e, 'latlng': item.latlng, 'pixel': pixel, 'item': item});
            });
/*
            L.DomEvent.addListener(layer._map._tilePane, 'mousemove', function (e) {
                if(zoom !== gmx.currentZoom || e.target.id !== tile.id || layer._map._gmxMoveTime > new Date().getTime()) return;
console.log('cccccc', zoom, layer._map._gmxMoveTime, new Date().getTime());
                //var p1 = layer._map.containerPointToLayerPoint([e.clientX, e.clientY]);
                var pos = chkMousePos(e);
                var cursor = '';    // default
                if(pos) {
                    cursor = 'pointer';
                    layer.fire('mousemove', {'originalEvent': e, 'pixel': pos});
                    //L.DomEvent.stopPropagation(e);
                    layer._map._gmxMoveTime = new Date().getTime() + 1000;
console.log('___', zoom, layer._map._gmxMoveTime);
                }
                if(lastCursor !== cursor) tile.style.cursor = cursor;
                lastCursor = cursor;
            });
            
            L.DomEvent.addListener(layer._map._tilePane, 'click', function (e) {
                if(zoom !== gmx.currentZoom || e.target.id !== tile.id) return;
                L.DomEvent.stopPropagation(e);
                var pixel = chkMousePos(e);
                //var pixel = chkMousePos({'clientX': p1.x, 'clientY': p1.y});
                if(!pixel) return;
                var item = getObjectsByPoint(geoItems, [dattr.tpx + pixel.x, dattr.tpy - pixel.y]);
                if(item) layer.fire('click', {'originalEvent': e, 'latlng': item.latlng, 'pixel': pixel, 'item': item});
            });
*/
        }
        
        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            for (var i = 0; i < itemsLength; i++) {
                var geoItem = geoItems[i],
                    idr = geoItem.id,
                    item = gmx.vectorTilesManager.getItem(idr);

                dattr.style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties
				setCanvasStyle(item, dattr);

                if (rasters[idr]) {
                    dattr.bgImage = rasters[idr];
                }

                var geom = geoItem.geometry;
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    if(dattr.style.image) { // отображение мультиполигона маркером
                        dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
						gmxAPIutils.pointToCanvas(dattr);
                    } else {
                        var coords = geom.coordinates;
                        if(geom.type === 'POLYGON') coords = [coords];
                        var coordsToCanvas = function(func) {
                            for (var j = 0, len1 = coords.length; j < len1; j++) {
                                var coords1 = coords[j];
                                dattr.hiddenLines = geoItem.hiddenLines[j];
                                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                    dattr.coords = coords1[j1];
                                    func(dattr);
                                }
                            }
                        }
                        if(dattr.style.strokeStyle && dattr.style.lineWidth) {
                            coordsToCanvas(gmxAPIutils.polygonToCanvas);
                        }
                        if(dattr.style.fill) {
                            coordsToCanvas(gmxAPIutils.polygonToCanvasFill);
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
            getTileRasters(geoItems).done(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
		return itemsLength;
    }
}