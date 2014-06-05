//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    var gmx = layer._gmx,
        tKey = tilePoint.x + ':' + tilePoint.y,
        showRaster = 'rasterBGfunc' in gmx && (zoom >= gmx.minZoomRasters),
        rasters = {},
        tileRastersPromise = null,
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
        tbounds = gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z),
        gmxTileKey = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;

    var loadRasterRecursion = function(gtp, urlFunction, callback) {
        var rUrl = urlFunction(gtp);

        var onError = function(badUrl) {
            gmx.badTiles[badUrl] = true;
            if (gtp.z > 1) {
                // запрос по раззумливанию растрового тайла
                var nextGtp = {
                    x: Math.floor(gtp.x/2),
                    y: Math.floor(gtp.y/2),
                    z: gtp.z - 1
                };
                loadRasterRecursion(nextGtp, urlFunction, callback);
            } else {
                callback(null);
            }
        };

        gmx.badTiles = gmx.badTiles || {};
        if(gmx.badTiles[rUrl]) {
            onError(rUrl);
            return;
        }

        gmxImageLoader.push({
            src: rUrl
            ,layerID: gmx.layerID
            ,zoom: gtp.z
            ,callback: function(imageObj) {
                callback(imageObj, gtp);
            }
            ,onerror: onError
            ,crossOrigin: 'anonymous'
        });
    }

    var getPropItem = function(prop, key) {
        return gmx.tileAttributeIndexes ? prop[gmx.tileAttributeIndexes[key]] : '';
    }

    //load missing rasters for one item
    var getItemRasters = function(geo) {
        var idr = geo[0],
            item = gmx.vectorTilesManager.getItem(idr),
            def = new gmxDeferred();
        if (idr in rasters) return def;

        var properties = geo.item.properties,
            ww = gmxAPIutils.worldWidthMerc,
            shiftX = Number(gmx.shiftXfield ? getPropItem(properties, gmx.shiftXfield) : 0) % ww,
            shiftY = Number(gmx.shiftYfield ? getPropItem(properties, gmx.shiftYfield) : 0),
            GMX_RasterCatalogID = getPropItem(item.properties, 'GMX_RasterCatalogID'),
            urlBG = getPropItem(item.properties, 'urlBG'),
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
                var itemRastersPromise = new gmxDeferred(), len = arr.length, cnt = len;
                var chkReadyRasters = function() {
                    if(cnt < 1) itemRastersPromise.resolve(arr);
                };
                for (var i = 0; i < len; i++) {
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
                        }
                    );
                }
                return itemRastersPromise;
            }
            chkLoad().then(function(parr) {
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
                ,layerID: gmx.layerID
                ,src: url
                ,crossOrigin: 'anonymous'
            });
        }
        return def;
    }

    //load all missing rasters for items we are going to render
    var getTileRasters = function(geoItems) {
        var def = new gmxDeferred(),
            needLoadRasters = 0,
            chkReadyRasters = function() {
                if(needLoadRasters < 1) {
                    def.resolve();
                }
            };
        var itemPromises = geoItems.map(function(geo) {
            var isSkipRasters  = geo.item.styleExtend && geo.item.styleExtend.skipRasters;
            if (!isSkipRasters && tbounds.intersects(geo.bounds, -1, -1)) {
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

        def.then(null, function() {
            itemPromises.forEach(function(promise) { if (promise) promise.reject() });
        });
        return def;
    }

    var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth'], // Ключи стилей в canvas
        styleCanvasKeysLen = styleCanvasKeys.length,
        lastStyles = {};
    var setCanvasStyle = function(item, dattr) {				// Установка canvas стилей
        var ctx = dattr.ctx,
            style = dattr.style,
            gmx = dattr.gmx;

        var parsedStyleKeys = item.options.parsedStyleKeys || {};
        for (var i = 0; i < styleCanvasKeysLen; i++) {
            var key = styleCanvasKeys[i],
                valKey = parsedStyleKeys[key] || style[key];
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
            ctx.fillStyle = ctx.createPattern(parsedStyleKeys.canvasPattern.canvas, "repeat");
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
                    p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
                lineargrad.addColorStop(p0, p1);
            }
            ctx.fillStyle = lineargrad; 
        }
    }

    var getStyleBounds = function(gmxTilePoint) {
        var maxStyleSize = gmx.styleManager.getMaxStyleSize(),
            mercSize = 2 * maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize, mercSize, mercSize, mercSize);
    }

    this.drawTile = function() {
        if (!layer._map) return 0;
        var bounds = getStyleBounds(gmxTilePoint),
            geoItems = gmx.vectorTilesManager.getItems(bounds), //call each time because of possible items updates
            itemsLength = geoItems.length;
        if(itemsLength === 0) {
            if (tKey in layer._tiles) {
                layer._tiles[tKey].getContext('2d').clearRect(0, 0, 256, 256);
            }
            return 0;
        }
        geoItems = geoItems.sort(gmx.sortItems);
        var tile = layer.gmxGetCanvasTile(tilePoint),
            ctx = tile.getContext('2d'),
            dattr = {
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
        tile.id = gmxTileKey;

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            var drawItem = function(geoItem) {
                var idr = geoItem[0],
                    item = gmx.vectorTilesManager.getItem(idr),
                    style = gmx.styleManager.getObjStyle(item); //call each time because of possible style can depends from item properties
                dattr.item = item;
                dattr.style = style;
                setCanvasStyle(item, dattr);

                var geom = geoItem[geoItem.length-1];
                if (geom.type === 'POLYGON' || geom.type === 'MULTIPOLYGON') {	// Отрисовка геометрии полигона
                    if(dattr.style.image) { // отображение мультиполигона маркером
                        dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
                        gmxAPIutils.pointToCanvas(dattr);
                    } else {
                        dattr.flagPixels = false;
                        var hiddenLines = geoItem.hiddenLines,
                            coords = geom.coordinates,
                            flagPixels = geoItem.pixels && geoItem.pixels.z === gmx.currentZoom,
                            cacheArr = [];
                        if(geom.type === 'POLYGON') coords = [coords];
                        var coordsToCanvas = function(func, flagFill) {
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
                                var pixels1 = [], hidden1 = [];
                                ctx.beginPath();
                                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                                    dattr.coords = coords1[j1];
                                    dattr.hiddenLines = hiddenLines1[j1];
                                    var res = func(dattr);
                                    if(out && res) {
                                        pixels1.push(res.coords);
                                        hidden1.push(res.hidden);
                                    }
                                }
                                ctx.closePath();
                                if (flagFill) ctx.fill();
                                pixels.push(pixels1);
                                hidden.push(hidden1);
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
                                geoItem.pixels = pixels;
                                geoItem.pixels.z = gmx.currentZoom;
                                flagPixels = true;
                            }
                        }
                        if (rasters[idr]) {
                            dattr.bgImage = rasters[idr];
                        }
                        if (item.styleExtend && item.styleExtend.skipRasters) {
                            delete dattr.bgImage;
                        }
                        if ((dattr.style.fill || dattr.bgImage) &&
                            tbounds.intersects(geoItem.bounds, -1, -1)) {
                            if(flagPixels) {
                                coords = geoItem.pixels.coords;
                                hiddenLines = geoItem.pixels.hidden;
                            }
                            ctx.save();
                            if(dattr.bgImage) {
                                var pattern = ctx.createPattern(dattr.bgImage, "no-repeat");
                                ctx.fillStyle = pattern;
                            }
                            coordsToCanvas(gmxAPIutils.polygonToCanvasFill, true);
                            ctx.restore();
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
            //var labels = {};
            var hoverItems = [];
            for (var i = 0; i < itemsLength; i++) {
                drawItem(geoItems[i]);
                // var it = geoItems[i],
                    // idr = it.id;
                // if (gmx.lastHover && gmx.lastHover.id === idr) hoverItems.push(it);
                // else drawItem(it);
            }
            /*
            for (var i = 0, len = hoverItems.length; i < len; i++) {
                drawItem(hoverItems[i]);
            }
            // TODO: Need labels manager
            for (var idr in labels) {
                var label = labels[idr];
                var item = label.item;
                dattr.style = label.style;
                dattr.coords = [(item.bounds.min.x + item.bounds.max.x)/2, (item.bounds.min.y + item.bounds.max.y)/2];
                var txt = item.properties[dattr.style.label.field];
                var parsedStyleKeys = item.options.parsedStyleKeys.label || {};
                //dattr.extentLabel = gmxAPIutils.getLabelSize(txt, parsedStyleKeys);
                gmxAPIutils.setLabel(txt, dattr, parsedStyleKeys);
            }*/
        }

        if (showRaster) {
            tileRastersPromise = getTileRasters(geoItems);
            tileRastersPromise.then(doDraw); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }

        return itemsLength;
    }

    this.cancel = function() {
        if (tileRastersPromise) tileRastersPromise.reject();
        rasters = {};
    }
}