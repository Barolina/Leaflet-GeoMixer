L.gmx.VectorLayer = L.TileLayer.Canvas.extend(
{
    options: {
        clickable: true
    },

    initialize: function(options) {
        options = L.setOptions(this, options);

        this.initPromise = new gmxDeferred();

        this._drawQueue = [];
        this._drawQueueHash = {};
        var _this = this;

        this._gmx = {
            hostName: options.hostName || 'maps.kosmosnimki.ru',
            mapName: options.mapID,
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            units: options.units || {square: 'km2', distance: 'km', coordinates: 0},
            screenTiles: {},
            tileSubscriptions: {},
            _tilesToLoad: 0,
            getDeltaY: function() {
                var map = _this._map;
                if (!map) return 0;
                var pos = map.getCenter();
                return map.options.crs.project(pos).y - L.Projection.Mercator.project(pos).y;
            },
            getScreenBboxArr: function() {
                var map = _this._map;
                if (!map) return [];
                var pos = map.getCenter(),
                    deltaY = _this._gmx.getDeltaY(),
                    screenBounds = map.getBounds(),
                    p1 = map.options.crs.project(screenBounds.getNorthWest()),
                    p2 = map.options.crs.project(screenBounds.getSouthEast()),
                    ww2 = gmxAPIutils.tileSizes[0],
                    bbox = gmxAPIutils.bounds([[p1.x % ww2, p1.y - deltaY], [p2.x % ww2, p2.y - deltaY]]),
                    ww = gmxAPIutils.tileSizes[1];

                var arr = [bbox];
                if (bbox.max.x - bbox.min.x > ww2) {
                    arr[0] = gmxAPIutils.bounds([[-ww, -ww], [ww, ww]]);
                } else if (bbox.max.x > ww) {
                    arr.push(gmxAPIutils.bounds([[bbox.min.x - ww2, bbox.min.y], [bbox.max.x - ww2, bbox.max.y]]));
                } else if (bbox.min.x < -ww) {
                    arr.push(gmxAPIutils.bounds([[bbox.min.x + ww2, bbox.min.y], [bbox.max.x + ww2, bbox.max.y]]));
                }
                return arr;
            }
        };

        this.on('tileunload', function(e) {
            _this._clearTileSubscription(e.tile.id);
        });
    },

    _clearTileSubscription: function(zKey) {
        var gmx = this._gmx,
            screenTiles = gmx.screenTiles;

        if (zKey in gmx.tileSubscriptions) {
            gmx.dataManager.getObserver(zKey).deactivate();
            gmx.dataManager.removeObserver(zKey);
            delete gmx.tileSubscriptions[zKey];
        }

        for (var i = this._drawQueue.length-1; i >= 0; i--) {
            var elem = this._drawQueue[i];
            if (elem.zKey === zKey) {
                elem.def.cancel();
                this._drawQueue.splice(i, 1);
            }
        }
        
        delete this._drawQueueHash[zKey];
        
        if (screenTiles[zKey]) {
            
            screenTiles[zKey].cancel();
            delete screenTiles[zKey];
        }
    },

    _clearAllSubscriptions: function() {
        while (this._drawQueue.length) {
            this._drawQueue[0].def.cancel();
        };        

        var gmx = this._gmx,
            subscriptions = gmx.tileSubscriptions;

        for (var zKey in subscriptions) {
            delete subscriptions[zKey];
            gmx.dataManager.getObserver(zKey).deactivate();
            gmx.dataManager.removeObserver(zKey);
            if (zKey in this._drawQueueHash) {
                this._drawQueueHash[zKey].reject();
            }
            if (gmx.screenTiles[zKey]) {
                gmx.screenTiles[zKey].cancel();
                delete gmx.screenTiles[zKey];
            }
        }
        this._drawQueueHash = {};
        gmx._tilesToLoad = 0;
    },

    _zoomStart: function() {
        this._gmx.zoomstart = true;
    },

    _zoomEnd: function() {
        this._gmx.zoomstart = false;
    },

    _moveEnd: function() {
        if ('dataManager' in this._gmx) {
            this._gmx.dataManager.fire('moveend');
        }
    },

    onAdd: function(map) {
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw "GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer";
        }
        var gmx = this._gmx;

        gmx.map = map;
        gmx.applyShift = map.options.crs === L.CRS.EPSG3857;

        L.TileLayer.Canvas.prototype.onAdd.call(this, map);
        gmx.styleManager.initStyles();

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        if (gmx.applyShift) {
            map.on('moveend', this._updateShiftY, this);
            this._updateShiftY();
        } else {
            gmx.shiftY = 0;
        }
        if (gmx.balloonEnable && !this._popup) this.bindPopup();
        if (gmx.properties.type === 'Vector') {
            if (!('chkUpdate' in this.options)) this.options.chkUpdate = true;
            L.gmx.layersVersion.add(this);
            map.on('moveend', this._moveEnd, this);
        }
        this.fire('add');
    },

    onRemove: function(map) {
        L.TileLayer.Canvas.prototype.onRemove.call(this, map);
        this._clearAllSubscriptions();
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);

        var gmx = this._gmx;

        delete gmx.map;
        if (gmx.applyShift) {
            map.off('moveend', this._updateShiftY, this);
        }
        if (gmx.properties.type === 'Vector') {
            L.gmx.layersVersion.remove(this);
            map.off('moveend', this._moveEnd, this);
        }
        this.fire('remove');
    },

    //public interface
    initFromDescription: function(ph) {
        var _this = this,
            gmx = this._gmx,
            apikeyRequestHost = this.options.apikeyRequestHost || gmx.hostName,
            sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        gmx.sessionKey = sk;
        gmx.tileSenderPrefix = "http://" + gmx.hostName + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk);

        gmx.properties = ph.properties;
        gmx.geometry = ph.geometry;

        this.initLayerData(ph);
        gmx.dataManager = new gmxDataManager(gmx, ph);
        gmx.styleManager = new gmxStyleManager(gmx);
        gmx.styleManager.deferred.then(function () {
            _this._update();
        });

        this.initPromise.resolve();
    },

    setStyle: function (style, num) {
        var gmx = this._gmx;
        this.initPromise.then(function() {
            gmx.styleManager.setStyle(style, num);
        });
        return this;
    },

    setStyleHook: function (func) {
        this._gmx.styleHook = func;
        return this;
    },

    removeStyleHook: function () {
        this._gmx.styleHook = null;
    },

    // getFilters: function () {
        // return this._gmx.dataManager._filters;
    // },

    setFilter: function (func) {
        this._gmx.dataManager.addFilter('userFilter', function(item) {
            return !func || func(item) ? item.properties : null;
        });
        return this;
    },

    removeFilter: function () {
        this._gmx.dataManager.removeFilter('userFilter');
        return this;
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;
        gmx.beginDate = beginDate;
        gmx.endDate = endDate;
        
        //gmx.dataManager.setDateInterval(beginDate, endDate);
        
        for (var key in gmx.tileSubscriptions) {
            var observer = gmx.dataManager.getObserver(key);
            observer.setDateInterval(beginDate, endDate);
        }
        
        this._update();
        return this;
    },

    addObserver: function (options) {
        return this._gmx.dataManager.addObserver(options);
    },

    removeObserver: function(observer) {
        return this._gmx.dataManager.removeObserver(observer.id);
    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _drawTileAsync: function (tilePoint, zoom, data) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            zKey = zoom + ':' + tilePoint.x + ':' + tilePoint.y,
            _this = this;
            
        if (this._drawQueueHash[zKey]) {
            this._drawQueueHash[zKey].cancel();
        }

        var drawNextTile = function() {
            if (!queue.length) {    // TODO: may be need load rasters in tile
                _this.fire('doneDraw');
                return;
            }
            
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.zKey];
            if (_this._map && bbox.z === _this._map._zoom) {
                bbox.drawDef = _this._gmxDrawTile(bbox.tp, bbox.z, bbox.data);
                
                bbox.drawDef.then(
                    bbox.def.resolve.bind(bbox.def, bbox.data),
                    bbox.def.reject.bind(bbox.def)
                );
            } else {
                bbox.def.reject();
            }
            setTimeout(drawNextTile, 0);
        }
        
        var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var queueItem = {gtp: gtp, tp: tilePoint, z: zoom, zKey: zKey, data: data};
        var def = queueItem.def = new gmxDeferred(function() {
            queueItem.drawDef && queueItem.drawDef.cancel();
            
            delete _this._drawQueueHash[zKey];
            for (var i = queue.length-1; i >= 0; i--) {
                var elem = queue[i];
                if (elem.zKey === zKey) {
                    queue.splice(i, 1);
                    break;
                }
            }
        });
        
        queue.push(queueItem);
        
        this._drawQueueHash[zKey] = def;
        
        if (isEmpty) {
            this.fire('startDraw');
            setTimeout(drawNextTile, 0);
        }
        
        return def;
    },

    _updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map,
            deltaY = gmx.getDeltaY();

        gmx.shiftX = Math.floor(gmx.mInPixel * (gmx.shiftXlayer || 0));
        gmx.shiftY = Math.floor(gmx.mInPixel * (deltaY + (gmx.shiftYlayer || 0)));

        for (var t in this._tiles) {
            var tile = this._tiles[t],
                pos = this._getTilePos(tile._tilePoint);
            pos.x += gmx.shiftX;
            pos.y -= gmx.shiftY;
            L.DomUtil.setPosition(tile, pos, L.Browser.chrome || L.Browser.android23);
        }
        this._update();
    },

    _prpZoomData: function() {
        var gmx = this._gmx,
            map = this._map;
        gmx.currentZoom = map._zoom;
        gmx.tileSize = gmxAPIutils.tileSizes[gmx.currentZoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx.dataManager._triggerObservers();
    },

    _initContainer: function () {
        L.TileLayer.Canvas.prototype._initContainer.call(this);
        this._prpZoomData();
    },

    _update: function () {
        var gmx = this._gmx;
        if (!this._map || gmx.zoomstart) return;

        var zoom = this._map.getZoom();
        if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
            clearTimeout(this._clearBgBufferTimer);
            this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
            return;
        }
        var tileBounds = this._getScreenTileBounds();
        this._addTilesFromCenterOut(tileBounds);

        if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
            this._removeOtherTiles(tileBounds);
        }
        
        //L.TileVector will remove all tiles from other zooms.
        //But it will not remove subscriptions without tiles - we should do it ourself
        var dataManager = gmx.dataManager,
            bboxArr = gmx.getScreenBboxArr();

        for (var key in gmx.tileSubscriptions) {
            var parsedKey = key.split(':');
            if (parsedKey[0] != zoom) {
                this._clearTileSubscription(key);
            } else {    // deactivate observers for invisible Tiles
                var observer = dataManager.getObserver(key);
                var active = false;
                for (var i = 0, len = bboxArr.length; i < len; i++) {
                    if (observer.intersects(bboxArr[i])) {
                        active = true;
                        break;
                    }
                }
                if (active) observer.activate();
                else observer.deactivate();
            }
        }
    },

    _getScreenTileBounds: function () {
        var map = this._map,
            zoom = map._zoom,
            pz = Math.pow(2, zoom),
            bounds = map.getPixelBounds(),
            shiftX = this._gmx.shiftX || 0,     // Сдвиг слоя
            shiftY = this._gmx.shiftY || 0,     // Сдвиг слоя + OSM
            tileSize = this.options.tileSize;

        bounds.min.y += shiftY, bounds.max.y += shiftY;
        bounds.min.x -= shiftX, bounds.max.x -= shiftX;

        var nwTilePoint = new L.Point(
                Math.floor(bounds.min.x / tileSize),
                Math.floor(bounds.min.y / tileSize)),

            seTilePoint = new L.Point(
                Math.floor(bounds.max.x / tileSize),
                Math.floor(bounds.max.y / tileSize));

        if (nwTilePoint.y < 0) nwTilePoint.y = 0;
        if (seTilePoint.y >= pz) seTilePoint.y = pz - 1;
        return new L.Bounds(nwTilePoint, seTilePoint);
    },

    _addTile: function (tilePoint) {
        var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

        if (!gmx.layerType || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            this._tileLoaded();
            return;
        }

        var zKey = zoom + ':' + tilePoint.x + ':' + tilePoint.y;
        if (!gmx.tileSubscriptions[zKey]) {
            gmx._tilesToLoad++;
            var isDrawnFirstTime = false,
                gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
                attr = {
                    type: 'resend',
                    bbox: gmx.dataManager.getStyleBounds(gmxTilePoint),
                    filters: ['styleFilter', 'userFilter'],
                    callback: function(data) {
                        myLayer._drawTileAsync(tilePoint, zoom, data).then(function() {
                            if (!isDrawnFirstTime) {
                                gmx._tilesToLoad--;
                                myLayer._tileLoaded();
                                isDrawnFirstTime = true;
                            }
                        }, function() {
                            if (!isDrawnFirstTime) {
                                gmx._tilesToLoad--;
                                myLayer._tileLoaded();
                                isDrawnFirstTime = true;
                            }
                        });
                    }
                };
            if (gmx.layerType === 'VectorTemporal') {
                attr.dateInterval = [gmx.beginDate, gmx.endDate];
            }
            
            var observer = gmx.dataManager.addObserver(attr, zKey);
            
            observer.on('activate', function() {
                //if observer is deactivated before drawing, 
                //we can consider corresponding tile as already drawn
                if (!observer.isActive() && !isDrawnFirstTime) {
                    gmx._tilesToLoad--;
                    myLayer._tileLoaded();
                    isDrawnFirstTime = true;
                }
            })
            gmx.tileSubscriptions[zKey] = {
                px: 256 * gmxTilePoint.x,
                py: 256 *(1 + gmxTilePoint.y)
            };
        }
    },

    _gmxDrawTile: function (tilePoint, zoom, data) {
        var gmx = this._gmx,
            def = new gmxDeferred();
            
        if(gmx.zoomstart || !this._map) {
            def.reject();
            return def;
        };

        if (!zoom) zoom = this._map._zoom;
        var screenTiles = gmx.screenTiles,
            zKey = zoom + ':' + tilePoint.x + ':' + tilePoint.y,
            screenTile = null,
            _this = this;

        if (!screenTiles[zKey]) {
            screenTiles[zKey] = screenTile = new gmxScreenVectorTile(this, tilePoint, zoom);
        } else {
            screenTile = screenTiles[zKey];
        }
        
       gmx.styleManager.deferred.then(function () {
            screenTile.drawTile(data).then(def.resolve.bind(def, data), def.reject.bind(def));
       });
        
        return def;
    },

    gmxGetCanvasTile: function (tilePoint) {
        var tKey = tilePoint.x + ':' + tilePoint.y;

        if (tKey in this._tiles) {
            return this._tiles[tKey];
        }

        var tile = this._getTile();
        tile.id = tKey;
        tile._zoom = this._map._zoom;
        tile._layer = this;
        tile._tileComplete = true;
        tile._tilePoint = tilePoint;
        this._tiles[tKey] = tile;
        this._tileContainer.appendChild(tile);

        var tilePos = this._getTilePos(tilePoint);
        tilePos.x += this._gmx.shiftX || 0;
        tilePos.y -= this._gmx.shiftY || 0; // Сдвиг слоя
        L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);

        this.tileDrawn(tile);
        return this._tiles[tKey];
    },

    _getLoadedTilesPercentage: function (container) {
        if(!container) return 0;
        var len = 0, count = 0;
        var arr = ['img', 'canvas'];
        for (var key in arr) {
            var tiles = container.getElementsByTagName(arr[key]);
            if(tiles && tiles.length > 0) {
                len += tiles.length;
                for (var i = 0, len1 = tiles.length; i < len1; i++) {
                    if (tiles[i]._tileComplete) {
                        count++;
                    }
                }
            }
        }
        if(len < 1) return 0;
        return count / len;	
    },

    _tileLoaded: function () {
        if (this._gmx._tilesToLoad === 0) {
            this.fire('load');

            if (this._animated) {
                L.DomUtil.addClass(this._tileContainer, 'leaflet-zoom-animated');
                // clear scaled tiles after all new tiles are loaded (for performance)
                clearTimeout(this._clearBgBufferTimer);
                this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
            }
        }
    },

    _tileOnLoad: function (tile) {
        if (tile) L.DomUtil.addClass(tile, 'leaflet-tile-loaded');
        this._tileLoaded();
    },

    tileDrawn: function (tile) {
        this._tileOnLoad(tile);
    },

    _gmxFirstObjectsByPoint: function (geoItems, mercPoint) {    // Получить верхний обьект по координатам mouseClick
        var gmx = this._gmx,
            mInPixel = gmx.mInPixel,
            bounds = gmxAPIutils.bounds([mercPoint]);

        for (var i = geoItems.length - 1; i >= 0; i--) {
            var geoItem = geoItems[i].arr,
                idr = geoItem[0],
                dataOption = geoItems[i].dataOption || {},
                item = gmx.dataManager.getItem(idr),
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = parsedStyle.lineWidth || 0,
                dx = (parsedStyle.sx + lineWidth) / mInPixel,
                dy = (parsedStyle.sy + lineWidth) / mInPixel;

            if (dx > dy) dx = dy;
            else dy = dx;

            if (!dataOption.bounds.intersectsWithDelta(bounds, dx, dy)) continue;

            var geom = geoItem[geoItem.length - 1],
                fill = parsedStyle.fill || parsedStyle.bgImage,
                marker = parsedStyle.marker,
                type = geom.type,
                chktype = type,
                hiddenLines = dataOption.hiddenLines,
                boundsArr = dataOption.boundsArr,
                coords = geom.coordinates,
                ph = {
                    point: mercPoint,
                    bounds: bounds,
                    coords: coords,
                    boundsArr: boundsArr
                };

            if(type === 'MULTIPOLYGON' || type === 'POLYGON') {
                if(marker) {
                    chktype = 'POINT';
                } else if(!fill) {
                    if (type === 'POLYGON') {
                        chktype = 'MULTILINESTRING';
                        hiddenLines = hiddenLines[0];
                    } else {
                        chktype = 'LIKEMULTILINESTRING';
                    }
                    ph.hidden = hiddenLines;
                }
            }

            if(chktype === 'LINESTRING') {
                if (!gmxAPIutils.isPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) continue;
            } else if(chktype === 'LIKEMULTILINESTRING') {
                var flag = false;
                ph.delta = lineWidth / mInPixel;
                for (var j = 0, len = coords.length; j < len; j++) {
                    ph.coords = coords[j];
                    ph.hidden = hiddenLines[j];
                    ph.boundsArr = boundsArr[j];
                    if (gmxAPIutils.isPointInLines(ph)) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) continue;
            } else if(chktype === 'MULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                ph.hidden = hiddenLines;
                if (!gmxAPIutils.isPointInLines(ph)) {
                    continue;
                }
            } else if(chktype === 'MULTIPOLYGON' || chktype === 'POLYGON') {
                var flag = false,
                    chkPoint = mercPoint;
                if(chktype === 'POLYGON') {
                    coords = [geom.coordinates];
                    boundsArr = [dataOption.boundsArr];
                }
                for (var j = 0, len = coords.length; j < len; j++) {
                    var arr = coords[j],
                        bbox = boundsArr[j];
                    for (var j1 = 0, len1 = arr.length; j1 < len1; j1++) {
                        var b = bbox[j1];
                        if (b.intersects(bounds)) {
                            if (gmxAPIutils.isPointInPolygonWithHoles(chkPoint, arr)) {
                                flag = j1 === 0 ? true : false;
                                break;
                            }
                        }
                    }
                }
                if (!flag) continue;
            } else if(chktype === 'POINT') {
                coords = gmxAPIutils.getMarkerPolygon(dataOption.bounds, dx, dy);
                if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
            }

            return { id: idr
                ,properties: item.properties
                ,geometry: geom
                ,bounds: item.bounds
            };
        }
        return null;
    },

    gmxEventCheck: function (ev, skipOver) {
        var layer = this,
            gmx = layer._gmx,
            type = ev.type,
            lastHover = gmx.lastHover,
            chkHover = function (evType) {
                if (lastHover && type === 'mousemove') {
                    if (layer.hasEventListeners(evType)) {
                        ev.gmx = lastHover;
                        layer.fire(evType, ev);
                    }
                    layer._redrawTilesHash(lastHover.observersToUpdate);    // reset hover
                }
            };
        if (!skipOver && ev.originalEvent &&
            (type === 'mousemove'
            || this.hasEventListeners('mouseover')
            || this.hasEventListeners('mouseout')
            || this.hasEventListeners(type)
            )) {
            var zKey = ev.originalEvent.target.id,
                observer = gmx.dataManager.getObserver(zKey);
            if (observer) {
                var lng = ev.latlng.lng % 360,
                    latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
                    point = L.Projection.Mercator.project(latlng)._subtract(
                        {x: gmx.shiftXlayer || 0, y: gmx.shiftYlayer || 0}
                    ),
                    delta = 5 / gmx.mInPixel,
                    mercatorPoint = [point.x, point.y],
                    bounds = gmxAPIutils.bounds([mercatorPoint]);
                bounds = bounds.addBuffer(delta);
                var geoItems = gmx.dataManager.getItems(zKey, bounds);

                if (geoItems && geoItems.length) {
                    if (gmx.sortItems) geoItems = geoItems.sort(gmx.sortItems);
                    
                    var target = this._gmxFirstObjectsByPoint(geoItems, mercatorPoint);
                    if (target) {
                        var changed = !lastHover || lastHover.id !== target.id;
                        if (type === 'mousemove' && lastHover) {
                            if (!changed) return target.id;
                            gmx.lastHover = null;
                            chkHover('mouseout');
                        }

                        ev.gmx = {
                            targets: geoItems
                            ,target: target
                            ,templateBalloon: gmx.styleManager.getItemBalloon(target.id)
                            ,properties: gmxAPIutils.getPropertiesHash(target.properties, gmx.tileAttributeIndexes)
                            ,id: target.id
                        };
                        if (this.hasEventListeners(type)) this.fire(type, ev);
                        if (type === 'mousemove' && changed) {
                            lastHover = gmx.lastHover = ev.gmx;
                            lastHover.observersToUpdate = layer._getTilesByBounds(target.bounds);
                            chkHover('mouseover');
                        }
                        this._map.doubleClickZoom.disable();
                        return target.id;
                    }
                }
            }
        }
        if (!skipOver && type !== 'mousedown' && type !== 'mouseup') {
            gmx.lastHover = null;
            chkHover('mouseout');
        }
        this._map.doubleClickZoom.enable();
        return 0;
    },
    
    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            tileSize = gmx.tileSize,
            zoom = this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
            minLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.min.x, bounds.min.y)),
            maxLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.max.x, bounds.max.y)),
            minPoint = this._map.project(minLatLng),
            maxPoint = this._map.project(maxLatLng),
            screenBounds = this._map.getPixelBounds(),
            minY = Math.floor((Math.max(maxPoint.y, screenBounds.min.y) + shiftY)/256),
            maxY = 1 + Math.floor((Math.min(minPoint.y, screenBounds.max.y) + shiftY)/256),
            minX = maxLatLng.lng < -179 ? screenBounds.min.x : Math.max(minPoint.x, screenBounds.min.x),
            minX = Math.floor((minX + shiftX)/256),
            maxX = maxLatLng.lng > 179 ? screenBounds.max.x : Math.min(maxPoint.x, screenBounds.max.x),
            maxX = Math.floor((maxX + shiftX)/256),
            gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var zKey = zoom + ':' + x + ':' + y;
                gmxTiles[zKey] = true;
            }
        }
        return gmxTiles;
    },

    redrawAll: function () {
        this._gmx.dataManager._triggerObservers();
    },

    redrawItem: function (id) {
        var item = this._gmx.dataManager.getItem(id),
            gmxTiles = this._getTilesByBounds(item.bounds);
            
        this._redrawTilesHash(gmxTiles);
    },

    _redrawTilesHash: function (observersToUpdate) {    // Перерисовать список gmxTiles тайлов на экране
        var dataManager = this._gmx.dataManager;
        //TODO: just trigger observer, don't get and pass data directly
        for (var key in observersToUpdate) {
            var observer = dataManager.getObserver(key);
            if (observer) observer.updateData(dataManager.getItems(key));
        }
    },

    initLayerData: function(layerDescription) {     // обработка описания слоя
        var gmx = this._gmx,
            prop = layerDescription.properties,
            type = prop.type || 'Vector';

        if (prop.Temporal) type += 'Temporal';
        gmx.items = {};
        gmx.tileCount = 0;

		var cnt;
		if(type === 'VectorTemporal') {
            cnt = prop.TemporalTiles;
			gmx.TemporalColumnName = prop.TemporalColumnName;
			gmx.TemporalPeriods = prop.TemporalPeriods;
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			gmx.ZeroDate = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			gmx.ZeroUT = gmx.ZeroDate.getTime() / 1000;
		}
        
		gmx.tileCount = cnt;
		gmx.layerType = type;   // VectorTemporal Vector
		gmx.identityField = prop.identityField; // ogc_fid
		gmx.GeometryType = prop.GeometryType;   // тип геометрий обьектов в слое
		gmx.minZoomRasters = prop.RCMinZoomForRasters;// мин. zoom для растров
        if (!gmx.sortItems && gmx.GeometryType === 'polygon') {
            gmx.objectsReorder.setSortFunc(function(a, b) { return Number(a.arr[0]) - Number(b.arr[0]); });
        }

        if('MetaProperties' in prop) {
            var meta = prop.MetaProperties;
            if('shiftX' in meta || 'shiftY' in meta) {  // сдвиг всего слоя
                gmx.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                gmx.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            if('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                if(meta.shiftXfield) gmx.shiftXfield = meta.shiftXfield.Value;
                if(meta.shiftYfield) gmx.shiftYfield = meta.shiftYfield.Value;
            }
            if('quicklookPlatform' in meta) {    // тип спутника
                gmx.quicklookPlatform = meta.quicklookPlatform.Value;
            }
        }

        var tileAttributeIndexes = {};
        if (prop.attributes) {
            var attrs = prop.attributes;
            if (gmx.identityField) tileAttributeIndexes[gmx.identityField] = 0;
            for (var a = 0; a < attrs.length; a++) {
                tileAttributeIndexes[attrs[a]] = a + 1;
            }
        }
        gmx.tileAttributeIndexes = tileAttributeIndexes;
        gmx.getPropItem = function(prop, key) {
            return gmx.tileAttributeIndexes ? prop[gmx.tileAttributeIndexes[key]] : '';
        }

        if(prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            var layerLink = gmx.tileAttributeIndexes['GMX_RasterCatalogID'];
            if(layerLink) {
                gmx.rasterBGfunc = function(x, y, z, item) {
                    var properties = item.properties;
                    return 'http://' + gmx.hostName
                        +'/TileSender.ashx?ModeKey=tile'
                        +'&x=' + x
                        +'&y=' + y
                        +'&z=' + z
                        +'&LayerName=' + properties[layerLink]
                        +'&MapName=' + gmx.mapName
                        +'&key=' + encodeURIComponent(gmx.sessionKey);
                };
                gmx.imageQuicklookProcessingHook = gmxImageTransform;
            }
        }
        if(prop.Quicklook) {
			var template = gmx.Quicklook = prop.Quicklook;
			gmx.quicklookBGfunc = function(item) {
				var url = template,
                    reg = /\[([^\]]+)\]/,
                    matches = reg.exec(url);
				while(matches && matches.length > 1) {
					url = url.replace(matches[0], item.properties[gmx.tileAttributeIndexes[matches[1]]]);
					matches = reg.exec(url);
				}
				return url;
			};
			gmx.imageProcessingHook = gmxImageTransform;
		}
    },

    addData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.addData(data, options);
            this._update();
        }
        return this;
	},

    removeData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.removeData(data, options);
            this._update();
        }
        return this;
	}
});
