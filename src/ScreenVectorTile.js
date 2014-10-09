//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    var gmx = layer._gmx,
        tKey = tilePoint.x + ':' + tilePoint.y,
        zKey = zoom + ':' + tKey,
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
        tbounds = gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z),
        gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y,
        showRaster = 'rasterBGfunc' in gmx && (zoom >= gmx.minZoomRasters),
        rasters = {},
        currentDrawDef = null;

    gmx.badTiles = gmx.badTiles || {};
        
    var loadTileRecursive = function(gtp, urlFunction) {
        var curRequest = null,
            def = new gmxDeferred(function() {
                curRequest && curRequest.cancel();
            });
        
        var tryLoad = function(gtp) {
            var rUrl = urlFunction(gtp);
            
            var tryHigherLevelTile = function() {
                if (gtp.z > 1) {
                    tryLoad({
                        x: Math.floor(gtp.x/2),
                        y: Math.floor(gtp.y/2),
                        z: gtp.z - 1
                    })
                } else {
                    def.reject();
                }
            }
            
            if (gmx.badTiles[rUrl]) {
                tryHigherLevelTile();
                return;
            }
            
            curRequest = gmxImageLoader.push(rUrl, {
                layerID: gmx.layerID,
                zoom: gtp.z,
                crossOrigin: 'anonymous'
            });
            
            curRequest.then(
                function(imageObj) {
                    curRequest = null;
                    def.resolve(imageObj, gtp);
                },
                function() {
                    gmx.badTiles[rUrl] = true;
                    
                    tryHigherLevelTile();
                }
            )
        }
        
        tryLoad(gtp);
        return def;
    }
 
    //load missing rasters for one item
    var getItemRasters = function(geo) {
        var properties = geo.arr,
            dataOption = geo.dataOption || {},
            idr = properties[0],
            item = gmx.dataManager.getItem(idr),
            def = new gmxDeferred(function() {
                mainRasterLoader && mainRasterLoader.cancel();
            }),
            mainRasterLoader = null;

        if (idr in rasters) {
            def.resolve();
            return def;
        }

        var ww = gmxAPIutils.worldWidthMerc,
            shiftX = Number(gmx.shiftXfield ? gmx.getPropItem(properties, gmx.shiftXfield) : 0) % ww,
            shiftY = Number(gmx.shiftYfield ? gmx.getPropItem(properties, gmx.shiftYfield) : 0),
            GMX_RasterCatalogID = gmx.getPropItem(properties, 'GMX_RasterCatalogID'),
            urlBG = gmx.getPropItem(properties, 'urlBG'),
            url = '',
            itemImageProcessingHook = null,
            isTiles = false;
        if (gmx.IsRasterCatalog) {  // RasterCatalog
            if(!GMX_RasterCatalogID && gmx.quicklookBGfunc) {
                url = gmx.quicklookBGfunc(item)
                itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
            } else {
                isTiles = true;
            }
        } else if(urlBG) {
            url = urlBG;
            itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
        } else if(gmx.Quicklook) {
            url = gmx.rasterBGfunc(item);
            itemImageProcessingHook = gmx.imageProcessingHook;
        }
        if(isTiles) {
            var arr = [[gmxTilePoint.x, gmxTilePoint.y]];
            if(shiftX || shiftY) {
                var bounds = dataOption.bounds,
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
                var itemRastersPromise = new gmxDeferred(function() {
                        for (var k = 0; k < recursiveLoaders.length; k++) {
                            recursiveLoaders[k].cancel();
                        }
                    }), 
                    len = arr.length, 
                    cnt = len,
                    chkReadyRasters = function() {
                        if(cnt < 1) itemRastersPromise.resolve(arr);
                    };
                    
                var recursiveLoaders = [];
                    
                for (var i = 0; i < len; i++) {
                    var p = arr[i];
                    var loader = loadTileRecursive({
                            z: gmxTilePoint.z
                            ,x: p[0]
                            ,y: p[1]
                        }, function(gtp) {
                            return gmx.rasterBGfunc(gtp.x, gtp.y, gtp.z, item);
                        }
                    );

                    loader.then(function(img, imageGtp) {
                        cnt--;

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
                            if(pos.size < 1/256) {// меньше 1px
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
                    }, function() {
                        cnt--;
                        chkReadyRasters();
                    });
                    
                    recursiveLoaders.push(loader);
                }
                return itemRastersPromise;
            }
            mainRasterLoader = chkLoad();
            
            mainRasterLoader.then(function(parr) {
                var len = parr.length;
                if (len) {
                    if (shiftX === 0 && shiftY === 0) {
                        if (parr[0][2]) rasters[idr] = parr[0][2];
                    } else {
                        var canvas = document.createElement('canvas');
                        canvas.width = 256, canvas.height = 256;
                        var ptx = canvas.getContext('2d'),
                            count = 0;
                        for (var i = 0; i < len; i++) {
                            if(parr[i].length < 7) continue;
                            var p = parr[i],
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
                }
                def.resolve();
            });
        } else {
            // for quicklook
            mainRasterLoader = gmxImageLoader.push(url, {
                layerID: gmx.layerID,
                crossOrigin: 'anonymous'
            });
            
            mainRasterLoader.then(
                function(img) {
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
                },
                function() {
                    def.resolve();
                }
            )
        }
        return def;
    }

    //load all missing rasters for items we are going to render
    var getTileRasters = function(geoItems) {
        var def = new gmxDeferred(function() {
                
                itemPromises.forEach(function(promise) {
                    promise && promise.cancel();
                });
            }),
            needLoadRasters = 0,
            chkReadyRasters = function() {
                if(needLoadRasters < 1) {
                    def.resolve();
                }
            };
            
        var itemPromises = geoItems.map(function(geo) {
            var dataOption = geo.dataOption || {},
                skipRasters = false;

            if (gmx.styleHook) {
                var idr = geo.arr[0];
                geo.styleExtend = gmx.styleHook(
                    gmx.dataManager.getItem(idr),
                    gmx.lastHover && idr === gmx.lastHover.id
                );
                skipRasters = geo.styleExtend.skipRasters;
            }

            if (!skipRasters && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                needLoadRasters++;
                var itemRasterPromise = getItemRasters(geo);
                itemRasterPromise.then(function() {
                    needLoadRasters--;
                    chkReadyRasters();
                });
                return itemRasterPromise;
            }
        });
        chkReadyRasters();

        return def;
    }

    var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth'], // Ключи стилей в canvas
        styleCanvasKeysLen = styleCanvasKeys.length,
        lastStyles = {};
    var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
        var ctx = dattr.ctx,
            style = dattr.style,
            itemOptions = dattr.itemOptions;
            // styleExtend = dattr.styleExtend;

        var parsedStyleKeys = itemOptions.parsedStyleKeys || {};
        for (var i = 0; i < styleCanvasKeysLen; i++) {
            var key = styleCanvasKeys[i],
                valKey = parsedStyleKeys[key] || style[key];
                // TODO: when add Geomixer styles array for users
                //valKey = styleExtend[key] || parsedStyleKeys[key] || style[key];
            if(key in style && valKey !== lastStyles[key]) {
                ctx[key] = lastStyles[key] = valKey;
            }
        }
        if(style.dashes) {
            var dashes = style.dashes,
                dashOffset = style.dashOffset || 0;
            if ('setLineDash' in ctx) {     //Chrome
                ctx.setLineDash(dashes);
                //ctx.lineDashOffset(dashOffset);
            } else {                        //Firefox
                ctx.mozDash = dashes;
                ctx.mozDashOffset = dashOffset;
            }            
        }

        if(parsedStyleKeys.canvasPattern) {
            ctx.fillStyle = lastStyles.fillStyle = ctx.createPattern(parsedStyleKeys.canvasPattern.canvas, "repeat");
        } else if(style.linearGradient) {
            var rgr = style.linearGradient,
                x1 = rgr.x1Function ? rgr.x1Function(prop) : rgr.x1,
                y1 = rgr.y1Function ? rgr.y1Function(prop) : rgr.y1,
                x2 = rgr.x2Function ? rgr.x2Function(prop) : rgr.x2,
                y2 = rgr.y2Function ? rgr.y2Function(prop) : rgr.y2,
                lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
            for (var i = 0, len = style.linearGradient.addColorStop.length; i < len; i++)
            {
                var arr1 = style.linearGradient.addColorStop[i],
                    arrFunc = style.linearGradient.addColorStopFunctions[i],
                    p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]),
                    p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2])),
                    p1 = gmxAPIutils.dec2color(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
                lineargrad.addColorStop(p0, p1);
            }
            ctx.fillStyle = lastStyles.fillStyle = lineargrad; 
        }
    }

    var getStyleBounds = function(gmxTilePoint) {
        var maxStyleSize = gmx.styleManager.getMaxStyleSize(),
            mercSize = 2 * maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize);
    }

    this.drawTile = function(data) {
    
        if (currentDrawDef) {
            currentDrawDef.cancel();
        }
    
        var def = new gmxDeferred(function() {
                tileRastersPromise && tileRastersPromise.cancel();
                //tileRastersPromise = null;
                rasters = {};
            }),
            tileRastersPromise = null;
        
        def.always(function() {
            currentDrawDef = null;
        })
        
        currentDrawDef = def;

        if (!layer._map) {
            def.resolve();
            return def;
        };
        
        var geoItems = data.added,
            itemsLength = geoItems.length;
        if(itemsLength === 0) {
            if (tKey in layer._tiles) {
                layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
            }
            def.resolve();
            return def;
        }
        var tile = layer.gmxGetCanvasTile(tilePoint),
            ctx = tile.getContext('2d'),
            dattr = {
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
            
        tile.id = zKey;
        if (gmx.sortItems) geoItems = geoItems.sort(gmx.sortItems);

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            var drawItem = function(geoItem) {
                var arr = geoItem.arr,
                    idr = arr[0],
                    item = gmx.dataManager.getItem(idr);
                if (!item) return;
                var dataOption = geoItem.dataOption,
                    style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties
                dattr.item = item;
                if (gmx.styleHook && !geoItem.styleExtend) {
                    geoItem.styleExtend = gmx.styleHook(item, gmx.lastHover && idr === gmx.lastHover.id);
                }
                dattr.styleExtend = geoItem.styleExtend || {};
                dattr.style = style;
                dattr.itemOptions = gmx.styleManager.getItemOptions(item);
                setCanvasStyle(item, dattr);

                var geom = arr[arr.length-1];
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    if(dattr.style.image) { // отображение мультиполигона маркером
                        dattr.coords = [(dataOption.bounds.min.x + dataOption.bounds.max.x)/2, (dataOption.bounds.min.y + dataOption.bounds.max.y)/2];
                        gmxAPIutils.pointToCanvas(dattr);
                    } else {
                        dattr.flagPixels = false;
                        if (!dataOption.pixels) dataOption.pixels = {};
                        var hiddenLines = dataOption.hiddenLines || [],
                            coords = geom.coordinates,
                            pixels_map = {},
                            flagPixels = false;

                        if(geom.type === 'POLYGON') coords = [coords];
                        var coordsToCanvas = function(func, flagFill) {
                            var out = null;
                            if(flagPixels) {
                                coords = pixels_map.coords;
                                hiddenLines = pixels_map.hidden;
                                dattr.flagPixels = flagPixels;
                            } else {
                                out = { coords: [], hidden: [] };
                                var pixels = [], hidden = [];
                            }
                            for (var j = 0, len1 = coords.length; j < len1; j++) {
                                var coords1 = coords[j];
                                var hiddenLines1 = hiddenLines[j] || [];
                                if (out) {
                                    var pixels1 = [], hidden1 = [];
                                }
                                ctx.beginPath();
                                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                    dattr.coords = coords1[j1];
                                    dattr.hiddenLines = hiddenLines1[j1] || [];
                                    var res = func(dattr);
                                    if (out && res) {
                                        pixels1.push(res.coords);
                                        hidden1.push(res.hidden);
                                    }
                                }
                                ctx.closePath();
                                if (flagFill) ctx.fill();
                                if (out) {
                                    pixels.push(pixels1);
                                    hidden.push(hidden1);
                                }
                            }
                            if(out) {
                                out.coords = pixels;
                                out.hidden = hidden;
                            }
                            return out;
                        }
                        if(dattr.style.strokeStyle && dattr.style.lineWidth) {
                            var pixels = coordsToCanvas(gmxAPIutils.polygonToCanvas);
                            if(pixels) {
                                pixels_map = pixels;
                                pixels_map.z = gmx.currentZoom;
                                dataOption.pixels = pixels_map;
                                flagPixels = true;
                            }
                        }
                        if (rasters[idr]) {
                            dattr.bgImage = rasters[idr];
                        }
                        if (dattr.styleExtend.skipRasters) {
                            delete dattr.bgImage;
                        }
                        if ((dattr.style.fill || dattr.bgImage) &&
                            tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                            if(flagPixels) {
                                coords = pixels_map.coords;
                                hiddenLines = pixels_map.hidden;
                            }
                            ctx.save();
                            if(dattr.bgImage) {
                                var pattern = ctx.createPattern(dattr.bgImage, "no-repeat");
                                ctx.fillStyle = pattern;
                                style.bgImage = true;
                            }
                            coordsToCanvas(gmxAPIutils.polygonToCanvasFill, true);
                            ctx.restore();
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
            for (var i = 0; i < itemsLength; i++) {
                drawItem(geoItems[i]);
            }
            def.resolve();
        }

        if (showRaster) {
            tileRastersPromise = getTileRasters(geoItems);
            tileRastersPromise.then(doDraw, def.reject.bind(def)); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }

        return def;
    }

    this.cancel = function() {
        currentDrawDef && currentDrawDef.cancel();
    }
}