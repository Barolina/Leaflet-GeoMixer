//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    
	var gmx = layer._gmx,
        tKey = tilePoint.x + ':' + tilePoint.y,
        showRaster = 'rasterBGfunc' in gmx && (zoom >= gmx.minZoomRasters),
        rasters = {},
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
		gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;

	var loadRasterRecursion = function(gtp, urlFunction, callback) {
		var rUrl = urlFunction(gtp);

		var onError = function() {
			gmx.badTiles[rUrl] = true;
			if (gtp.z > 1) {
				// запрос по раззумливанию растрового тайла
				var nextGtp = {
					x: Math.floor(gtp.x/2),
					y: Math.floor(gtp.y/2),
					z: gtp.z - 1
				}
				loadRasterRecursion(nextGtp, urlFunction, callback);
			} else {
				callback(null);
			}
		};
		
		gmx.badTiles = gmx.badTiles || {};
		if(gmx.badTiles[rUrl]) {
			onError();
			return;
		}

		gmxImageLoader.push({
			src: rUrl
			,zoom: gtp.z
			,callback: function(imageObj) {
				callback(imageObj, gtp);
			}
			,onerror: onError
            ,crossOrigin: 'anonymous'
		});
	}

    //load missing rasters for one item
    var getItemRasters = function(geo) {
        var idr = geo.id;
        if (idr in rasters) return;
        var def = new gmxDeferred(),
            properties = geo.item.properties,
            item = gmx.vectorTilesManager.getItem(idr),
            ww = gmxAPIutils.worldWidthMerc,
            shiftX = Number(gmx.shiftXfield ? properties[gmx.shiftXfield] : 0) % ww,
            shiftY = Number(gmx.shiftYfield ? properties[gmx.shiftYfield] : 0);
        var url = '',
            itemImageProcessingHook = null,
            item = gmx.vectorTilesManager.getItem(idr),
            isTiles = false;
        if (gmx.IsRasterCatalog) {  // RasterCatalog
            if(!item.properties.GMX_RasterCatalogID && gmx.quicklookBGfunc) {
                url = gmx.quicklookBGfunc(item)
                itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
            } else {
                isTiles = true;
            }
        } else if(item.properties.urlBG) {
            url = item.properties.urlBG;
            itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
        } else if(gmx.Quicklook) {
            url = gmx.rasterBGfunc(item);
            itemImageProcessingHook = gmx.imageProcessingHook;
        }
        if(isTiles) {
            var arr = [[gmxTilePoint.x, gmxTilePoint.y]];
            if(shiftX || shiftY) {
                var bounds = geo.bounds,
                    tileSize = 256 / gmx.mInPixel,
                    px = shiftX * gmx.mInPixel,
                    py = shiftY * gmx.mInPixel,
                    deltaX = Math.floor(0.5 + px % 256),            // shift on tile in pixel
                    deltaY = Math.floor(0.5 + py % 256),
                    tminX = gmxTilePoint.x - shiftX / tileSize,     // by screen tile
                    tminY = gmxTilePoint.y - shiftY / tileSize,
                    rminX = Math.floor(tminX),
                    rmaxX = rminX + (tminX === rminX ? 0 : 1),
                    rminY = Math.floor(tminY),
                    rmaxY = rminY + (tminY === rminY ? 0 : 1),
                    minX = Math.floor((bounds.min.x - shiftX) / tileSize),  // by geometry bounds
                    maxX = Math.floor((bounds.max.x - shiftX) / tileSize),
                    minY = Math.floor((bounds.min.y - shiftY) / tileSize),
                    maxY = Math.floor((bounds.max.y - shiftY) / tileSize),
                    arr = [];

                if (rminX < minX) rminX = minX;
                if (rmaxX > maxX) rmaxX = maxX;
                if (rminY < minY) rminY = minY;
                if (rmaxY > maxY) rmaxY = maxY;
                for (var j = rminY; j <= rmaxY; j++) {
                    for (var i = rminX; i <= rmaxX; i++) {
                        arr.push([i, j, deltaX, deltaY, tminX, tminY]);
                    }
                }
            }
            var chkLoad = function() {
                var def1 = new gmxDeferred(), cnt = 0;
                var needLoadRasters = arr.length;
                var chkReadyRasters = function() {
                    if(needLoadRasters < 1) {
                        def1.resolve(arr);
                    }
                }
                for (var i = 0, len = arr.length; i < len; i++) {
                    (function() {
                        var p = arr[i];
                        loadRasterRecursion({
                                z: gmxTilePoint.z
                                ,x: p[0]
                                ,y: p[1]
                            },
                            function(gtp) {
                                return gmx.rasterBGfunc(gtp.x, gtp.y, gtp.z, item);
                            },
                            function(img, imageGtp) {
                                needLoadRasters--;
                                
                                if (!img) {
                                    chkReadyRasters();
                                    return;
                                }

                                if( itemImageProcessingHook ) {
                                    img = itemImageProcessingHook({
                                        gmx: gmx,
                                        image: img,
                                        geoItem: geo,
                                        item: item,
                                        gmxTilePoint: imageGtp
                                    });
                                }

                                if (imageGtp.z !== gmxTilePoint.z) {
                                    var pos = gmxAPIutils.getTilePosZoomDelta(gmxTilePoint, gmxTilePoint.z, imageGtp.z);
                                    if(pos.size < 0.00390625) {// меньше 1px
                                        chkReadyRasters();
                                        return;
                                    }

                                    var canvas = document.createElement('canvas');
                                    canvas.width = canvas.height = 256;
                                    var ptx = canvas.getContext('2d');
                                    ptx.drawImage(img, Math.floor(pos.x), Math.floor(pos.y), pos.size, pos.size, 0, 0, 256, 256);
                                    p.push(canvas);
                                } else {
                                    p.push(img);
                                }
                                chkReadyRasters();
                            }
                        );
                    })();
                }
                return def1;
            }
            chkLoad().then(function(arr) {
                if (shiftX === 0 && shiftY === 0) {
                    rasters[idr] = arr[0][2];
                } else {
                    var canvas = document.createElement('canvas');
                    canvas.width = 256, canvas.height = 256;
                    var ptx = canvas.getContext('2d'),
                        count = 0;
                    for (var i = 0, len = arr.length; i < len; i++) {
                        if(arr[i].length < 7) continue;
                        var p = arr[i],
                            w = p[2] + (p[2] < 0 ? 256 : 0),
                            h = p[3] + (p[3] < 0 ? 256 : 0),
                            sx = 0, sw = 256 - w, dx = w, dw = sw;
                        if(p[4] > p[0]) {
                            sx = sw, sw = w, dx = 0, dw = sw;
                        }
                       if(sx === 256 || sw < 1) continue;

                        var sy = h, sh = 256 - h, dy = 0, dh = sh;
                        if(p[5] > p[1]) {
                            sy = 0, dy = sh, sh = h, dh = sh;
                        }
                       if(sy === 256 || sh < 1) continue;
                        ptx.drawImage(p[6], sx, sy, sw, sh, dx, dy, dw, dh);
                        count++;
                    }
                    if (count < 1) canvas = null;
                    rasters[idr] = canvas;
                }
                def.resolve();
            });
        } else {
            // for quicklook
            gmxImageLoader.push({
                callback : function(img) {
                    if(itemImageProcessingHook) {
                        rasters[idr] = itemImageProcessingHook({
                            gmx: gmx,
                            image: img,
                            geoItem: geo,
                            item: item,
                            gmxTilePoint: gmxTilePoint
                        });
                    } else {
                        rasters[idr] = img;
                    }
                    def.resolve();
                }
                ,onerror : function() {
                    def.resolve();
                }
                ,src: url
                ,crossOrigin: 'anonymous'
            });
        }
        return def;
    }

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
            needLoadRasters++;
            getItemRasters(geo).then(function() {
                needLoadRasters--;
                chkReadyRasters();
            });
		})
        chkReadyRasters();
        return def;
	}

	var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth']	// Ключи стилей в canvas
	var styleCanvasKeysLen = styleCanvasKeys.length;
	var lastStyles = {};
	var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
		var ctx = dattr.ctx;
		var style = dattr.style;
		var gmx = dattr.gmx;

		var parsedStyleKeys = item.propHiden.parsedStyleKeys || {};
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

        if(parsedStyleKeys.canvasPattern) {
            ctx.fillStyle = ctx.createPattern(parsedStyleKeys.canvasPattern.canvas, "repeat");
        } else if(style.linearGradient) {
            var rgr = style.linearGradient;
            var x1 = rgr.x1Function ? rgr.x1Function(prop) : rgr.x1;
            var y1 = rgr.y1Function ? rgr.y1Function(prop) : rgr.y1;
            var x2 = rgr.x2Function ? rgr.x2Function(prop) : rgr.x2;
            var y2 = rgr.y2Function ? rgr.y2Function(prop) : rgr.y2;
            var lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
            for (var i = 0, len = style.linearGradient.addColorStop.length; i < len; i++)
            {
                var arr1 = style.linearGradient.addColorStop[i];
                var arrFunc = style.linearGradient.addColorStopFunctions[i];
                var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]);
                var p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2]));
                var p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
                lineargrad.addColorStop(p0, p1);
            }
            ctx.fillStyle = lineargrad; 
        }
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

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            //var labels = {};
            for (var i = 0; i < itemsLength; i++) {
                var geoItem = geoItems[i],
                    idr = geoItem.id,
                    item = gmx.vectorTilesManager.getItem(idr),
                    style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties

                dattr.style = style.RenderStyle;
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
                        dattr.flagPixels = false;
                        var coords = geom.coordinates;
                        if(geom.type === 'POLYGON') coords = [coords];
                        var hiddenLines = geoItem.hiddenLines;

                        var flagPixels = geoItem.pixels && geoItem.pixels.z === gmx.currentZoom;
                        var cacheArr = [];
                        var coordsToCanvas = function(func) {
                            var out = null;
                            if(flagPixels) {
                                coords = geoItem.pixels.coords;
                                hiddenLines = geoItem.pixels.hidden;
                                dattr.flagPixels = flagPixels;
                            } else {
                                out = { coords: [], hidden: [] };
                            }
                            var pixels = [], hidden = [];
                            for (var j = 0, len1 = coords.length; j < len1; j++) {
                                var coords1 = coords[j];
                                var hiddenLines1 = hiddenLines[j];
                                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                    dattr.coords = coords1[j1];
                                    dattr.hiddenLines = hiddenLines1[j1];
                                    var res = func(dattr);
                                    if(out && res) {
                                        pixels.push(res.coords);
                                        hidden.push(res.hidden);
                                    }
                                }
                            }
                            if(out) {
                                out.coords.push(pixels);
                                out.hidden.push(hidden);
                            }
                            return out;
                        }
                        if(dattr.style.strokeStyle && dattr.style.lineWidth) {
                            var pixels = coordsToCanvas(gmxAPIutils.polygonToCanvas, flagPixels);
                            if(pixels) {
                                geoItem.pixels = pixels;
                                geoItem.pixels.z = gmx.currentZoom;
                                flagPixels = true;
                            }
                        }
                        if(dattr.style.fill || dattr.bgImage) {
                            if(flagPixels) {
                                coords = geoItem.pixels.coords;
                                hiddenLines = geoItem.pixels.hidden;
                            }
                            coordsToCanvas(gmxAPIutils.polygonToCanvasFill, flagPixels);
                        }
                    }
                    // if(dattr.style.label) {
                        // labels[idr] = {
                            // item: item
                            // ,style: dattr.style
                        // };
                    // }
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
            /*
            // TODO: Need labels manager
            for (var idr in labels) {
                var label = labels[idr];
                var item = label.item;
                dattr.style = label.style;
                dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
                var txt = item.properties[dattr.style.label.field];
                var parsedStyleKeys = item.propHiden.parsedStyleKeys.label || {};
                //dattr.extentLabel = gmxAPIutils.getLabelSize(txt, parsedStyleKeys);
                gmxAPIutils.setLabel(txt, dattr, parsedStyleKeys);
            }*/
        }
        
        if (showRaster) {
            getTileRasters(geoItems).then(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }
		return itemsLength;
    }
}