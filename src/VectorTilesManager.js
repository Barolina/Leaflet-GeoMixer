//Single vector tile, received from GeoMixer server
var gmxVectorTilesManager = function(gmx, layerDescription) {
    var subscriptions = {},
        freeSubscrID = 0,
        tiles = {},
        activeTileKeys = {},
        beginDate, endDate,
        isTemporalLayer = layerDescription.properties.Temporal,
        filters = {},
        items = {};
        
    var initTileList = function() {
        var props = layerDescription.properties,
            arr, vers;
            
        if (isTemporalLayer) {
            arr = props.TemporalTiles;
            vers = props.TemporalVers;
            
            for (var i = 0, len = arr.length; i < len; i++) {
                var arr1 = arr[i];
                var z = Number(arr1[4]),
                    y = Number(arr1[3]),
                    x = Number(arr1[2]),
                    s = Number(arr1[1]),
                    d = Number(arr1[0]),
                    v = Number(vers[i]),
                    tile = new gmxVectorTile(gmx, x, y, z, v, s, d);
                    
                tiles[tile.gmxTileKey] = {tile: tile, filterActual: {}};
            }
        } else {
            arr = props.tiles;
            vers = props.tilesVers;
            for (var i = 0, cnt = 0, len = arr.length; i < len; i+=3, cnt++) {
                var tile = new gmxVectorTile(gmx, Number(arr[i]), Number(arr[i+1]), Number(arr[i+2]), Number(vers[cnt]), -1, -1);
                tiles[tile.gmxTileKey] = {tile: tile};
                activeTileKeys[tile.gmxTileKey] = true;
            }
        }
    }
    
    initTileList();
    
    this.setDateInterval = function(newBeginDate, newEndDate) {
        if (!isTemporalLayer || (newBeginDate == beginDate && newBeginDate == endDate)) { return; };
        
        activeTileKeys = gmxAPIutils.getNeedTiles(gmx.attr, newBeginDate, newEndDate).tilesNeedLoad;
        
        for (var tileKey in tiles) {
            tiles[tileKey].filterActual['TemporalFilter'] = false;
        }
        
        for (var subscrID in subscriptions) {
            var tp = subscriptions[subscrID].tilePoint;
            this.loadTiles(tp);
            if (this.getNotLoadedTileCount(tp) == 0) {
                subscriptions[subscrID].callback();
            }
        }
        
        beginDate = newBeginDate;
        endDate = newEndDate;
    }
    
    this.setFilter = function(filterName, filterFunc) {
        
        for (var tileKey in tiles) {
            tiles[tileKey].filterActual[filterName] = false;
        }
        
        filters[filterName] = filterFunc;
        
        for (var subscrID in subscriptions) {
            subscriptions[subscrID].callback();
        }
    }

	// TODO: надо научить tileInfo.tile.isIntersects проверке пересечения с тайлами вокруг заданного
    var _isIntersects = function(tileInfo, gmxTilePoint) {
        var isIntersects = tileInfo.tile.isIntersects(gmxTilePoint);
		if(!isIntersects && gmx.attr.GeometryType === 'point') {
			var x = gmxTilePoint.x, y = gmxTilePoint.y, z = gmxTilePoint.z;
			isIntersects = tileInfo.tile.isIntersects({'x':x-1, 'y':y, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x+1, 'y':y, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x, 'y':y-1, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x, 'y':y+1, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x-1, 'y':y-1, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x+1, 'y':y-1, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x-1, 'y':y+1, 'z':z});
			if(!isIntersects) isIntersects = tileInfo.tile.isIntersects({'x':x+1, 'y':y+1, 'z':z});
		}
		return isIntersects;
    }

    this.getItems = function(gmxTilePoint, style) {
        var bounds = gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z);
        var sx = 2 * style['sx'] / gmx['mInPixel'];
        var sy = 2 * style['sy'] / gmx['mInPixel'];
        var resItems = [];
        for (var key in activeTileKeys) {
            
            var tileInfo = tiles[key];
			if (!_isIntersects(tileInfo, gmxTilePoint)) continue;
               
			var data = tileInfo.tile.data || [];
			for (var j = 0, len1 = data.length; j < len1; j++) {
                
				var it = data[j];
				var item = items[it.id];
                
                var isFiltered = false;
                for (var filterName in filters) {
                    if (filters[filterName] && !filters[filterName](item)) {
                        isFiltered = true;
                        break;
                    }
                }
                
                if (isFiltered) {continue;};
                
                
				if(!it.bounds) {
                    it.bounds = gmxAPIutils.itemBounds(it);
                }
                
				if (!bounds.intersects(it.bounds, sx, sy)) {
                    continue;
                }
                
				if (item.type === 'POLYGON' || item.type === 'MULTIPOLYGON') {
                    tileInfo.tile.calcHiddenPoints();
                }
                
				resItems.push(it);
			}
		}
        return resItems;
    }

    var _updateItemsFromTile = function(tile) {
        var gmxTileKey = tile.gmxTileKey;
		var layerProp = gmx.properties;
		var identityField = layerProp.identityField || 'ogc_fid';
		var data = tile.data;
		for (var i = 0, len = data.length; i < len; i++) {
			var it = data[i];
			var prop = it['properties'];
			delete it['properties'];
			var geom = it['geometry'];
			
			var id = it['id'] || prop[identityField];
			var item = items[id];
			if(item) {
				if(item['type'].indexOf('MULTI') == -1) item['type'] = 'MULTI' + item['type'];
			} else {
				item = {
					'id': id
					,'type': geom.type
					,'properties': prop
					,'propHiden': {
						'fromTiles': {}
					}
				};
				items[id] = item;
			}
			item['propHiden']['fromTiles'][gmxTileKey] = true;
			if(layerProp.TemporalColumnName) {
				var zn = prop[layerProp.TemporalColumnName] || '';
				zn = zn.replace(/(\d+)\.(\d+)\.(\d+)/g, '$2/$3/$1');
				var vDate = new Date(zn);
				var offset = vDate.getTimezoneOffset();
				item.propHiden.unixTimeStamp = vDate.getTime() - offset*60*1000;
			}
		}
		
		return data.length;
    }

    this.getNotLoadedTileCount = function(gmxTilePoint) {
        var count = 0;
        for (var key in activeTileKeys) {
            var tile = tiles[key].tile;
            if (tile.isIntersects(gmxTilePoint) && tile.state !== 'loaded') {
                count++;
            }
        }
        return count;
    }
    
    this.loadTiles = function(gmxTilePoint) {
        for (var key in activeTileKeys) (function(tile) {
        
			if (!tile.isIntersects(gmxTilePoint)) return;
           
            if (tile.state === 'notLoaded') {
                tile.load().done(function() {
                    gmx.attr.itemCount += _updateItemsFromTile(tile)//gmxAPIutils.updateItemsFromTile(gmx, tile);
                    for (var key in subscriptions) {
                        if (tile.isIntersects(subscriptions[key].tilePoint)) {
                            subscriptions[key].callback();
                        }
                    }
                })
            }
		})(tiles[key].tile);
    }
    
    this.on = function(gmxTilePoint, callback) {
        var id = 's'+(freeSubscrID++);
        subscriptions[id] = {tilePoint: gmxTilePoint, callback: callback};
        
        this.loadTiles(gmxTilePoint);
        
        if (this.getNotLoadedTileCount(gmxTilePoint) == 0) {
            callback();
        }
        
        return id;
    }
    
    this.off = function(id) {
        delete subscriptions[id];
    }
    
    this.getTile = function(tileKey) {
        return tiles[tileKey];
    }
    
    if (isTemporalLayer) {
        this.setFilter('TemporalFilter', function(item) {
            var unixTimeStamp = item.propHiden.unixTimeStamp;
            return unixTimeStamp >= beginDate.valueOf() && unixTimeStamp <= endDate.valueOf();
        })
        if (gmx.beginDate && gmx.endDate) {
            this.setDateInterval(gmx.beginDate, gmx.endDate);
        }
    }
}