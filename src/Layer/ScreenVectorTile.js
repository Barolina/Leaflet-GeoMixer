// Single tile on screen with vector data
function ScreenVectorTile(layer, tilePoint, zoom) {
    this.layer = layer;
    this.tilePoint = tilePoint;
    this.zoom = zoom;
    this.gmx = layer._gmx;
    this.zKey = this.layer._tileCoordsToKey(tilePoint, zoom);
    var utils = gmxAPIutils;
    this.worldWidthMerc = utils.worldWidthMerc;
    var gmxTilePoint = utils.getTileNumFromLeaflet(tilePoint, zoom);
    this.tbounds = utils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z);
    this.tpx = 256 * gmxTilePoint.x;
    this.tpy = 256 * (1 + gmxTilePoint.y);
    this.gmxTilePoint = gmxTilePoint;

    this.showRaster =
        (zoom >= this.gmx.minZoomRasters && 'rasterBGfunc' in this.gmx) ||
        (zoom >= this.gmx.minZoomQuicklooks && 'quicklookBGfunc' in this.gmx);
    this.rasters = {}; //combined and processed canvases for each vector item in tile
    this.rasterRequests = {};   // all cached raster requests
    this.itemsView = [];   		// items on screen tile + todo: without not visible
    this._uniqueID = 0;         // draw attempt id
    this.gmx.badTiles = this.gmx.badTiles || {};
}

