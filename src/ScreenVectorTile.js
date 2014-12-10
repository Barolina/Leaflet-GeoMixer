//Single tile on screen with vector data
var gmxScreenVectorTile = function(layer, tilePoint, zoom) {
    var gmx = layer._gmx,
        tKey = tilePoint.x + ':' + tilePoint.y,
        zKey = zoom + ':' + tKey,
        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
        tbounds = gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z),
        showRaster = 'rasterBGfunc' in gmx && (zoom >= gmx.minZoomRasters),
        rasters = {},
        crossOrigin = gmx.crossOrigin || 'anonymous',
        currentDrawDef = null;

    this.tpx = 256 * gmxTilePoint.x;
    this.tpy = 256 *(1 + gmxTilePoint.y);

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
                crossOrigin: crossOrigin
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
        var properties = geo.properties,
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
                    },
                    skipRasterFunc = function() {
                        cnt--;
                        chkReadyRasters();
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

                        if (!img) {
                            skipRasterFunc();
                            return;
                        }
                        var imgAttr = {
                            gmx: gmx,
                            geoItem: geo,
                            item: item,
                            gmxTilePoint: imageGtp
                        };
                        var prepareItem = function(imageElement) {
                            cnt--;
                            if( itemImageProcessingHook ) {
                                imageElement = itemImageProcessingHook(imageElement, imgAttr);
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
                                ptx.drawImage(imageElement, Math.floor(pos.x), Math.floor(pos.y), pos.size, pos.size, 0, 0, 256, 256);
                                p.push(canvas);
                            } else {
                                p.push(imageElement);
                            }
                            chkReadyRasters();
                        }

                        item.skipRasters = false;
                        if( gmx.imageProcessingHook ) {
                            var resProcessing = gmx.imageProcessingHook(img, {
                                layerID: gmx.layerID,
                                id: item.id,
                                gmxTilePoint: imageGtp
                            });
                            if (resProcessing) {
                                if (resProcessing instanceof HTMLCanvasElement || resProcessing instanceof HTMLImageElement) {
                                    img = resProcessing;
                                } else {
                                    resProcessing.then(prepareItem, skipRasterFunc);
                                    return;
                                }
                            } else {
                                item.skipRasters = true;
                                skipRasterFunc();
                                return;
                            }
                        }
                        prepareItem(img);
                    }, 
                        skipRasterFunc
                    );
                    
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
                crossOrigin: crossOrigin
            });
            
            mainRasterLoader.then(
                function(img) {
                    var imgAttr = {
                        gmx: gmx,
                        geoItem: geo,
                        item: item,
                        gmxTilePoint: gmxTilePoint
                    };
                    var prepareItem = function(imageElement) {
                        if(itemImageProcessingHook) {
                            rasters[idr] = itemImageProcessingHook(imageElement, imgAttr);
                        } else {
                            rasters[idr] = imageElement;
                        }
                        def.resolve();
                    }
                    if( gmx.imageProcessingHook ) {
                        var resProcessing = gmx.imageProcessingHook(img, {
                            layerID: gmx.layerID,
                            id: item.id,
                            gmxTilePoint: gmxTilePoint
                        });
                        if (resProcessing) {
                            if (resProcessing instanceof HTMLCanvasElement || resProcessing instanceof HTMLImageElement) {
                                img = resProcessing;
                            } else {
                                resProcessing.then(prepareItem, def.resolve);
                                return;
                            }
                        } else {
                            item.skipRasters = true;
                            def.resolve();
                            return;
                        }
                    }
                    prepareItem(img);
                },
                def.resolve
            );
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
                var idr = geo.properties[0];
                geo.styleExtend = gmx.styleHook(
                    gmx.dataManager.getItem(idr),
                    gmx.lastHover && idr === gmx.lastHover.id
                );
                skipRasters = geo.styleExtend.skipRasters;
            }

            if (!skipRasters && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                var geom = geo.properties[geo.properties.length-1],
                    coords = geom.coordinates[0];
                if (geom.type === 'MULTIPOLYGON') coords = coords[0];
                var clip = tbounds.clipPolygon(coords);
                if (clip.length) {
                    needLoadRasters++;
                    var itemRasterPromise = getItemRasters(geo);
                    itemRasterPromise.then(function() {
                        needLoadRasters--;
                        chkReadyRasters();
                    });
                    return itemRasterPromise;
                }
            }
        });
        chkReadyRasters();

        return def;
    }

    this.drawTile = function(data) {
    
        if (currentDrawDef) {
            currentDrawDef.cancel();
        }
    
        var def = new gmxDeferred(function() {
                tileRastersPromise && tileRastersPromise.cancel();
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
                tbounds: tbounds,
                rasters: rasters,
                gmx: gmx,
                tpx: 256 * gmxTilePoint.x,
                tpy: 256 *(1 + gmxTilePoint.y),
                ctx: ctx
            };
            
        tile.id = zKey;
        if (gmx.sortItems) geoItems = geoItems.sort(gmx.sortItems);

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            for (var i = 0; i < itemsLength; i++) {
                L.gmxUtil.drawGeoItem(geoItems[i], dattr);
            }
            def.resolve();
            rasters = {}; // clear rasters
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