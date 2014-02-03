var gmxVectorTilesManager = function(gmx, layerDescription) {
    var subscriptions = {},
        freeSubscrID = 0,
        tiles = {},
        activeTileKeys = {},
        beginDate, endDate,
        isTemporalLayer = layerDescription.properties.Temporal,
        filters = {},
        items = {},
        maxStyleSize = 0;

	//tree for fast tiles selection inside temporal interval
	var tilesTree = {
		_rootNodes: [],
		initFromTiles: function() {
			var ph = gmx.attr,
				periods = ph.TemporalPeriods,
				dateZero = ph.ZeroUT,
				roots = [];
				 
			var addTile = function (node, tile, key) {
				var d = node.d;
				if (tile.d === periods[d]) {
					node.count++;
					node.tiles[key] = true;
					return;
				}
				
				var childrenCount = periods[d] / periods[d-1];
				
				if (!('children' in node)) {
					node.children = new Array(childrenCount);
				}
				
				var sChild = Math.floor(tile.s * tile.d / periods[d-1]);
				var ds = sChild - node.s*childrenCount;
				
				if (!node.children[ds]) {
					node.children[ds] = {
						d: d-1,
						s: sChild,
						t1: sChild * periods[d-1] * gmxAPIutils.oneDay + dateZero,
						t2: (sChild + 1) * periods[d-1] * gmxAPIutils.oneDay + dateZero,
						count: 0,
						tiles: {}
					}
				}
				
				addTile(node.children[ds], tile, key);
			}
			
			var smin = Number.MAX_VALUE,
				dmax = periods.length - 1;
				
			for (var key in tiles) {
				var t = tiles[key].tile;
				if (t.d === periods[dmax]) {
					smin = Math.min(smin, t.s);
				}
			}
			
			this._rootNodes = [];
			
			for (var key in tiles) {
				var t = tiles[key].tile,
					ds = Math.floor(t.s * t.d / periods[dmax]) - smin,
					cs = ds + smin;
					
				this._rootNodes[ds] = this._rootNodes[ds] || {
					d: dmax,
					s: cs,
					t1: cs * periods[dmax] * gmxAPIutils.oneDay + dateZero,
					t2: (cs + 1) * periods[dmax] * gmxAPIutils.oneDay + dateZero,
					count: 0,
					tiles: {}
				}
				
				addTile(this._rootNodes[ds], t, key);
			}
		},
		
		selectTiles: function(t1, t2) {
			var t1Val = t1.valueOf() / 1000,
				t2Val = t2.valueOf() / 1000;
			
			// --------------------
			var selectTilesForNode = function(node, t1, t2) {
				if (t1 >= node.t2 || t2 <= node.t1) {
					return {count: 0, tiles: {}};
				}
				
				if (node.d === 0) {
					return {
						tiles: node.tiles,
						count: node.count
					}
				}
				
				var childrenCount = 0; //number of tiles if we use shorter intervals
				var childrenRes = [];
				for (var ds = 0; ds < node.children.length; ds++) {
					if (node.children[ds]) {
						childrenRes[ds] = selectTilesForNode(node.children[ds], Math.max(t1, node.t1), Math.min(t2, node.t2));
					} else {
						childrenRes[ds] = {count: 0, tiles: {}};
					}
					childrenCount += childrenRes[ds].count;
				}
				
				if (childrenCount < node.count) {
					var resTiles = {};
					for (var ds = 0; ds < childrenRes.length; ds++) {
						for (var key in childrenRes[ds].tiles) {
							resTiles[key] = childrenRes[ds].tiles[key];
						}
					}
					
					return {
						tiles: resTiles,
						count: childrenCount
					}
				} else {
					return {
						tiles: node.tiles,
						count: node.count
					} 
				}
			}
			
			var res = {};
			for (var ds = 0; ds < this._rootNodes.length; ds++) {
				if (this._rootNodes[ds]) {
					var tiles = selectTilesForNode(this._rootNodes[ds], t1Val, t2Val).tiles;
					for (var key in tiles) {
						res[key] = tiles[key];
					}
				}
			}
			
			return res;
		},
		
		getNode: function(d, s) {
			if (d < 0 || s < 0) {
				return null;
			}
			
			var periods = gmx.attr.TemporalPeriods;
			
			var findNode = function(node, d, s) {
				if (!node) return null;
				
				if (periods[node.d] === d) {
					return node.s === s ? node : null;
				}
				
				var childrenCount = periods[node.d] / periods[node.d-1];
				var sChild = Math.floor(s * d / periods[node.d-1]);
				var ds = sChild - node.s*childrenCount;
				
				return node.children[ds] ? findNode(node.children[ds], d, s) : null;
			}
			
			for (var ds = 0; ds < this._rootNodes.length; ds++) {
				var node = findNode(this._rootNodes[ds], d, s);
				if (node) {
					return node;
				}
			}
			
			return null;
		}
	}

    var getStyleBounds = function(gmxTilePoint) {
        if (maxStyleSize === 0) {
            maxStyleSize = gmx.styleManager.getMaxStyleSize();
        }
        var mercSize = 2 * maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize, mercSize, mercSize, mercSize);
    }
	
	var vectorTileDataProvider = {
		load: function(x, y, z, v, s, d, callback) {
            var requestParams = {
                ModeKey: 'tile',
                r: 't',
                MapName: gmx.mapName,
                LayerName: gmx.layerID,
                z: z,
                x: x,
                y: y,
                v: v
            }
            
            if (d !== -1) {
                requestParams.Level = d;
                requestParams.Span = s;
            }
            
			gmxAPIutils.requestJSONP(gmx.tileSenderPrefix, requestParams).then(
                function(st) {
                    callback(st.Result);
                },
				function() {
					console.log('Error loading vector tile');
					callback([]);
				}
            );
		}
	}
    
    var initTileList = function() {
        var props = layerDescription.properties,
            arr, vers;
            
        if (isTemporalLayer) {
            arr = props.TemporalTiles || [];
            vers = props.TemporalVers || [];
            
            for (var i = 0, len = arr.length; i < len; i++) {
                var arr1 = arr[i];
                var z = Number(arr1[4]),
                    y = Number(arr1[3]),
                    x = Number(arr1[2]),
                    s = Number(arr1[1]),
                    d = Number(arr1[0]),
                    v = Number(vers[i]),
                    tile = new gmxVectorTile(vectorTileDataProvider, x, y, z, v, s, d);
                    
                tiles[tile.gmxTileKey] = {tile: tile};
            }
			
			tilesTree.initFromTiles();
			
        } else {
            arr = props.tiles || [];
            vers = props.tilesVers;
            for (var i = 0, cnt = 0, len = arr.length; i < len; i+=3, cnt++) {
                var tile = new gmxVectorTile(vectorTileDataProvider, Number(arr[i]), Number(arr[i+1]), Number(arr[i+2]), Number(vers[cnt]), -1, -1);
                tiles[tile.gmxTileKey] = {tile: tile};
                activeTileKeys[tile.gmxTileKey] = true;
            }
        }
    }
    
    initTileList();
    
    this.setDateInterval = function(newBeginDate, newEndDate) {
        if (!isTemporalLayer || (newBeginDate == beginDate && newBeginDate == endDate)) { return; };
                
        activeTileKeys = tilesTree.selectTiles(newBeginDate, newEndDate);
        
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
        
        filters[filterName] = filterFunc;
        
        for (var subscrID in subscriptions) {
            subscriptions[subscrID].callback();
        }
    }

    this.getItems = function(gmxTilePoint) {
        var bounds = getStyleBounds(gmxTilePoint);
        
        var resItems = [];
        for (var key in activeTileKeys) {
            var tile = tiles[key].tile;
            if (!bounds.intersects(tile.bounds)) {
                //отсекаем тайлы за границами screenTile + макс.размер из массива стилей (без учета обьектов)
                continue;
            }
               
			var data = tile.data || [];
			for (var j = 0, len1 = data.length; j < len1; j++) {
                
				var it = data[j];
				var item = it.item;
                var isFiltered = false;
                for (var filterName in filters) {
                    if (filters[filterName] && !filters[filterName](item)) {
                        isFiltered = true;
                        break;
                    }
                }
                
                if (isFiltered) {continue;}
                
				if(!it.bounds) {
                    it.bounds = gmxAPIutils.geoItemBounds(it);
                    var arr = [[it.bounds.min.x, it.bounds.min.y], [it.bounds.max.x, it.bounds.max.y]];
                    item.bounds = (item.bounds ? item.bounds.extendArray(arr) : gmxAPIutils.bounds(arr));
                }

				if (!bounds.intersects(it.bounds)) {
                    // TODO: есть лишние обьекты которые отрисовываются за пределами screenTile
                    continue;
                }
                
				if (item.type === 'POLYGON' || item.type === 'MULTIPOLYGON') {
                    tile.calcHiddenPoints();
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
			var prop = it.properties;
			delete it.properties;
			var geom = it.geometry;
			
			var id = it.id || prop[identityField];
			var item = items[id];
			if(item) {
				if(item.type.indexOf('MULTI') == -1) {
                    item.type = 'MULTI' + item.type;
                }
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
            it.item = item;
			item.propHiden.fromTiles[gmxTileKey] = i;
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
        var bounds = getStyleBounds(gmxTilePoint);
        for (var key in activeTileKeys) {
            var tile = tiles[key].tile;
            if (tile.state !== 'loaded' && bounds.intersects(tile.bounds)) {
                count++;
            }
        }
        return count;
    }

    this.loadTiles = function(gmxTilePoint) {
        var bounds = getStyleBounds(gmxTilePoint),
        _this = this;

        for (var key in activeTileKeys) (function(tile) {
        
            if (!bounds.intersects(tile.bounds)) return;
           
            if (tile.state === 'notLoaded') {
                tile.load().then(function() {
                    gmx.attr.itemCount += _updateItemsFromTile(tile);
                    for (var key in subscriptions) {
                        if (tile.bounds.intersects(subscriptions[key].styleBounds)
                            && _this.getNotLoadedTileCount(subscriptions[key].tilePoint) == 0) 
                        {
                            subscriptions[key].callback();
                        }
                    }
					var treeNode = tilesTree.getNode(tile.d, tile.s);
					treeNode && treeNode.count--; //decrease number of tiles to load inside this node
                })
            }
		})(tiles[key].tile);
    }
    
    //'callback' will be called at least once:
    // - immediately, if all data for a given bbox is already loaded
    // - after next chunk of data will be loaded
    this.on = function(gmxTilePoint, callback) {
        var id = 's'+(freeSubscrID++);
        subscriptions[id] = {
            tilePoint: gmxTilePoint, 
            callback: callback, 
            styleBounds: getStyleBounds(gmxTilePoint)
        };
        
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
	
    this.getItem = function(id) {
        return items[id];
    }
    
    this.addTile = function(tile) {
        tiles[tile.gmxTileKey] = {tile: tile};
        activeTileKeys[tile.gmxTileKey] = true;
        for (var subscrID in subscriptions) {
            var tp = subscriptions[subscrID].tilePoint;
            this.loadTiles(tp);
            if (this.getNotLoadedTileCount(tp) == 0) {
                subscriptions[subscrID].callback();
            }
        }
    }
	
	this.preloadTiles = function(dateBegin, dateEnd, bounds) {
		var tileKeys = tilesTree.selectTiles(dateBegin, dateEnd);
		var loadingDefs = [];
		for (var key in tileKeys) {
			var tile = tiles[key].tile;
			
			if (tile.state !== 'notLoaded') {
				continue;
			}
			
			if (bounds && !bounds.intersects(tile.bounds)) {
				continue;
			}
			
			var loadDef = tile.load();
			(function(tile) {
				loadDef.then(function() {
					gmx.attr.itemCount += _updateItemsFromTile(tile);
					var treeNode = tilesTree.getNode(tile.d, tile.s);
					treeNode && treeNode.count--; //decrease number of tiles to load inside this node
				})
			})(tile);
			loadingDefs.push(loadDef);
		}
	
		return gmxDeferred.all.apply(null, loadingDefs);
		
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