// Плагин векторного слоя
L.TileLayer.gmxVectorLayer = L.TileLayer.Canvas.extend(
{
	gmxSetVisibility: function (func) {
		var options = this.options;
		options.gmx.chkVisibility = func;
		this._reset();
		this._update();
	}
	,
	gmxSetDateInterval: function (beginDate, endDate) {
		var options = this.options;
		options.gmx.beginDate = beginDate;
		options.gmx.endDate = endDate;
		if(options.gmx.attr.cntItems > 1000) {
			for (var key in options.gmx.attr['tilesNeedLoad']) {
				delete options.gmx.attr['tilesAll'][key]['data'];
				delete options.gmx.attr['tilesAll'][key]['inLoad'];
			}
			options.gmx.attr.cntItems = 0;
		}
		delete options.gmx.attr.tilesNeedLoad;
		this._reset();
		this._update();
	},
    addTo: function (map) {
		map.addLayer(this);
		return this;
	},	
	_initContainer: function () {
		L.TileLayer.Canvas.prototype._initContainer.call(this);
		var myLayer = this;
		var options = this.options;
		if(!('gmx' in L)) L.gmx = {'hosts':{}};
		var prpZoomData = function(zoom) {
			options.gmx.tileSize = gmxAPIutils.getTileSize(zoom);
			options.gmx.mInPixel = 256 / options.gmx.tileSize;
			options.gmx._tilesToLoad = 0;
			// Получение сдвига OSM
			var pos = myLayer._map.getCenter();
			var p1 = myLayer._map.project(new L.LatLng(gmxAPIutils.from_merc_y(gmxAPIutils.y_ex(pos.lat)), pos.lng), myLayer._map._zoom);
			var point = myLayer._map.project(pos);
			options.gmx.shiftY = point.y - p1.y;
		}
		
		if(!('gmx' in options)) {
			options.gmx = {
				'hostName': options.hostName || 'maps.kosmosnimki.ru'
				,'apikeyRequestHost': options.apikeyRequestHost || options.hostName
				,'apiKey': options.apiKey
				,'mapName': options.mapName
				,'layerName': options.layerName
				,'beginDate': options.beginDate
				,'endDate': options.endDate
				,'sortItems': options.sortItems || function(a, b) { return Number(a.id) - Number(b.id); }
			};

			this._map.on('zoomstart', function(e) {
				options.gmx['zoomstart'] = true;
			});
			this._map.on('zoomend', function(e) {
				options.gmx['zoomstart'] = false;
				prpZoomData(myLayer._map._zoom);
				myLayer._update();
			});
			
			var getMap = function(callback) {
				var pt = L.gmx['hosts'][options.gmx.hostName]['maps'][options.gmx.mapName];
				if(!pt) pt = L.gmx['hosts'][options.gmx.hostName]['maps'][options.gmx.mapName] = {};
				if(!pt['mapCallbacks']) {
					pt['mapCallbacks'] = [];
					gmxAPIutils.getMapPropreties(options.gmx, function(json) {
						var res = {'error': 'map not found'};
						if(json && json['Status'] === 'ok' && json['Result']) {
							res = pt['res'] = json['Result'];
						}
						for (var i = 0, len = pt['mapCallbacks'].length; i < len; i++) {
							pt['mapCallbacks'][i](res);
						}
						delete pt['mapCallbacks'];
					});
				}
				pt['mapCallbacks'].push(function(res) {
					callback(res);
				});
			}
			var getLayer = function(arr, callback) {
				for(var i=0, len=arr.length; i<len; i++) {
					var layer = arr[i];
					if(layer['type'] === 'layer') {
						if(options.gmx.layerName === layer['content']['properties']['name']) {
							var ph = layer['content'];
							options.gmx.properties = ph['properties'];
							options.gmx.geometry = ph['geometry'];
							var attr = gmxAPIutils.prepareLayerBounds(ph, options.gmx);
							options.gmx.attr = attr;
							myLayer._update();
							return;
						}
					}
				}
			}
			var setSessionKey = function(st) {
				options.gmx.tileSenderPrefix = "http://" + options.gmx.hostName + "/" + 
					"TileSender.ashx?WrapStyle=None" + 
					"&key=" + encodeURIComponent(st);
			}
			
			var pt = L.gmx['hosts'][options.gmx.hostName];
			if(!pt) pt = L.gmx['hosts'][options.gmx.hostName] = {'maps': {}};
            
            gmxSessionManager.getSessionKey(options.gmx.apikeyRequestHost, options.gmx.apiKey).done(function(key) {
                console.log('aaa', key);
                setSessionKey(key);
                if(!pt['maps'][options.gmx.mapName]) {
					getMap(function(ph) {
						if(ph.error || !ph.children) {
							console.log('Error: ' + options.gmx.mapName + ' - ' + ph.error);
						} else {
							getLayer(ph.children);
						}
					});
				} else {
					getLayer(pt['maps'][options.gmx.mapName]['res'].children);
				}
            })
		}
		prpZoomData(myLayer._map._zoom);
		//console.log('_initContainer: ', options.gmx.shiftY);
	}
	,
	_update: function () {
		//if (!this._map) { return; }
		if(this.options.gmx['zoomstart']) return;

		var bounds = this._map.getPixelBounds(),
		    zoom = this._map.getZoom(),
		    tileSize = this.options.tileSize;

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			clearTimeout(this._clearBgBufferTimer);
			this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			return;
		}

		var shiftY = (this.options.gmx.shiftY ? this.options.gmx.shiftY : 0);		// Сдвиг к OSM
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
	_addTile: function (tilePoint, container) {
		var myLayer = this, zoom = myLayer._map._zoom;
		var gmx = this.options.gmx;
		if(!gmx.attr) return;
		if(!gmx.attr.tilesNeedLoad) {
			var res = gmxAPIutils.getNeedTiles(gmx.attr, gmx.beginDate, gmx.endDate);
			gmx.attr.tilesNeedLoadCounts = res.tilesNeedLoadCounts;
			gmx.attr.tilesNeedLoad = res.tilesNeedLoad;
		}
		this.options.gmx._tilesToLoad++;
		if(!gmx.attr.needRedraw) gmx.attr.needRedraw = [];
		gmx.attr.needRedraw.push(tilePoint);
		var redraw = function() {
			for (var i = 0, len = gmx.attr.needRedraw.length; i < len; i++) {
				myLayer.gmxDrawTile(gmx.attr.needRedraw[i], zoom);
			}
			gmx.attr.needRedraw = [];
		}
		var gmxTilePoint = this.gmxGetTileNum(tilePoint, zoom);
		(function() {
			var tp = tilePoint;
			var gtp = gmxTilePoint;
//console.log('tp ', tp);
			var cnt = gmxAPIutils.loadTile(gmx, gtp, tp, function(ph) {
				var gmxTileKey = ph.gmxTileKey;
				if(!gmx.attr['tilesAll'][gmxTileKey]['data']) {
					gmx.attr.cntItems += gmxAPIutils.parseTile(gmx, ph);
				}
				var tilePointArr = gmx.attr['tilesAll'][gmxTileKey]['fromTilePoints'];
				for (var i = 0, len = tilePointArr.length; i < len; i++) {
					myLayer.gmxDrawTile(tilePointArr[i], zoom);
				}
			});
			if(cnt === 0) myLayer.gmxDrawTile(tp, zoom);
		})();
//console.log('loadTile cnt: ', cnt , gmxTilePoint.gmxTileID);
	}
	,
	gmxDrawTile: function (tilePoint, zoom) {
		var options = this.options;
		var gmx = options.gmx;
		gmx._tilesToLoad--;
		if(gmx['zoomstart']) return;
		var showRaster = (
			'rasterBGfunc' in gmx.attr
			&&
			(
				zoom >= gmx['properties']['RCMinZoomForRasters'] || gmx['properties']['quicklook']
			)
			? true
			: false
		);
		
		var gmxTilePoint = this.gmxGetTileNum(tilePoint, zoom);
		if(!gmxTilePoint['rasters']) gmxTilePoint['rasters'] = {};
		if(!gmxTilePoint['items']) gmxTilePoint['items'] = [];
		for (var key in gmx.attr['tilesNeedLoad']) {
			var pt = gmx.attr['tilesAll'][key];
			if(!gmxAPIutils.isTileKeysIntersects(gmxTilePoint, pt['gmxTilePoint'])) continue;
			var data = pt['data'] || [];
			if(data.length === 0) continue;
			for (var j = 0, len1 = data.length; j < len1; j++) {
				var it = data[j];
				var item = gmx.attr['items'][it.id];
				if(gmx.chkVisibility && !gmx.chkVisibility(item)) {
					continue;
				}
				if(gmx.attr['layerType'] === 'VectorTemporal') {
					var unixTimeStamp = item['propHiden']['unixTimeStamp'];
					if(unixTimeStamp < gmx.attr['ut1'] || unixTimeStamp > gmx.attr['ut2']) continue;
				}
				if(!it['bounds']) gmxAPIutils.itemBounds(it);
				if(!gmxTilePoint['bounds'].intersects(it['bounds'])) continue;
				if(!it['hideLines']) gmxAPIutils.chkHiddenPoints({'gmx':gmx, 'gmxTileKey':key});
				gmxTilePoint['items'].push(it);
			}
		}
		//console.log('_tilesToLoad: ', gmx._tilesToLoad);
		if(showRaster) {
			var layer = this;
			gmxAPIutils.getTileRasters({
				'gmx': gmx
				,'gmxTilePoint': gmxTilePoint
				,'zoom': zoom
			}, function(pt) {
				var res = layer.gmxPaintTile(pt['gmxTilePoint'], tilePoint);
			});
		} else {
			var res = this.gmxPaintTile(gmxTilePoint, tilePoint);
		}
	}
	,
	gmxPaintTile: function (gmxTilePoint, tilePoint) {
		var options = this.options;
		var gmx = options.gmx;
		var style = gmx.attr['styles'][0];
		return gmxAPIutils.paintTile({
			'gmx': gmx
			,'gmxTilePoint': gmxTilePoint
			,'layer': this
			,'tilePoint': tilePoint
		}, style);
	}
	,
	gmxGetCanvasTile: function (tilePoint) {
		var tKey = tilePoint.x + ':' + tilePoint.y;
		//console.log('gmxGetCanvasTile: ', tKey);
		for(var key in this._tiles) {
			if(key == tKey) return this._tiles[key];
		}
		var tile = this._getTile();
		tile.id = tKey;
		tile._layer = this;
		tile._tileComplete = true;
		tile._tilePoint = tilePoint;
		this._tiles[tKey] = tile;
		this._tileContainer.appendChild(tile);

		var tilePos = this._getTilePos(tilePoint);
		var shiftY = (this.options.gmx.shiftY ? this.options.gmx.shiftY : 0);		// Сдвиг к OSM
		if(shiftY !== 0) tilePos.y -= shiftY;
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
		this.tileDrawn(tile);
		return this._tiles[tKey];
	}
	,
	gmxGetTileNum: function (tilePoint, zoom) {
		var pz = Math.pow(2, zoom);
		var tx = tilePoint.x % pz + (tilePoint.x < 0 ? pz : 0);
		var ty = tilePoint.y % pz + (tilePoint.y < 0 ? pz : 0);
		var gmxTilePoint = {
			'z': zoom
			,'x': tx % pz - pz/2
			,'y': pz/2 - 1 - ty % pz
		};
		gmxTilePoint['gmxTileID'] = zoom + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y
		
		var mercTileSize = this.options.gmx.tileSize;
		var p = [gmxTilePoint.x * mercTileSize, gmxTilePoint.y * mercTileSize];
		var arr = [p, [p[0] + mercTileSize, p[1] + mercTileSize]];
		gmxTilePoint['bounds'] = gmxAPIutils.bounds(arr);
		return gmxTilePoint;
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
		if (this.options.gmx._tilesToLoad < 1) {
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
	}
});