ScreenVectorTile.prototype = {

    //return promise, which resolves with object {gtp, image}
    _loadTileRecursive: function (gtp, urlFunction) {
        var gmx = this.gmx,
            _this = this,
            requestPromise = null,
            currentUrl,
            def = new L.gmx.Deferred(function() {
                if (requestPromise) {
                    //don't store cancelled requests in request cache
                    delete _this.rasterRequests[currentUrl];
                    requestPromise.cancel();
                }
            });

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

            if (gmx.badTiles[rUrl] || (gmx.maxNativeZoom && gmx.maxNativeZoom < gtp.z)) {
                tryHigherLevelTile();
                return;
            }
            var request = _this.rasterRequests[rUrl];
            if (!request) {
                if (gmx.rasterProcessingHook) {
                    crossOrigin = 'anonymous';
                }
                request = L.gmx.imageLoader.push(rUrl, {
                    tileRastersId: _this._uniqueID,
                    zoom: _this.zoom,
                    cache: true,
                    crossOrigin: crossOrigin || ''
                });
                _this.rasterRequests[rUrl] = request;
            } else {
                request.options.tileRastersId = _this._uniqueID;
            }
            currentUrl = rUrl;
            requestPromise = request.def;

            requestPromise.then(
                function(imageObj) {
                    def.resolve({gtp: gtp, image: imageObj});
                },
                function() {
                    gmx.badTiles[rUrl] = true;
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
                geoItem: attr.geoItem,
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
            _this = this,
            gmx = this.gmx,
            indexes = gmx.tileAttributeIndexes,
            rasters = this.rasters,
            mainRasterLoader = null,
            recursiveLoaders,
            shiftX = Number(gmx.shiftXfield ? gmxAPIutils.getPropItem(gmx.shiftXfield, properties, indexes) : 0) % this.worldWidthMerc,
            shiftY = Number(gmx.shiftYfield ? gmxAPIutils.getPropItem(gmx.shiftYfield, properties, indexes) : 0),
            isShift = shiftX || shiftY,
            urlBG = gmxAPIutils.getPropItem('urlBG', properties, indexes),
            url = '',
            itemImageProcessingHook = null,
            isTiles = false,
            item = gmx.dataManager.getItem(idr),
            gmxTilePoint = this.gmxTilePoint,
            resCanvas = null,
            imageItem = null;

        if (gmx.IsRasterCatalog && (gmx.rawProperties.type === 'Raster' || gmxAPIutils.getPropItem('GMX_RasterCatalogID', properties, indexes))) {
            isTiles = true;                     // Raster Layer
        } else if (gmx.quicklookBGfunc) {
            url = gmx.quicklookBGfunc(item);    // Quicklook
            itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
        } else if (urlBG) {
            url = urlBG;                        // Image urlBG from properties
            itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
        }
        if (isTiles) {
            mainRasterLoader = new L.gmx.Deferred(function() {
                recursiveLoaders.forEach(function(it) {
                    it.cancel();
                });
                recursiveLoaders = null;
            });
        } else {
            url += (url.indexOf('?') === -1 ? '?' : '&') + gmx.sessionKey;  //  for browser cache from another tabs
            var request = this.rasterRequests[url];
            if (!request) {
                request = L.gmx.imageLoader.push(url, {
                    tileRastersId: _this._uniqueID,
                    crossOrigin: gmx.crossOrigin || 'anonymous'
                });
                this.rasterRequests[url] = request;
            } else {
                request.options.tileRastersId = this._uniqueID;
            }

            // in fact, we want to return request.def, but need to do additional action during cancellation.
            // so, we consctruct new promise and add pipe it with request.def
            mainRasterLoader = new L.gmx.Deferred(function() {
                //don't cache cancelled requests
                delete _this.rasterRequests[url];
                request.def.cancel();
            });
            request.def.then(mainRasterLoader.resolve, mainRasterLoader.reject);
        }
        var itemRasterPromise = new L.gmx.Deferred(function() {
            if (mainRasterLoader) {
                mainRasterLoader.cancel();
                mainRasterLoader = null;
            }
        });

        if (isTiles) {
            var dataOption = geo.dataOption || {},
                tileToLoadPoints = isShift ? this._getShiftTilesArray(dataOption.bounds, shiftX, shiftY) : [gmxTilePoint],
                cnt = tileToLoadPoints.length,
                chkReadyRasters = function() {
                    if (cnt < 1) { mainRasterLoader.resolve(); }
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
                    var isImage = true;

                    if (itemImageProcessingHook) {
                        img = itemImageProcessingHook(img, {
                            gmx: gmx,
                            geoItem: geo,
                            item: item,
                            gmxTilePoint: gtp
                        });
                        isImage = false;
                    }

                    var info = {
                            geoItem: geo,
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
                        isImage = false;
                    }

                    if (gtp.z !== gmxTilePoint.z) {
                        var posInfo = gmxAPIutils.getTilePosZoomDelta(gmxTilePoint, gmxTilePoint.z, gtp.z);
                        if (posInfo.size < 1 / 256) {// меньше 1px
                            chkReadyRasters();
                            return;
                        }
                        isImage = false;
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
                    if (isImage && !gmx.rasterProcessingHook) {
                        cnt--;
                        resCanvas = img;
                        chkReadyRasters();
                    } else {
                        if (!resCanvas) {
                            resCanvas = document.createElement('canvas');
                            resCanvas.width = resCanvas.height = 256;
                        }
                        info.res = resCanvas;
                        var hookResult = _this._rasterHook(info),
                            then = function() {
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
                            skipRasterFunc();
                        } else {
                            then();
                        }
                    }
                };
            recursiveLoaders = tileToLoadPoints.map(function(it) {
                var loader = _this._loadTileRecursive(it, urlFunction);
                loader.then(function(loadResult) {
                    onLoadFunction(loadResult.gtp, it, loadResult.image);
                }, skipRasterFunc);
                return loader;
            });

            mainRasterLoader.then(function() {
                rasters[idr] = resCanvas;
                itemRasterPromise.resolve();
            });
        } else {
            // for quicklook
            item.skipRasters = false;
            var imageLoaded = function(img) {
                var imgAttr = {
                    gmx: gmx,
                    geoItem: geo,
                    item: item,
                    gmxTilePoint: gmxTilePoint
                };
                if (!resCanvas) {
                    resCanvas = document.createElement('canvas');
                    resCanvas.width = resCanvas.height = 256;
                }
                var prepareItem = function(imageElement) {
                    var promise = _this._rasterHook({
                            geoItem: geo,
                            res: resCanvas,
                            image: itemImageProcessingHook ? itemImageProcessingHook(imageElement, imgAttr) : imageElement,
                            destinationTilePoint: gmxTilePoint,
                            url: url
                        }),
                        then = function() {
                            rasters[idr] = resCanvas;
                            itemRasterPromise.resolve();
                        };
                    if (promise) {
                        if (promise instanceof L.gmx.Deferred) {
                            promise.then(then);
                        }
                    } else if (promise === null) {
                        item.skipRasters = true;
                        itemRasterPromise.resolve();
                    } else {
                        then();
                    }
                };
                prepareItem(img);
                delete _this.rasterRequests[url];
            };
            if (imageItem) {
                imageLoaded(imageItem);
            } else {
                mainRasterLoader.then(imageLoaded.bind(this), itemRasterPromise.resolve);
            }
        }
        itemRasterPromise.always(function() {
            mainRasterLoader = null;
            if (recursiveLoaders) {
                recursiveLoaders = null;
            }
        });
        return itemRasterPromise;
    },

    _getVisibleItems: function (geoItems) {
        if (geoItems.length < 2) {
            return geoItems;
        }
        if (!gmxAPIutils._tileCanvas) {
            gmxAPIutils._tileCanvas = document.createElement('canvas');
            gmxAPIutils._tileCanvas.width = gmxAPIutils._tileCanvas.height = 256;
        }
        var i, len,
            gmx = this.gmx,
            dm = gmx.dataManager,
            canvas = gmxAPIutils._tileCanvas,
            ctx = canvas.getContext('2d'),
            dattr = {
                tbounds: this.tbounds,
                gmx: gmx,
                tpx: this.tpx,
                tpy: this.tpy,
                ctx: ctx
            };
        ctx.clearRect(0, 0, 256, 256);
        ctx.imageSmoothingEnabled = false;
        for (i = 0, len = geoItems.length; i < len; i++) {
            ctx.fillStyle = gmxAPIutils.dec2rgba(i + 1, 1);
            var geoItem = geoItems[i];
            L.gmxUtil.drawGeoItem(
                geoItem,
                dm.getItem(geoItem.properties[0]),
                dattr,
                {fillStyle: ctx.fillStyle}
            );
        }
        var items = {},
            data = ctx.getImageData(0, 0, 256, 256).data;

        for (i = 0, len = data.length; i < len; i += 4) {
            if (data[i + 3] === 255) {
                var color = data[i + 2];
                if (data[i + 1]) { color += (data[i + 1] << 8); }
                if (data[i]) { color += (data[i] << 16); }
                if (color) { items[color] = true; }
            }
        }
        var out = [];
        for (var num in items) {
            var it = geoItems[Number(num) - 1];
            if (it) { out.push(it); }
        }
		this.itemsView = out;
        return out;
    },

    _getNeedRasterItems: function (geoItems) {
        var gmx = this.gmx,
            indexes = gmx.tileAttributeIndexes,
            tbounds = this.tbounds,
            out = [];
        for (var i = 0, len = geoItems.length; i < len; i++) {
            var geo = geoItems[i],
                properties = geo.properties,
                idr = properties[0],
                dataOption = geo.dataOption || {},
                skipRasters = false;

            if (gmx.quicklookBGfunc && !gmxAPIutils.getPropItem('GMX_RasterCatalogID', properties, indexes)) {
                if (gmx.minZoomQuicklooks && this.zoom < gmx.minZoomQuicklooks) { continue; }
                var platform = gmxAPIutils.getPropItem(gmx.quicklookPlatform, properties, indexes) || gmx.quicklookPlatform || '';
                if ((!platform || platform === 'imageMercator') &&
                    !gmxAPIutils.getQuicklookPointsFromProperties(properties, gmx)
                ) {
                    continue;
                }
            }

            if (gmx.styleHook) {
                geo.styleExtend = gmx.styleHook(
                    gmx.dataManager.getItem(idr),
                    gmx.lastHover && idr === gmx.lastHover.id
                );
                skipRasters = geo.styleExtend && geo.styleExtend.skipRasters;
            }
            if (!skipRasters && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                out.push(geo);
            }
        }
        return this._getVisibleItems(out);
    },

    _getTileRasters: function (geoItems) {   //load all missing rasters for items we are going to render
        var itemPromises = [],
            def = new L.gmx.Deferred(function() {
                itemPromises.forEach(function(promise) {
                    promise.cancel();
                });
                itemPromises = null;
            }),
            itemRasters = this._getNeedRasterItems(geoItems),
            needLoadRasters = itemRasters.length;

        if (needLoadRasters) {
            var _this = this,
                chkReadyRasters = function() {
                    if (needLoadRasters < 1) {
                        def.resolve();
                    }
                };
            itemRasters.forEach(function (geo) {
                var itemRasterPromise = _this._getItemRasters(geo);
                itemRasterPromise.then(function() {
                    needLoadRasters--;
                    chkReadyRasters();
                });
                itemPromises.push(itemRasterPromise);
            });
        } else {
            def.resolve();
        }
        return def;
    },

    _chkItems: function (data) {
        var layer = this.layer;
        if (!layer._map) {
            return null;
        }
        var items = data && data.added && data.added.length ? data.added : null;

        if (!items) {
            var tLink = layer._tiles[this.zKey];
            if (tLink && tLink.el) {
                tLink.el.getContext('2d').clearRect(0, 0, 256, 256);
            }
            return null;
        }
        return this.gmx.sortItems ? layer.getSortedItems(items) : items;
    },

    _cancelRastersPromise: function () {
        if (this.rastersPromise) {
            this.rastersPromise.cancel();
            this.rastersPromise = null;
        }
    },

    drawTile: function (data) {
        var drawPromise = this.currentDrawPromise,
            _this = this;

        this._uniqueID++;       // count draw attempt

        if (drawPromise) {
            this._cancelRastersPromise();
            if (this._preRenderPromise) {
                this._preRenderPromise.cancel();        // cancel preRenderHooks chain if exists
            }
            if (this._renderPromise) {
                this._renderPromise.cancel();           // cancel renderHooks chain if exists
            }
            drawPromise.reject();
        }
        drawPromise = new L.gmx.Deferred(this._cancelRastersPromise.bind(this));
        drawPromise.always(function() {
            _this._drawDone();
            _this.currentDrawPromise = null;
            _this.rastersPromise = null;
            _this._preRenderPromise = null;
            _this._renderPromise = null;
        });

        this.currentDrawPromise = drawPromise;

        var geoItems = this._chkItems(data);
        if (!geoItems) {
            drawPromise.resolve();
            return drawPromise;
        }
        var tileLink = this.layer.gmxGetCanvasTile(this.tilePoint),
            tile = tileLink.el,
            ctx = tile.getContext('2d'),
            gmx = this.gmx,
            dattr = {
                tbounds: this.tbounds,
                rasters: this.rasters,
                gmx: gmx,
                tpx: this.tpx,
                tpy: this.tpy,
                ctx: ctx
            };
        tile.zKey = tileLink.el._zKey = this.zKey;

        var doDraw = function() {
            ctx.clearRect(0, 0, 256, 256);
            var hookInfo = {
                    tpx: _this.tpx,
                    tpy: _this.tpy,
                    x: _this.tilePoint.x,
                    y: _this.tilePoint.y,
                    z: _this.zoom
                },
                bgImage = null;

            _this._preRenderPromise = new L.gmx.Deferred();
            _this._preRenderPromise.resolve(bgImage);

            gmx.preRenderHooks.forEach(function (f) {
                _this._preRenderPromise = _this._preRenderPromise.then(function(hookBgImage) {

                    //in-place modifications are possible
                    bgImage = hookBgImage || bgImage;

                    if (!bgImage) {
                        bgImage = document.createElement('canvas');
                        bgImage.width = bgImage.height = 256;
                    }
                    return f(bgImage, hookInfo);
                });
            });
            _this._preRenderPromise.then(function(hookBgImage) {
                bgImage = hookBgImage || bgImage;
                if (bgImage) { dattr.bgImage = bgImage; }
                //ctx.save();
                for (var i = 0, len = geoItems.length; i < len; i++) {
                    var geoItem = geoItems[i],
                        id = geoItem.id,
                        item = gmx.dataManager.getItem(id);
                    if (item) {     // skip removed items   (bug with screen tile screenTileDrawPromise.cancel on hover repaint)
                        var style = gmx.styleManager.getObjStyle(item),
                            hover = gmx.lastHover && gmx.lastHover.id === geoItem.id && style;

                        if (gmx.multiFilters) {
                            for (var j = 0, len1 = item.multiFilters.length; j < len1; j++) {
                                var it = item.multiFilters[j];
                                L.gmxUtil.drawGeoItem(geoItem, item, dattr, hover ? it.parsedStyleHover : it.parsedStyle, it.style);
                            }
                        } else {
                            L.gmxUtil.drawGeoItem(geoItem, item, dattr, hover ? item.parsedStyleHover : item.parsedStyleKeys, style);
                        }
                        if (id in gmx._needPopups && !gmx._needPopups[id]) {
                            gmx._needPopups[id] = true;
                        }
                    }
                }
                //ctx.restore();
                _this.rasters = {}; // clear rasters
                if (_this.layer._map && !tile.parentNode) {
                    _this.layer.appendTileToContainer(tile);
                }
                //async chain
                _this._renderPromise = new L.gmx.Deferred();
                _this._renderPromise.resolve(tile);
                gmx.renderHooks.forEach(function (f) {
                    _this._renderPromise = _this._renderPromise.then(function(hookTile) {
                        tile = hookTile || tile;
                        return f(tile, hookInfo);
                    });
                });
                _this._renderPromise.then(drawPromise.resolve, drawPromise.reject);
            }, drawPromise.reject);
        };

        if (this.showRaster) {
            this.rastersPromise = this._getTileRasters(geoItems);
            this.rastersPromise.then(doDraw, drawPromise.reject); //first load all raster images, then render all of them at once
        } else {
            doDraw();
        }

        return drawPromise;
    },

    destructor: function () {
        this._cancelRastersPromise();
        this._clearCache();

        this.currentDrawPromise && this.currentDrawPromise.reject();
    },

    _drawDone: function () {
        for (var url in this.rasterRequests) {
            var req = this.rasterRequests[url];
            if (this._uniqueID !== req.options.tileRastersId) {
                req.remove();
                delete this.rasterRequests[url];
            }
        }
        // this.layer.fire('tiledrawdone', {zKey: this.zKey});
    },

    _clearCache: function () {
        for (var url in this.rasterRequests) {
            this.rasterRequests[url].remove();
        }
        this.rasterRequests = {};
    }
};
