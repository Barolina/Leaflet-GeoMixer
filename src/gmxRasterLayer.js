// Плагин векторного слоя
L.TileLayer.gmxRasterLayer = L.TileLayer.Canvas.extend(
{
    initialize: function(options) {
        this.initPromise = new gmxDeferred();
        this._gmx = {
            'hostName': options.hostName || 'maps.kosmosnimki.ru'
            ,'mapName': options.mapName
            ,'layerName': options.layerName
            ,'badTiles': {}
            ,'tilesToLoad': 0
        };
        options = L.setOptions(this, options);
	},
    
    _zoomStart: function() {
        this._gmx['zoomstart'] = true;
    },
    
    _zoomEnd: function() {
        this._gmx['zoomstart'] = false;
        this._prpZoomData(map._zoom);
    },

    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.tilesToLoad = 0;
    },
    
    //public interface
    initFromDescription: function(ph) {
        var apikeyRequestHost = this.options.apikeyRequestHost || this._gmx.hostName;
        var sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        this._gmx.sessionKey = sk;
        this._gmx.tileSenderPrefix = "http://" + this._gmx.hostName + "/" + 
            "TileSender.ashx?ModeKey=tile" + 
            "&key=" + encodeURIComponent(sk) +
            "&MapName=" + this._gmx.mapName +
            "&LayerName=" + this._gmx.layerName;
    
        this._gmx.properties = ph.properties;
        this._gmx.geometry = ph.geometry;
                
        this.initPromise.resolve();
    },
    
    onAdd: function(map) {
        if(!this._gmx.bounds) this._initLayerData();
        L.TileLayer.Canvas.prototype.onAdd.call(this, map);
        this._prpZoomData(map._zoom);
        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        this._update();
        map.on('moveend', this._calcCurrentShiftY, this);
        this._calcCurrentShiftY();
    },

    onRemove: function(map) {
        L.TileLayer.Canvas.prototype.onRemove.call(this, map);
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
        map.off('moveend', this._calcCurrentShiftY, this);
    },

    _calcCurrentShiftY: function() {
        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), map._zoom);
        var point = map.project(pos);
        this._gmx.shiftY = point.y - p1.y;
        
        //update shifts for all the loaded tiles
        for (var t in this._tiles) {
            var tile = this._tiles[t];
            var pos = this._getTilePos(tile._tilePoint);
            pos.y -= this._gmx.shiftY;
            L.DomUtil.setPosition(tile, pos, L.Browser.chrome || L.Browser.android23);
        }
    },
    
    _initLayerData: function() {					// построение списка тайлов
        var gmx = this._gmx,
            prop = gmx.properties,
            style = prop.styles[0];

        //this.options.unloadInvisibleTiles = this._gmx.unloadInvisibleTiles;
        this.options.maxZoom = style.MaxZoom;
        this.options.minZoom = style.MinZoom;
        gmx.MaxZoom = prop.MaxZoom;
        gmx.bounds = gmxAPIutils.bounds(this._gmx.geometry.coordinates[0]);
        gmx.allFlag = (gmx.bounds.min.x < -gmxAPIutils.worldWidthMerc &&
            gmx.bounds.min.y < -gmxAPIutils.worldWidthMerc &&
            gmx.bounds.max.x > gmxAPIutils.worldWidthMerc &&
            gmx.bounds.max.y > gmxAPIutils.worldWidthMerc);
        gmx.tileFunction = function(x, y, z)
        {
                var tileSize = gmxAPIutils.tileSizes[z];
                var minx = x * tileSize;
                var maxx = minx + tileSize;
                if (maxx < gmx.bounds.min.x) {
                    x += Math.pow(2, z);
                }
                else if (minx > gmx.bounds.max.x) {
                    x -= Math.pow(2, z);
                }

            return gmx.tileSenderPrefix + 
                "&z=" + z + 
                "&x=" + x + 
                "&y=" + y;
        }
        gmx.loadRasterRecursion = function(pt) {
            if(!('to' in pt.zoom)) pt.zoom.to = pt.zoom.from;
            var z = pt.zoom.to;
            if(z > gmx.MaxZoom) {       // если есть максимальный zoom тайлов в описании слоя
                var dz = Math.pow(2, z - gmx.MaxZoom);
                pt.x = Math.floor(pt.x/dz), pt.y = Math.floor(pt.y/dz);
                z = pt.zoom.to = gmx.MaxZoom;
            }
            var rUrl = gmx.tileFunction(pt.x, pt.y, z);

            var onError = function() {
                if (z > 1) {
                    gmx.badTiles[rUrl] = true;
                    // запрос по раззумливанию растрового тайла
                    pt.zoom.to = z - 1, pt.x = Math.floor(pt.x/2), pt.y = Math.floor(pt.y/2);
                    gmx.loadRasterRecursion(pt);
                } else {
                    pt.callback(null);
                    return;
                }
            };
            if(gmx.badTiles[rUrl]) {
                onError();
                return;
            }

            gmxImageLoader.push({
                'src': rUrl
                ,'zoom': z
                ,'callback': function(imageObj) {
                    pt.callback({'img': imageObj, 'zoom': z, 'fromZoom': pt.zoom.from});
                }
                ,'onerror': onError
            });
        }
        
        this.on('load', function (e) {
            // генерится после отрисовки всех тайлов слоя(только если была отрисовка)
            //console.log('Layer repainted event', e);
            //this._map.fire('chkDrawDone');
        });
	}
    ,
    _reset: function (e) {
        L.TileLayer.Canvas.prototype._reset.call(this, e);
        this._gmx.tilesToLoad = 0;
    }
    ,
    _addTile: function (tilePoint, container) {
        this.drawTile(null, tilePoint, this._map._zoom);
    }
	,
	_update: function () {
		if (this._gmx.zoomstart) return;

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
    drawTile: function (tile, tilePoint, zoom) {
        var layer = this,
            gmx = this._gmx,
            map = this._map,
            tileKey = tilePoint.x + ':' + tilePoint.y;
        
		var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var isIntersects = 0;   // 2 - полностью в границе слоя 1 - пересекает границу слоя  0 - за границей слоя
        if(gmx.allFlag) isIntersects = 2;
        else {
            var tileSize = gmxAPIutils.tileSizes[zoom];
            var minx = gmxTilePoint.x * tileSize;
            var miny = gmxTilePoint.y * tileSize;
            var tileExtent = gmxAPIutils.bounds([[minx, miny], [minx + tileSize, miny + tileSize]]);
            if(tileExtent.intersects(gmx.bounds)) isIntersects++;
            //if(isIntersects) {
            // todo: нужна функция определения полностью ли screenTile в границе слоя или полностью за границей
            // т.е. можно не использовать canvas если нет раззумливания
            // или зануление isIntersects если полностью за границей
            //}
        }
        if(isIntersects === 0) return;

        gmx.tilesToLoad++;
        var onLoad = function(ph) {     // отрисовка тайла
            if(!ph || !ph['img']                                // нет растра
                || !layer._map || layer._gmx['zoomstart']       // идет анимация
                || layer._map.getZoom() !== zoom                // Только для текущего zoom
                ) {
                return;     
            }
            var pos = null;
            if(ph['zoom'] !== zoom) {   // необходима обрезка растра
                pos = gmxAPIutils.getTilePosZoomDelta(gmxTilePoint, zoom, ph['zoom']);
                if(pos.size < 0.00390625) return;   // меньше 1px
            }
            var type = (!pos && isIntersects === 2 ? 'img' : 'canvas');
            tile = layer.gmxGetTile(tilePoint, type, ph['img']);
            if(type === 'canvas') {
                var imageObj = ph['img'];
                var ctx = tile.getContext('2d');
                if(pos) {
                    var canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 256;
                    var ptx = canvas.getContext('2d');
                    ptx.drawImage(imageObj, Math.floor(pos.x), Math.floor(pos.y), pos.size, pos.size, 0, 0, 256, 256);
                    imageObj = canvas;
                }

                var pattern = ctx.createPattern(imageObj, "no-repeat");
                ctx.fillStyle = pattern;
                if(isIntersects === 2) ctx.fillRect(0, 0, 256, 256);
                else {
                    ctx.beginPath();
                    var drawPolygon = function(arr) {
                        for (var j = 0; j < arr.length; j++)
                        {
                            var xx = (arr[j][0] / tileSize - gmxTilePoint.x);
                            var yy = (arr[j][1] / tileSize - gmxTilePoint.y);
                            var px = 256 * xx;				px = (0.5 + px) << 0;
                            var py = 256 * (1 - yy);		py = (0.5 + py) << 0;
                            if(j == 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                    }
                    for(var i = 0, len = gmx.geometry.coordinates.length; i < len; i++) {
                        var tarr = gmx.geometry.coordinates[i];
                        if(gmx.geometry.type === 'MULTIPOLYGON') {
                            for (var j = 0, len1 = tarr.length; j < len1; j++) {
                                drawPolygon(tarr[j]);
                            }
                        } else {
                            drawPolygon(tarr);
                        }
                    }
                    ctx.closePath();
                }
                ctx.fill();
            }
            layer.tileDrawn(tile);
        }
        gmx.loadRasterRecursion({
            'callback': onLoad
            ,'zoom': {
                'from': zoom
            }
            ,'x': gmxTilePoint.x
            ,'y': gmxTilePoint.y
        });
    }
    ,
    gmxGetTile: function (tilePoint, type, img) {
        var tKey = tilePoint.x + ':' + tilePoint.y;
        if(tKey in this._tiles) return this._tiles[tKey];
        
        var tile = this._createTile(type, img);
        tile.id = tKey;
        tile._layer = this;
        tile._tilePoint = tilePoint;
        this._tileContainer.appendChild(tile);
        var tilePos = this._getTilePos(tilePoint);
		tilePos.y -= this._gmx.shiftY || 0; //World-mercator to Web-mercator shift
        
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
        if(L.Browser.mobile) tile.style.webkitTransform += ' scale3d(1.003, 1.003, 1)';

        this._tiles[tKey] = tile;
        tile._tileComplete = true;
        return this._tiles[tKey];
    }
	,
	_tileLoaded: function () {
		this._tilesToLoad--;
        if (this._gmx.tilesToLoad === 0) {
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
	}
	,
	tileDrawn: function (tile) {
        this._gmx.tilesToLoad--;
		this._tileOnLoad(tile);
		this._tileLoaded();
	}
    ,
    _createTile: function (type, img) {
        if(type === 'img') {
            tile = (img ? img.cloneNode(true) : L.DomUtil.create('img', 'leaflet-tile'));
            tile.className = 'leaflet-tile';
        } else {
            tile = L.DomUtil.create('canvas', 'leaflet-tile');
            tile.width = tile.height = 256;
        }
        return tile;
    }
});