// Плагин векторного слоя
L.TileLayer.gmxVectorLayer = L.TileLayer.Canvas.extend(
{
    initialize: function(options) {
        options = L.setOptions(this, options);
        
        this._drawQueue = [];
        
        this._gmx = {
            'hostName': options.hostName || 'maps.kosmosnimki.ru'
            ,'mapName': options.mapName
            ,'layerName': options.layerName
            ,'beginDate': options.beginDate
            ,'endDate': options.endDate
            ,'sortItems': options.sortItems || function(a, b) { return Number(a.id) - Number(b.id); },
            tileSubscriptions: []
        };
        
        var apikeyRequestHost = options.apikeyRequestHost || this._gmx.hostName;
        var myLayer = this;
        
        var getLayer = function(arr, flag) {
			if(flag) return true;
            for(var i=0, len=arr.length; i<len; i++) {
                var layer = arr[i];
                if(layer.type === 'group') {
					getLayer(layer.content.children);
				} else if(layer.type === 'layer' && myLayer._gmx.layerName === layer.content.properties.name) {
                    var ph = layer['content'];
                    myLayer._gmx.properties = ph['properties'];
                    myLayer._gmx.geometry = ph['geometry'];
                    myLayer._gmx.attr = myLayer.initLayerData(ph);
                    myLayer._gmx.vectorTilesManager = new gmxVectorTilesManager(myLayer._gmx, ph);
                    myLayer._update();
                    return true;
                }
            }
        }
        
        var setSessionKey = function(sk) {
			myLayer._gmx.sessionKey = sk;
            myLayer._gmx.tileSenderPrefix = "http://" + myLayer._gmx.hostName + "/" + 
                "TileSender.ashx?WrapStyle=None" + 
                "&key=" + encodeURIComponent(sk);
        }
        
        //TODO: move to onAdd()?
        gmxMapManager.getMap(apikeyRequestHost, options.apiKey, this._gmx.mapName).done(
            function(ph) {
                setSessionKey(gmxSessionManager.getSessionKey(apikeyRequestHost)); //should be already received
                getLayer(ph.children);
            },
            function(ph) {
                console.log('Error: ' + myLayer._gmx.mapName + ' - ' + ph.error);
            }
        );
        
        this.on('tileunload', function(e) {
            var tile = e.tile,
                tp = tile._tilePoint,
                gtp = gmxAPIutils.getTileNumFromLeaflet(tp, tile._zoom);
            
            var gmxkey = gtp.z + '_' + gtp.x + '_' + gtp.y;
            this._gmx.vectorTilesManager.off(this._gmx.tileSubscriptions[gmxkey]);
            delete this._gmx.tileSubscriptions[gmxkey];
            
            for (var k = this._drawQueue.length-1; k >= 0; k--) {
                var elem = this._drawQueue[k];
                if (elem.tp.x == tp.x && elem.tp.y == tp.y && elem.z == tile._zoom) {
                    this._drawQueue.splice(k, k+1);
                }
            }
        })
    },
        
    onAdd: function(map) {
        L.TileLayer.Canvas.prototype.onAdd.call(this, map);
                
        map.on('zoomstart', function() {
            this._gmx['zoomstart'] = true;
        }, this);
        
        map.on('zoomend', function() {
            this._gmx['zoomstart'] = false;
            this._prpZoomData(map._zoom);
        }, this);
    },
    //public interface
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
            _this = this;
            
        var drawNextTile = function() {
            if (!queue.length) {
                return;
            }
            
            var bbox = queue.shift();
            _this.gmxDrawTile(bbox.tp, bbox.z);
            
            setTimeout(drawNextTile, 0);
        }
            
        queue.push({tp: tilePoint, z: zoom});
        isEmpty && setTimeout(drawNextTile, 0);
    },
    
    _updateDrawnTiles: function(reloadTiles) {
        for (var key in this._tiles) {
            var kArr = key.split(':'),
                x = parseInt(kArr[0], 10),
                y = parseInt(kArr[1], 10),
                tilePoint = L.point(x, y),
                gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, this._map._zoom);
                
            var cntToLoad = 0;
            if (reloadTiles) {
                this._gmx.vectorTilesManager.loadTiles(gmxTilePoint);
                cntToLoad = this._gmx.vectorTilesManager.getNotLoadedTileCount(gmxTilePoint);
            }
            if (cntToLoad === 0) {
                this._drawTileAsync(tilePoint, this._map._zoom);
            }
        }
    },
    
    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx._tilesToLoad = 0;
        // Получение сдвига OSM
        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), map._zoom);
        var point = map.project(pos);
        gmx.shiftY = point.y - p1.y;
        //console.log(gmx.shiftY);
    },
    
	_initContainer: function () {
		L.TileLayer.Canvas.prototype._initContainer.call(this);
		this._prpZoomData(this._map._zoom);
	}
	,
	_update: function () {
		if(this._gmx['zoomstart']) return; //TODO: buggy restriction?

		var bounds = this._map.getPixelBounds(),
		    zoom = this._map.getZoom(),
		    tileSize = this.options.tileSize;

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			clearTimeout(this._clearBgBufferTimer);
			this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			return;
		}

		var shiftY = this._gmx.shiftY || 0;		// Сдвиг к OSM
		bounds.min.y += shiftY;
		bounds.max.y += shiftY;

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
		var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;
            
		if (!gmx.attr) return;

		var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var key = gmxTilePoint.z + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y;
        if (!gmx.tileSubscriptions[key]) {
            gmx.tileSubscriptions[key] = gmx.vectorTilesManager.on(gmxTilePoint, function() {
                myLayer._drawTileAsync(tilePoint, zoom);
            });
        }
	},
	gmxDrawTile: function (tilePoint, zoom) {
		var gmx = this._gmx;
		if(gmx['zoomstart']) return;
        
        var domTile = this.gmxGetCanvasTile(tilePoint),
            ctx = domTile.getContext('2d'),
            style = gmx.attr.styles[0],
            screenTile = new gmxScreenVectorTile(gmx, tilePoint, zoom);
            
        screenTile.drawTile(ctx, style);
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
		var shiftY = this._gmx.shiftY || 0;		// Сдвиг к OSM
		tilePos.y -= shiftY;
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
		this.tileDrawn(tile);
		return this._tiles[tKey];
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
				for (var i = 0; i < tiles.length; i++) {
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
		if (this._gmx._tilesToLoad < 1) {
			this.fire('load');

			if (this._animated) {
				// clear scaled tiles after all new tiles are loaded (for performance)
				clearTimeout(this._clearBgBufferTimer);
				this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			}
		}
	}
	,
	_tileOnLoad: function (tile) {
		if (tile) L.DomUtil.addClass(tile, 'leaflet-tile-loaded');
		this._tileLoaded();
	}
	,
	tileDrawn: function (tile) {
		this._tileOnLoad(tile);
	},
    initLayerData: function(layerDescription) {					// построение списка тайлов
        var gmx = this._gmx,
            res = {'tilesAll':{}, 'items':{}, 'tileCount':0, 'itemCount':0},
            prop = layerDescription.properties,
            type = prop['type'] + (prop['Temporal'] ? 'Temporal' : '');

		var defaultStyle = {lineWidth: 1, strokeStyle: 'rgba(0, 0, 255, 1)'};
		var styles = [];
		if(prop.styles) {
			for (var i = 0, len = prop['styles'].length; i < len; i++)
			{
				var it = prop['styles'][i];
				var pt = {};
				var renderStyle = it['RenderStyle'];
				if(renderStyle['outline']) {
					var outline = renderStyle['outline'];
					pt['lineWidth'] = outline.thickness || 0;
					var color = outline.color || 255;
					var opacity = ('opacity' in outline ? outline['opacity']/100 : 1);
					pt['strokeStyle'] = gmxAPIutils.dec2rgba(color, opacity);
				}
				if(renderStyle['marker']) {
					var marker = renderStyle.marker;
					if(prop['GeometryType'] === 'point') {
						if(marker['size']) {
							pt['sx'] = pt['sy'] = marker['size'];
						} else {
							pt['circle'] = 4;
						}
					}
				}
				if(renderStyle['fill']) {
					var fill = renderStyle.fill;
					var color = fill.color || 255;
					var opacity = ('opacity' in fill ? fill['opacity']/100 : 1);
					pt['fillStyle'] = gmxAPIutils.dec2rgba(color, opacity);
				}
				styles.push(pt);
			}
		} else {
            styles.push(defaultStyle);
        }
		res.styles = styles;

		var addRes = function(z, x, y, v, s, d) {
            var tile = new gmxVectorTile(gmx, x, y, z, v, s, d);
			res.tilesAll[tile.gmxTileKey] = {tile: tile};
		}
		var cnt;
		var arr = prop['tiles'] || [];
		var vers = prop['tilesVers'] || [];
		if(type === 'VectorTemporal') {
			arr = prop['TemporalTiles'];
			vers = prop['TemporalVers'];
			for (var i = 0, len = arr.length; i < len; i++)
			{
				var arr1 = arr[i];
				var z = Number(arr1[4])
					,y = Number(arr1[3])
					,x = Number(arr1[2])
					,s = Number(arr1[1])
					,d = Number(arr1[0])
					,v = Number(vers[i])
				;
				addRes(z, x, y, v, s, d);
			}
            cnt = arr.length;
			res['TemporalColumnName'] = prop['TemporalColumnName'];
			res['TemporalPeriods'] = prop['TemporalPeriods'];
			
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			res['ZeroDate'] = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			res['ZeroUT'] = res['ZeroDate'].getTime() / 1000;
		} else if(type === 'Vector') {
			for (var i = 0, cnt = 0, len = arr.length; i < len; i+=3, cnt++) {
				addRes(Number(arr[i+2]), Number(arr[i]), Number(arr[i+1]), Number(vers[cnt]), -1, -1);
			}
		}
		res['tileCount'] = cnt;
		res['layerType'] = type;						// VectorTemporal Vector
		res['identityField'] = prop['identityField'];	// ogc_fid
		res['GeometryType'] = prop['GeometryType'];		// тип геометрий обьектов в слое
		if(prop['IsRasterCatalog']) {
			res['rasterBGfunc'] = function(x, y, z, idr) {
				return 'http://' + gmx.hostName
					+'/TileSender.ashx?ModeKey=tile'
					+'&x=' + x
					+'&y=' + y
					+'&z=' + z
					+'&idr=' + idr
					+'&MapName=' + gmx.mapName
					+'&LayerName=' + gmx.layerName
					+'&key=' + encodeURIComponent(gmx.sessionKey);
			};
		}
		return res;
	}
});