// Плагин векторного слоя
L.gmx.VectorLayer = L.TileLayer.Canvas.extend(
{
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
                    this._drawQueue.splice(k, k+1);
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
        this._gmx.attr = this.initLayerData(ph);
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
	}
	,

	setFilter: function (func) {
        this._gmx.vectorTilesManager.setFilter('userFilter', func);
		this._update();
	}
	,
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
            gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
            key = zoom + '_' + tilePoint.x + '_' + tilePoint.y,
            _this = this
            
        if ( key in this._drawQueueHash ) {
            return;
        }
            
        var drawNextTile = function() {
            if (!queue.length) {
				_this.fire('doneDraw');
                return;
            }
            
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.key];
            _this.gmxDrawTile(bbox.tp, bbox.z);
            
            setTimeout(drawNextTile, 0);
        }
            
        queue.push({gtp: gtp, tp: tilePoint, z: zoom, key: key});
        this._drawQueueHash[key] = true;
		if (isEmpty) {
			this.fire('startDraw');
			setTimeout(drawNextTile, 0);
		}
		
    },
	
	_updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map;

        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), gmx.currentZoom);
        var point = map.project(pos);
        gmx.shiftX = gmx.attr.shiftXlayer ? gmx.attr.shiftXlayer * gmx.mInPixel : 0;
        gmx.shiftY = point.y - p1.y + (gmx.attr.shiftYlayer ? gmx.attr.shiftYlayer * gmx.mInPixel : 0);

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
	}
	,
	_update: function () {
		if (!this._map || this._gmx.zoomstart) return;

		var bounds = this._map.getPixelBounds(),
		    zoom = this._map.getZoom(),
		    tileSize = this.options.tileSize;

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			clearTimeout(this._clearBgBufferTimer);
			this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			return;
		}

		var shiftX = this._gmx.shiftX || 0;		// Сдвиг слоя
		var shiftY = this._gmx.shiftY || 0;		// Сдвиг слоя + OSM
        bounds.min.y += shiftY, bounds.max.y += shiftY;
        bounds.min.x -= shiftX, bounds.max.x -= shiftX;

		var nwTilePoint = new L.Point(
		        Math.floor(bounds.min.x / tileSize),
		        Math.floor(bounds.min.y / tileSize)),

		    seTilePoint = new L.Point(
		        Math.floor(bounds.max.x / tileSize),
		        Math.floor(bounds.max.y / tileSize)),

		    tileBounds = new L.Bounds(nwTilePoint, seTilePoint);

		this._addTilesFromCenterOut(tileBounds);

		if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
			this._removeOtherTiles(tileBounds);
		}
	}
    ,
	_addTile: function (tilePoint) {
        //console.log('addTile', tilePoint);
		var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

		if (!gmx.attr || !gmx.styleManager.isVisibleAtZoom(zoom)) {
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
	}
	,
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
	}
	,
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
        var maxX = point.x,
            minX = maxX - 256,
            maxY = point.y,
            minY = maxY - 256,
            gmx = this._gmx,
            zoom = this._map._zoom,
            pos = null;
		for (var t in this._tiles) {
            var tile = this._tiles[t],
                tilePos = tile._leaflet_pos;
            if(maxX < tilePos.x || minX > tilePos.x || maxY < tilePos.y || minY > tilePos.y) continue;
            var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tile._tilePoint, zoom);
            return geoItems = gmx.vectorTilesManager.getItems(gmxTilePoint, zoom);
        }
        return null;
    },
	gmxObjectsByPoint: function (arr, point) {    // Получить верхний обьект по координатам mouseClick
        var gmx = this._gmx,
            out = [],
            mInPixel = gmx.mInPixel,
            mercPoint = [point.x, point.y],
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
            
            out.push({ id: idr
                ,properties: item.properties
                ,geometry: geoItem.geometry
                //,latlng: L.Projection.Mercator.unproject({'x':bounds.min.x, 'y':bounds.min.y})
            });
		}
        return out;
    },
	_gmxLastHover: null
    ,
	_chkLastHover: function (ev) {
        if (this._gmxLastHover) {
            if (this.hasEventListeners('mouseout')) {
                ev.gmx = this._gmxLastHover;
                this.fire('mouseout', ev);
            }
        }
        this._gmxLastHover = null;
        this._map.doubleClickZoom.enable();
    },
	gmxEventCheck: function (ev) {
        var type = ev.type,
            point = { x: ev.layerPoint.x, y: ev.layerPoint.y }
            arr = [];

        if (
            this.hasEventListeners('mousemove') ||
            this.hasEventListeners('mouseover') ||
            this.hasEventListeners('mouseout') ||
            this.hasEventListeners(type)
            ) {
            var geoItems = this._gmxGetTileByPoint(point);
            if (geoItems && geoItems.length) {
                var mercatorPoint = L.Projection.Mercator.project(ev.latlng),
                    arr = this.gmxObjectsByPoint(geoItems, mercatorPoint);
                if (arr && arr.length) {
                    ev.gmx = {
                        targets: arr
                        ,target: arr[0]
                    };
                    this.fire(type, ev);
                    if (type === 'mousemove') {
                        if (!this._gmxLastHover && this.hasEventListeners('mouseover')) {
                            this.fire('mouseover', ev);
                        }
                    }
                    this._gmxLastHover = ev.gmx;
                    this._map.doubleClickZoom.disable();
                    return true;
                }
            }
        }
        this._chkLastHover(ev);
        return false;
	},

    initLayerData: function(layerDescription) {					// построение списка тайлов
        var gmx = this._gmx,
            res = {items:{}, tileCount:0, itemCount:0},
            prop = layerDescription.properties,
            type = prop.type + (prop.Temporal ? 'Temporal' : '');

		var cnt;
		if(type === 'VectorTemporal') {
            cnt = prop.TemporalTiles;
			res.TemporalColumnName = prop.TemporalColumnName;
			res.TemporalPeriods = prop.TemporalPeriods;
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			res.ZeroDate = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			res.ZeroUT = res.ZeroDate.getTime() / 1000;
		}
        
		res.tileCount = cnt;
		res.layerType = type;						// VectorTemporal Vector
		res.identityField = prop.identityField;	// ogc_fid
		res.GeometryType = prop.GeometryType;		// тип геометрий обьектов в слое
		res.minZoomRasters = prop.RCMinZoomForRasters;// мин. zoom для растров

        //prop.pointsFields = 'x1,y1,x2,y2,x3,y3,x4,y4';
        if(prop.pointsFields) {
            res.pointsFields = prop.pointsFields.split(',');
        }

		if(prop.IsRasterCatalog) {
			res.IsRasterCatalog = prop.IsRasterCatalog;
			res.rasterBGfunc = function(x, y, z, item) {
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
			res.imageQuicklookProcessingHook = gmxImageTransform;
		}
        if(prop.Quicklook) {
			var template = res.Quicklook = prop.Quicklook;
			res.quicklookBGfunc = function(item) {
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
			res.imageProcessingHook = gmxImageTransform;
		}
        if('MetaProperties' in prop) {
            var meta = prop.MetaProperties;
            if('shiftX' in meta || 'shiftY' in meta) {              // сдвиг всего слоя
                res.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                res.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            // if('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                // if(meta.shiftXfield) res.shiftXfield = meta.shiftXfield.Value;
                // if(meta.shiftYfield) res.shiftYfield = meta.shiftYfield.Value;
            // }
		}
		return res;
	}
});