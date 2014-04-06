// Плагин векторного слоя
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
        
        this._gmx = {
            hostName: options.hostName || 'maps.kosmosnimki.ru',
            mapName: options.mapName,
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || function(a, b) { return Number(a.id) - Number(b.id); },
            styles: options.styles || [],
            tileSubscriptions: []
        };

        this.on('tileunload', function(e) {
            var tile = e.tile,
                tp = tile._tilePoint;

            var key = tile._zoom + '_' + tp.x + '_' + tp.y;
            if (key in this._gmx.tileSubscriptions) {
                this._gmx.vectorTilesManager.off(this._gmx.tileSubscriptions[key].id);
                delete this._gmx.tileSubscriptions[key];
            }
            
            for (var k = this._drawQueue.length-1; k >= 0; k--) {
                var elem = this._drawQueue[k];
                if (elem.key === key) {
                    this._drawQueue.splice(k, 1);
                }
            }
            delete this._drawQueueHash[key];
        })
    },

    _zoomStart: function() {
        this._gmx.zoomstart = true;
    },
    
    _zoomEnd: function() {
        this._gmx.zoomstart = false;
        this._prpZoomData(this._map._zoom);
    },

    onAdd: function(map) {
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw "GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer";
        }

        this._gmx.applyShift = map.options.crs === L.CRS.EPSG3857;
        
        L.TileLayer.Canvas.prototype.onAdd.call(this, map);

        map.on('mouseup', this._drawTileAsync, this);
        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        if (this._gmx.applyShift) {
            map.on('moveend', this._updateShiftY, this);
            this._updateShiftY();
        } else {
            this._gmx.shiftY = 0;
        }
    },

    onRemove: function(map) {
        L.TileLayer.Canvas.prototype.onRemove.call(this, map);
        map.off('mouseup', this._drawTileAsync, this);
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);

        if (this._gmx.applyShift) {
            map.off('moveend', this._updateShiftY, this);
        }
    },
    
    //public interface
    initFromDescription: function(ph) {
        var apikeyRequestHost = this.options.apikeyRequestHost || this._gmx.hostName;
        var sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        this._gmx.sessionKey = sk;
        this._gmx.tileSenderPrefix = "http://" + this._gmx.hostName + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk);
    
        this._gmx.properties = ph.properties;
        this._gmx.geometry = ph.geometry;
        this.initLayerData(ph);
        this._gmx.vectorTilesManager = new gmxVectorTilesManager(this._gmx, ph);
        this._gmx.styleManager = new gmxStyleManager(this._gmx);
        this._gmx.ProjectiveImage = new ProjectiveImage();
        this._update();
                
        this.initPromise.resolve();
    },

    setStyle: function (style, num) {
        var gmx = this._gmx;
        this.initPromise.then(function() {
            gmx.styleManager.setStyle(style, num);
        });
    },

    addStyleHook: function (func) {
        this._gmx.vectorTilesManager.addStyleHook(func);
    },

    removeStyleHook: function () {
        this._gmx.vectorTilesManager.removeStyleHook();
    },

    setPropertiesHook: function (func) {
        //this._gmx.vectorTilesManager.setPropertiesHook.bind(this._gmx.vectorTilesManager, 'userHook', func);
        this._gmx.vectorTilesManager.setPropertiesHook('userHook', func);
    },

    setFilter: function (func) {
        this._gmx.vectorTilesManager.setPropertiesHook('userFilter', function(item) {
            return func(item) ? item.properties : null;
        });
        this._update();
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;
        gmx.beginDate = beginDate;
        gmx.endDate = endDate;
        gmx.vectorTilesManager.setDateInterval(beginDate, endDate);
        this._update();
    },
    
    addTo: function (map) {
        map.addLayer(this);
        return this;
    },
    
    _drawTileAsync: function (tilePoint, zoom) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            key = zoom ? zoom + '_' + tilePoint.x + '_' + tilePoint.y : '',
            _this = this;
            
        if ( key in this._drawQueueHash ) {
            return;
        }
            
        var drawNextTile = function() {
            if (!queue.length) {    // TODO: may be need load rasters in tile
                _this.fire('doneDraw');
                return;
            }
            if (_this._map.gmxMouseDown) return;
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.key];
            _this.gmxDrawTile(bbox.tp, bbox.z);
            setTimeout(drawNextTile, 0);
        }
        if (key !== '') {
            var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
            queue.push({gtp: gtp, tp: tilePoint, z: zoom, key: key});
            this._drawQueueHash[key] = true;
        }
        if (isEmpty) {
            this.fire('startDraw');
        }
        setTimeout(drawNextTile, 0);
    },

    _updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map;

        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), gmx.currentZoom);
        var point = map.project(pos);
        gmx.shiftX = gmx.shiftXlayer ? gmx.shiftXlayer * gmx.mInPixel : 0;
        gmx.shiftY = point.y - p1.y + (gmx.shiftYlayer ? gmx.shiftYlayer * gmx.mInPixel : 0);

        for (var t in this._tiles) {
            var tile = this._tiles[t];
            var pos = this._getTilePos(tile._tilePoint);
            pos.x += gmx.shiftX;
            pos.y -= gmx.shiftY;
            L.DomUtil.setPosition(tile, pos, L.Browser.chrome || L.Browser.android23);
        }
        this._update();
    },

    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx._tilesToLoad = 0;
        gmx.currentZoom = map._zoom;
    },
    
    _initContainer: function () {
        L.TileLayer.Canvas.prototype._initContainer.call(this);

        var subscriptions = this._gmx.tileSubscriptions,
            zoom = this._map._zoom;
        this._prpZoomData(zoom);
       
        for (var key in subscriptions) {
            if (subscriptions[key].gtp.z !== zoom) {
                this._gmx.vectorTilesManager.off(subscriptions[key].id);
                delete subscriptions[key];
            }
        }
    },
    _update: function () {
        if (!this._map || this._gmx.zoomstart) return;

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
        //console.log('addTile', tilePoint);
        var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

        if (!gmx.layerType || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            this._tileLoaded();
            return;
        }

        var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var key = zoom + '_' + tilePoint.x + '_' + tilePoint.y;
        if (!gmx.tileSubscriptions[key]) {
            gmx._tilesToLoad++;
            var subscrID = gmx.vectorTilesManager.on(gmxTilePoint, function() {
                myLayer._drawTileAsync(tilePoint, zoom);
            });
            gmx.tileSubscriptions[key] = {id: subscrID, gtp: gmxTilePoint};
        }
    },
    gmxDrawTile: function (tilePoint, zoom) {
        var gmx = this._gmx,
            _this = this;

        if(gmx.zoomstart) return;

        var screenTile = new gmxScreenVectorTile(this, tilePoint, zoom);
        this._gmx.styleManager.deferred.then(function () {
            screenTile.drawTile();
            var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
            if (gmx.vectorTilesManager.getNotLoadedTileCount(gtp) === 0) {
                gmx._tilesToLoad--;
                _this._tileLoaded();
            }
        });
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
    _stopLoadingImages: function (container) {
    }
    ,
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
    }
    ,
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
    _lastCursor: null
    ,
    _gmxGetTileByPoint: function (point) {
        var gmx = this._gmx,
            zoom = this._map._zoom,
            maxX = point.x,
            minX = maxX - 256,
            maxY = point.y,
            minY = maxY - 256,
            pos = null;
        for (var t in this._tiles) {
            var tile = this._tiles[t],
                tilePos = tile._leaflet_pos;
            if(maxX < tilePos.x || minX > tilePos.x || maxY < tilePos.y || minY > tilePos.y) continue;
            var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tile._tilePoint, zoom);
            return gmx.vectorTilesManager.getItems(gmxTilePoint, zoom);
        }
        return null;
    },
    gmxObjectsByPoint: function (arr, point) {    // Получить верхний обьект по координатам mouseClick
        var gmx = this._gmx,
            out = [],
            mInPixel = gmx.mInPixel,
            shiftXlayer = gmx.shiftXlayer || 0,
            shiftYlayer = gmx.shiftYlayer || 0,
            mercPoint = [point.x - shiftXlayer, point.y - shiftYlayer],
            pixelPoint = [mercPoint[0] * mInPixel, mercPoint[1] * mInPixel],
            bounds = gmxAPIutils.bounds([mercPoint]);
        var getMarkerPolygon = function(mb, dx, dy) {    // Получить полигон по bounds маркера
            var x = (mb.min.x + mb.max.x) / 2, y = (mb.min.y + mb.max.y) / 2;
            return [
                [x - dx, y - dy]
                ,[x - dx, y + dy]
                ,[x + dx, y + dy]
                ,[x + dx, y - dy]
                ,[x - dx, y - dy]
            ];
        }
        
        for (var i = arr.length - 1; i >= 0; i--) {
            var geoItem = arr[i],
                idr = geoItem.id,
                item = gmx.vectorTilesManager.getItem(idr),
                parsedStyle = item.options.parsedStyleKeys,
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
                        var flag = false,
                            chkPoint = mercPoint,
                            flagPixels = geoItem.pixels && geoItem.pixels.z === gmx.currentZoom;
                        if(flagPixels) {
                            coords = geoItem.pixels.coords;
                            chkPoint = pixelPoint;
                        }
                        for (var j = 0, len = coords.length; j < len; j++) {
                            if (gmxAPIutils.isPointInPolygonWithHell(chkPoint, coords[j])) {
                                flag = true;
                                break;
                            }
                        }
                        if (!flag) continue;
                    }
                } else if(type === 'POLYGON') {
                    if(parsedStyle.marker) {
                        coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                        if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                    } else {
                        var chkPoint = mercPoint,
                            flagPixels = geoItem.pixels && geoItem.pixels.z === gmx.currentZoom;
                        if(flagPixels) {
                            coords = geoItem.pixels.coords[0];
                            chkPoint = pixelPoint;
                        }
                        if (!gmxAPIutils.isPointInPolygonWithHell(chkPoint, coords)) continue;
                    }
                } else if(type === 'POINT') {
                    coords = getMarkerPolygon(geoItem.bounds, dx, dy);
                    if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) continue;
                }
            }
            
            out.push({ id: idr
                ,properties: item.properties
                ,geometry: geoItem.geometry
                ,bounds: item.bounds
                //,latlng: L.Projection.Mercator.unproject({'x':bounds.min.x, 'y':bounds.min.y})
            });
		}
        return out;
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
                    layer._redrawTilesHash(lastHover.gmxTiles);    // reset hover
                }
            };
        if (!skipOver &&
            (type === 'mousemove'
            || this.hasEventListeners('mouseover')
            || this.hasEventListeners('mouseout')
            || this.hasEventListeners(type)
            )) {
            var point = { x: ev.layerPoint.x, y: ev.layerPoint.y },
                geoItems = this._gmxGetTileByPoint(point);
            if (geoItems && geoItems.length) {
                var lng = ev.latlng.lng % 360,
                    latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
                    mercatorPoint = L.Projection.Mercator.project(latlng),
                    arr = this.gmxObjectsByPoint(geoItems, mercatorPoint);
                if (arr && arr.length) {
                    var target = arr[0],
                        changed = !lastHover || lastHover.id !== target.id;
                    if (type === 'mousemove' && lastHover) {
                        if (!changed) return target.id;
                        gmx.lastHover = null;
                        chkHover('mouseout');
                    }
                    ev.gmx = {
                        targets: arr
                        ,target: target
                        ,id: target.id
                    };
                    if (this.hasEventListeners(type)) this.fire(type, ev);
                    if (type === 'mousemove' && changed) {
                        lastHover = gmx.lastHover = ev.gmx;
                        lastHover.gmxTiles = layer._getTilesByBounds(target.bounds);
                        chkHover('mouseover');
                    }
                    this._map.doubleClickZoom.disable();
                    return target.id;
                }
            }
        }
        gmx.lastHover = null;
        chkHover('mouseout');
        this._map.doubleClickZoom.enable();
        return 0;
    },
    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            tileSize = gmx.tileSize,
            zoom = this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
            minY = Math.floor((bounds.min.y + shiftY)/ tileSize), maxY = Math.floor((bounds.max.y + shiftY)/ tileSize),
            minX = Math.floor((bounds.min.x + shiftX)/ tileSize), maxX = Math.floor((bounds.max.x + shiftX)/ tileSize),
            gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                gmxTiles[zoom + '_' + x + '_' + y] = true;
            }
        }
        return gmxTiles;
    },
    redrawItem: function (id) {    // redraw Item
        var gmx = this._gmx,
            item = gmx.vectorTilesManager.getItem(id),
            gmxTiles = this._getTilesByBounds(item.bounds);
        this._redrawTilesHash(gmxTiles);    // reset hover
    },
    _redrawTilesHash: function (gmxTiles) {    // Перерисовать список gmxTiles тайлов на экране
        var gmx = this._gmx,
            zoom = this._map._zoom,
            pz = Math.pow(2, zoom);
        var tileBounds = this._getScreenTileBounds();
        for (y = tileBounds.min.y; y <= tileBounds.max.y; y++) {
            for (x = tileBounds.min.x; x <= tileBounds.max.x; x++) {
                var tx = (x % pz + (x < 0 ? pz : 0))% pz - pz/2,
                    ty = pz/2 - 1 - (y % pz + (y < 0 ? pz : 0))% pz;
                if (gmxTiles[zoom + '_' + tx + '_' + ty]) {
                    var key = zoom + '_' + x + '_' + y;
                    if(!this._drawQueueHash[key]) {
                        if (key in gmx.tileSubscriptions) {
                            gmx.vectorTilesManager.off(gmx.tileSubscriptions[key].id);
                        }
                        this._drawTileAsync(new L.Point(x, y), zoom);
                    }
                }
            }
        }
        return gmxTiles;
    },

    initLayerData: function(layerDescription) {     // обработка описания слоя
        var gmx = this._gmx,
            res = {items:{}, tileCount:0, itemCount:0},
            prop = layerDescription.properties,
            type = prop.type + (prop.Temporal ? 'Temporal' : '');

        gmx.items = {}, gmx.tileCount = 0, gmx.itemCount = 0;
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

        //prop.pointsFields = 'x1,y1,x2,y2,x3,y3,x4,y4';
        if(prop.pointsFields) {
            gmx.pointsFields = prop.pointsFields.split(',');
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

        if(prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            gmx.rasterBGfunc = function(x, y, z, item) {
                var properties = item.properties;
                return 'http://' + gmx.hostName
                    +'/TileSender.ashx?ModeKey=tile'
                    +'&x=' + x
                    +'&y=' + y
                    +'&z=' + z
                    +'&LayerName=' + properties.GMX_RasterCatalogID
                    +'&MapName=' + gmx.mapName
                    +'&key=' + encodeURIComponent(gmx.sessionKey);
            };
            gmx.imageQuicklookProcessingHook = gmxImageTransform;
        }
        if(prop.Quicklook) {
			var template = gmx.Quicklook = prop.Quicklook;
			gmx.quicklookBGfunc = function(item) {
				var properties = item.properties;
				var url = template;
				var reg = /\[([^\]]+)\]/;
				var matches = reg.exec(url);
				while(matches && matches.length > 1) {
					url = url.replace(matches[0], properties[matches[1]]);
					matches = reg.exec(url);
				}
				return url;
			};
			gmx.imageProcessingHook = gmxImageTransform;
		}
		return res;
	}
});