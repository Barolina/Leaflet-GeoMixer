// Single tile on screen with vector data
function ScreenVectorTile(layer, tilePoint, zoom) {
    this.layer = layer;
    this.tilePoint = tilePoint;
    this.zoom = zoom;
    this.gmx = layer._gmx;
    this.tKey = tilePoint.x + ':' + tilePoint.y;
    this.zKey = zoom + ':' + this.tKey;
    var utils = gmxAPIutils;
    this.worldWidthMerc = utils.worldWidthMerc;
    var gmxTilePoint = utils.getTileNumFromLeaflet(tilePoint, zoom);
    this.tbounds = utils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z);
    this.tpx = 256 * gmxTilePoint.x;
    this.tpy = 256 * (1 + gmxTilePoint.y);
    this.gmxTilePoint = gmxTilePoint;

    this.showRaster = 'rasterBGfunc' in layer._gmx && (zoom >= layer._gmx.minZoomRasters);
    this.rasters = {}; //combined and processed canvases for each vector item in tile
    this.currentDrawDef = null;
    layer._gmx.badTiles = layer._gmx.badTiles || {};
    
    //State of raw raster images. Can be used to understand common state of drawing process
    // this.rawRasters = {};
}

ScreenVectorTile.prototype = {
    
    //return promise, which resolves with object {gtp, image}
    _loadTileRecursive: function (gtp, urlFunction) {
        var gmx = this.gmx,
            curRequest = null,
            def = new L.gmx.Deferred(function() {
                if (curRequest) { curRequest.cancel(); }
            }),
            _this = this;

        var tryLoad = function(gtp, crossOrigin) {
            var rUrl = urlFunction(gtp);

            var tryHigherLevelTile = function() {
                if (gtp.z > 1) {
                    tryLoad({
                        x: Math.floor(gtp.x / 2),
                        y: Math.floor(gtp.y / 2),
                        z: gtp.z - 1
                    }, ''); // 'anonymous' 'use-credentials'
                } else {
                    def.reject();
                }
            };

            if (gmx.badTiles[rUrl]) {
                tryHigherLevelTile();
                return;
            }

            if (gmx.rasterProcessingHook) {
                crossOrigin = 'anonymous';
            }

            // _this.rawRasters[rUrl] = 'loading';
            curRequest = L.gmx.imageLoader.push(rUrl, {
                layerID: gmx.layerID,
                zoom: gtp.z,
                crossOrigin: crossOrigin || ''
            });

            curRequest.then(
                function(imageObj) {
                    curRequest = null;
                    // _this.rawRasters[rUrl] = 'loaded';
                    def.resolve({gtp: gtp, image: imageObj});
                },
                function() {
                    gmx.badTiles[rUrl] = true;
                    // _this.rawRasters[rUrl] = 'loaded';
                    tryHigherLevelTile();
                }
            );
        };

        tryLoad(gtp);
        return def;
    },

    _rasterHook: function (attr) {
        var source = attr.sourceTilePoint || attr.destinationTilePoint,
            info = {
                destination: {
                    z: attr.destinationTilePoint.z,
                    x: attr.destinationTilePoint.x,
                    y: attr.destinationTilePoint.y
                },
                source: {
                    z: source.z,
                    x: source.x,
                    y: source.y
                }
            };
        if (attr.url) { info.quicklook = attr.url; }
        return (this.gmx.rasterProcessingHook || this._defaultRasterHook)(
            attr.res, attr.image,
            attr.sx || 0, attr.sy || 0, attr.sw || 256, attr.sh || 256,
            attr.dx || 0, attr.dy || 0, attr.dw || 256, attr.dh || 256,
            info
        );
    },

    // default rasterHook: res - result canvas other parameters as http://www.w3schools.com/tags/canvas_drawimage.asp
    _defaultRasterHook: function (res, image, sx, sy, sw, sh, dx, dy, dw, dh) {
        var ptx = res.getContext('2d');
        ptx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    },

    // get pixels parameters for shifted object
    _getShiftPixels: function (it) {
        var w = it.dx + (it.dx < 0 ? 256 : 0),
            h = it.dy + (it.dy < 0 ? 256 : 0),
            sx = 0, sw = 256 - w, dx = w, dw = sw;
        if (it.tx > it.x) {
            sx = sw; sw = w; dx = 0; dw = sw;
        }
        if (sx === 256 || sw < 1) { return null; }

        var sy = h, sh = 256 - h, dy = 0, dh = sh;
        if (it.ty > it.y) {
            sy = 0; dy = sh; sh = h; dh = sh;
        }
        if (sy === 256 || sh < 1) { return null; }

        return {
            sx: sx, sy: sy, sw: sw, sh: sh,
            dx: dx, dy: dy, dw: dw, dh: dh
        };
    },

    // get tiles parameters for shifted object
    _getShiftTilesArray: function (bounds, shiftX, shiftY) {
        var mInPixel = this.gmx.mInPixel,
            gmxTilePoint = this.gmxTilePoint,
            px = shiftX * mInPixel,
            py = shiftY * mInPixel,
            deltaX = Math.floor(0.5 + px % 256),            // shift on tile in pixel
            deltaY = Math.floor(0.5 + py % 256),
            tileSize = 256 / mInPixel,
            tminX = gmxTilePoint.x - shiftX / tileSize,     // by screen tile
            tminY = gmxTilePoint.y - shiftY / tileSize,
            rminX = Math.floor(tminX),
            rmaxX = rminX + (tminX === rminX ? 0 : 1),
            rminY = Math.floor(tminY),
            rmaxY = rminY + (tminY === rminY ? 0 : 1),
            minX = Math.floor((bounds.min.x - shiftX) / tileSize),  // by geometry bounds
            maxX = Math.floor((bounds.max.x - shiftX) / tileSize),
            minY = Math.floor((bounds.min.y - shiftY) / tileSize),
            maxY = Math.floor((bounds.max.y - shiftY) / tileSize);

        if (rminX < minX) { rminX = minX; }
        if (rmaxX > maxX) { rmaxX = maxX; }
        if (rminY < minY) { rminY = minY; }
        if (rmaxY > maxY) { rmaxY = maxY; }

        var arr = [];
        for (var j = rminY; j <= rmaxY; j++) {
            for (var i = rminX; i <= rmaxX; i++) {
                arr.push({
                    z: gmxTilePoint.z,
                    x: i,
                    y: j,
                    dx: deltaX,
                    dy: deltaY,
                    tx: tminX,
                    ty: tminY
                });
            }
        }
        return arr;
    },

    // Loads missing rasters for single item and combines them in canvas.
    // Stores resulting canvas in this.rasters
    _getItemRasters: function (geo) {
        var properties = geo.properties,
            idr = properties[0],
            gmx = this.gmx,
            rasters = this.rasters,
            mainRasterLoader = null,
            def = new L.gmx.Deferred(function() {
                mainRasterLoader.cancel();
            });

        if (idr in rasters) {
            def.resolve();
            return def;
        }

        var shiftX = Number(gmx.shiftXfield ? gmx.getPropItem(properties, gmx.shiftXfield) : 0) % this.worldWidthMerc,
            shiftY = Number(gmx.shiftYfield ? gmx.getPropItem(properties, gmx.shiftYfield) : 0),
            isShift = shiftX || shiftY,
            isRasterCatalogID = gmx.getPropItem(properties, 'GMX_RasterCatalogID'),
            urlBG = gmx.getPropItem(properties, 'urlBG'),
            url = '',
            itemImageProcessingHook = null,
            isTiles = false,
            item = gmx.dataManager.getItem(idr),
            dataOption = geo.dataOption || {},
            gmxTilePoint = this.gmxTilePoint,
            _this = this,
            resCanvas = document.createElement('canvas');
        resCanvas.width = resCanvas.height = 256;

        if (gmx.IsRasterCatalog) {  // RasterCatalog
            if (!isRasterCatalogID && gmx.quicklookBGfunc) {
                url = gmx.quicklookBGfunc(item);
                itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
            } else {
                isTiles = true;
            }
        } else if (urlBG) {
            url = urlBG;
            itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
        }
        
        if (isTiles) {
            var tileToLoadPoints = isShift ? this._getShiftTilesArray(dataOption.bounds, shiftX, shiftY) : [gmxTilePoint];
            
            var cnt = tileToLoadPoints.length,
                chkReadyRasters = function() {
                    if (cnt < 1) { mainRasterLoader.resolve(tileToLoadPoints); }
                },
                skipRasterFunc = function() {
                    cnt--;
                    chkReadyRasters();
                },
                urlFunction = function(gtp) {
                    return gmx.rasterBGfunc(gtp.x, gtp.y, gtp.z, item);
                },
                onLoadFunction = function(gtp, p, img) {
                    item.skipRasters = false;
                    
                    if (itemImageProcessingHook) {
                        img = itemImageProcessingHook(img, {
                            gmx: gmx,
                            geoItem: geo,
                            item: item,
                            gmxTilePoint: gtp
                        });
                    };
                    
                    var info = {
                            res: resCanvas,
                            image: img,
                            destinationTilePoint: gmxTilePoint,
                            sourceTilePoint: gtp,
                            sx: 0, sy: 0, sw: 256, sh: 256,
                            dx: 0, dy: 0, dw: 256, dh: 256
                        };
                        
                    if (isShift) {
                        var pos = _this._getShiftPixels(p);
                        if (pos === null) {
                            skipRasterFunc();
                            return;
                        }
                        L.extend(info, pos);
                    }

                    if (gtp.z !== gmxTilePoint.z) {
                        var posInfo = gmxAPIutils.getTilePosZoomDelta(gmxTilePoint, gmxTilePoint.z, gtp.z);
                        if (posInfo.size < 1 / 256) {// меньше 1px
                            chkReadyRasters();
                            return;
                        }
                        info.sx = Math.floor(posInfo.x);
                        info.sy = Math.floor(posInfo.y);
                        info.sw = info.sh = posInfo.size;
                        if (isShift) {
                            var sw = Math.floor(info.dw / posInfo.zDelta);
                            info.sx = (info.dx === 0 ? info.sw : 256) - sw;
                            info.sw = sw;

                            var sh = Math.floor(info.dh / posInfo.zDelta);
                            info.sy = (info.dy === 0 ? info.sh : 256) - sh;
                            info.sh = sh;
                        }
                    }
                    
                    // _this.rawRasters[img.src] = 'hooking';
                    var hookResult = _this._rasterHook(info),
                        then = function() {
                            // delete _this.rawRasters[img.src];
                            cnt--;
                            p.resImage = resCanvas;
                            chkReadyRasters();
                        };
                    if (hookResult) {
                        if (hookResult instanceof L.gmx.Deferred) {
                            hookResult.then(then);
                        }
                    } else if (hookResult === null) {
                        item.skipRasters = true;
                        // delete _this.rawRasters[img.src];
                        skipRasterFunc();
                    } else {
                        then();
                    }
                },
                recursiveLoaders = tileToLoadPoints.map(function(it) {
                    var loader = _this._loadTileRecursive(it, urlFunction);
                    loader.then(function(loadResult) {
                        onLoadFunction(loadResult.gtp, it, loadResult.image);
                    }, skipRasterFunc);
                    return loader;
                });
            
            mainRasterLoader = new L.gmx.Deferred(function() {
                for (var k = 0; k < recursiveLoaders.length; k++) {
                    recursiveLoaders[k].cancel();
                }
            });
            
            mainRasterLoader.then(function() {
                rasters[idr] = resCanvas;
                def.resolve();
            });
        } else {
            // for quicklook
            mainRasterLoader = L.gmx.imageLoader.push(url, {
                layerID: gmx.layerID,
                crossOrigin: gmx.crossOrigin || ''
            });
            item.skipRasters = false;

            mainRasterLoader.then(
                function(img) {
                    var imgAttr = {
                        gmx: gmx,
                        geoItem: geo,
                        item: item,
                        gmxTilePoint: gmxTilePoint
                    };
                    var prepareItem = function(imageElement) {
                        var promise = _this._rasterHook({
                                res: resCanvas,
                                image: itemImageProcessingHook ? itemImageProcessingHook(imageElement, imgAttr) : imageElement,
                                destinationTilePoint: gmxTilePoint,
                                url: img.src
                            }),
                            then = function() {
                                rasters[idr] = resCanvas;
                                def.resolve();
                            };
                        if (promise) {
                            if (promise instanceof L.gmx.Deferred) {
                                promise.then(then);
                            }
                        } else if (promise === null) {
                            item.skipRasters = true;
                            def.resolve();
                        } else {
                            then();
                        }
                    };
                    prepareItem(img);
                },
                def.resolve
            );
        }
        return def;
    },

    _getTileRasters: function (geoItems) {   //load all missing rasters for items we are going to render
        var gmx = this.gmx,
            _this = this,
            tbounds = this.tbounds,
            itemPromises = null,
            def = new L.gmx.Deferred(function() {
                itemPromises.forEach(function(promise) {
                    if (promise) { promise.cancel(); }
                });
            }),
            needLoadRasters = 0,
            chkReadyRasters = function() {
                if (needLoadRasters < 1) {
                    def.resolve();
                }
            };

        itemPromises = geoItems.map(function(geo) {
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
                var flag = true,
                    geom = geo.properties[geo.properties.length - 1];
                if (geom.type === 'POLYGON' && !tbounds.clipPolygon(geom.coordinates[0]).length) {
                    flag = false;
                }
                if (flag) {
                    needLoadRasters++;
                    var itemRasterPromise = _this._getItemRasters(geo);
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
    },

    drawTile: function (data) {
        if (this.currentDrawDef) {
            this.currentDrawDef.cancel();
        }

        var tileRastersPromise = null,
            gmx = this.gmx,
            _this = this,
            def = new L.gmx.Deferred(function() {
                if (tileRastersPromise) { tileRastersPromise.cancel(); }
                _this.rasters = {};
            });

        def.always(function() {
            _this.currentDrawDef = null;
        });

        this.currentDrawDef = def;

        if (!this.layer._map) {
            def.resolve();
            return def;
        }

        var geoItems = data.added,
            itemsLength = geoItems.length;
        if (itemsLength === 0) {
            if (this.tKey in this.layer._tiles) {
                this.layer._tiles[this.tKey].getContext('2d').clearRect(0, 0, 256, 256);
            }
            def.resolve();
            return def;
        }
        var tile = this.layer.gmxGetCanvasTile(this.tilePoint),
            ctx = tile.getContext('2d'),
            dattr = {
                tbounds: this.tbounds,
                rasters: _this.rasters,
                gmx: gmx,
                tpx: this.tpx,
                tpy: this.tpy,
                ctx: ctx
            };

        tile.zKey = this.zKey;
        if (gmx.sortItems) {
            geoItems = this.layer.getSortedItems(geoItems);
        }

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            //ctx.save();
            for (var i = 0; i < itemsLength; i++) {
                L.gmxUtil.drawGeoItem(geoItems[i], dattr);
            }
            //ctx.restore();
            _this.rasters = {}; // clear rasters
            if (_this.layer._map) {
                _this.layer.appendTileToContainer(tile);
            }
            //async chain
            var res = new L.gmx.Deferred(),
                hookInfo = {
                    x: _this.tilePoint.x,
                    y: _this.tilePoint.y,
                    z: _this.zoom
                };

            res.resolve(tile, hookInfo);
            gmx.renderHooks.forEach(function (f) {
                res = res.then(function(tile) {
                    return f(tile, hookInfo);
                });
            });
            res.then(def.resolve, def.reject);
            //def.resolve();
        };

        if (this.showRaster) {
            tileRastersPromise = _this._getTileRasters(geoItems);
            tileRastersPromise.then(doDraw, def.reject); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }

        return def;
    },

    cancel: function () {
        if (this.currentDrawDef) {
            this.currentDrawDef.cancel();
        }
    }
};
