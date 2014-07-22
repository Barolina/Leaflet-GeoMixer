var gmxDataManager = function(gmx, layerDescription) {
    var subscriptions = {},
        freeSubscrID = 0,
        tiles = {},
        activeTileKeys = {},
        activeIntervals = [],
        beginDate, endDate,
        isTemporalLayer = layerDescription.properties.Temporal,
        filters = {},
        styleHook = null,
        items = {},
        maxStyleSize = 0;

	var tilesTree = new gmxTilesTree(gmx.TemporalPeriods, gmx.ZeroUT);

    var getStyleBounds = function(gmxTilePoint) {
        if (maxStyleSize === 0) {
            maxStyleSize = gmx.styleManager.getMaxStyleSize();
        }
        var mercSize = 2 * maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize, mercSize, mercSize, mercSize);
    }

    var vectorTileDataProvider = {
        load: function(x, y, z, v, s, d, callback) {
            gmxVectorTileLoader.load(
                gmx.tileSenderPrefix, 
                {x: x, y: y, z: z, v: v, s: s, d: d, layerID: gmx.layerID}
            ).then(callback, function() {
                console.log('Error loading vector tile');
                callback([]);
            })
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

            tilesTree.initFromTiles(tiles);

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
    
    //TODO: optimize this by storing current number of not loaded tiles for subscriptions
    this._triggerAllSubscriptions = function(subscriptionIDs) {
        for (var subscrID in subscriptionIDs) {
            var s = subscriptions[subscrID];
            this.loadTiles(s.tilePoint) || s.callback();
        }
    }

    this.setDateInterval = function(newBeginDate, newEndDate) {
        if (!isTemporalLayer || (newBeginDate == beginDate && newBeginDate == endDate)) {
            return;
        };

        var selection = tilesTree.selectTiles(newBeginDate, newEndDate);
        activeTileKeys = selection.tiles;
        activeIntervals = selection.nodes;
        beginDate = newBeginDate;
        endDate = newEndDate;
        
        this._triggerAllSubscriptions(subscriptions);
    }

    this.addFilter = function(filterName, filterFunc) {
        
        filters[filterName] = filterFunc;
        this._triggerAllSubscriptions(subscriptions);
    }

    this.removeFilter = function(filterName) {
        if (filters[filterName]) {
            delete filters[filterName];
            this._triggerAllSubscriptions(subscriptions);
        }
    }

    this.getItems = function(bounds, hover) {
        var resItems = [];
        for (var key in activeTileKeys) {
            var tile = tiles[key].tile,
                data = tile.data;
            if (!data || !bounds.intersects(tile.bounds)) {
                // VectorTile is not loaded or is not on a screen
                continue;
            }

            var dataOptions = tile.dataOptions || [];
            for (var j = 0, len1 = data.length; j < len1; j++) {
                var it = data[j],
                    id = it[0],
                    item = items[id],
                    geom = it[it.length-1],
                    dataOption = dataOptions[j] || {},
                    isFiltered = false;
                for (var filterName in filters) {
                    if (filters[filterName] && !filters[filterName](item)) {
                        isFiltered = true;
                        break;
                    }
                }

                if (isFiltered) {continue;}

                if(!dataOption.bounds) {
                    var b = gmxAPIutils.geoItemBounds(geom);
                    dataOption.bounds = b.bounds;
                    if (b.boundsArr.length) dataOption.boundsArr = b.boundsArr;
                    var arr = [[dataOption.bounds.min.x, dataOption.bounds.min.y], [dataOption.bounds.max.x, dataOption.bounds.max.y]];
                    item.bounds = (item.bounds ? item.bounds.extendArray(arr) : gmxAPIutils.bounds(arr));
                    if (!dataOptions[j]) dataOptions[j] = dataOption;
                }

                if (!bounds.intersects(dataOption.bounds)) {
                    // TODO: есть лишние обьекты которые отрисовываются за пределами screenTile
                    continue;
                }

                if (item.type === 'POLYGON' || item.type === 'MULTIPOLYGON') {
                    tile.calcHiddenPoints();
                }

                var out = {arr: it, dataOption: dataOptions[j]};
                resItems.push(out);
            }
        }
        return resItems;
    }

    var _updateItemsFromTile = function(tile) {
        var gmxTileKey = tile.gmxTileKey,
            layerProp = gmx.properties,
            data = tile.data,
            len = data.length,
            geomIndex = data[0] && (data[0].length - 1);

        for (var i = 0; i < len; i++) {
            var it = data[i],
                geom = it[geomIndex],
                //prop = it.properties,
                id = it[0],
                item = items[id];
// TODO: old properties null = ''
it.forEach(function(zn, j) {
if (zn === null) it[j] = '';
});
            //delete it.properties;
            if(item) {
                if(item.type.indexOf('MULTI') == -1) {
                    item.type = 'MULTI' + item.type;
                }
            } else {
                item = {
                    id: id
                    ,type: geom.type
                    ,properties: it
                    ,options: {
                        fromTiles: {}
                    }
                };
                items[id] = item;
            }
            //it.item = item;
            item.options.fromTiles[gmxTileKey] = i;
            if(layerProp.TemporalColumnName) {
                var zn = it[gmx.tileAttributeIndexes[layerProp.TemporalColumnName]];
                item.options.unixTimeStamp = zn*1000;
                
                // var zn = prop[layerProp.TemporalColumnName] || '';
                // zn = zn.replace(/(\d+)\.(\d+)\.(\d+)/g, '$2/$3/$1');
                // var vDate = new Date(zn);
                // var offset = vDate.getTimezoneOffset();
                // item.options.unixTimeStamp = vDate.getTime() - offset*60*1000;
            }
        }
        return len;
    }

    this.getNotLoadedTileCount = function(gmxTilePoint) {
        var count = 0,
            bounds = getStyleBounds(gmxTilePoint);
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
            leftToLoad = 0,
            _this = this;

        for (var key in activeTileKeys) (function(tile) {

            if (!bounds.intersects(tile.bounds)) return;

            if (tile.state === 'notLoaded') {
                tile.load().then(function() {
                    gmx.itemCount += _updateItemsFromTile(tile);
                    
                    var treeNode = tilesTree.getNode(tile.d, tile.s);
                    treeNode && treeNode.count--; //decrease number of tiles to load inside this node
                    
                    for (var key in subscriptions) {
                        if (tile.bounds.intersects(subscriptions[key].styleBounds)
                            && _this.getNotLoadedTileCount(subscriptions[key].tilePoint) == 0) 
                        {
                            subscriptions[key].callback();
                        }
                    }
                })
            }
            
            if (tile.state !== 'loaded') {
                leftToLoad++;
            }
        })(tiles[key].tile);
        
        return leftToLoad;
    }

    //'callback' will be called at least once:
    // - immediately, if all the data for a given bbox is already loaded
    // - after all the data for a given bbox will be loaded
    this.on = function(gmxTilePoint, callback) {
        var id = 's'+(freeSubscrID++);
        subscriptions[id] = {
            tilePoint: gmxTilePoint,
            callback: callback,
            styleBounds: getStyleBounds(gmxTilePoint)
        };

        var leftToLoad = this.loadTiles(gmxTilePoint);

        leftToLoad || callback();

        return id;
    }

    this.off = function(id) {
        delete subscriptions[id];
    }

    this.getItem = function(id) {
        return items[id];
    }

    this.getItemGeometries = function(id) {
        var fromTiles = items[id].options.fromTiles,
            geomItems = [];
        for (var key in fromTiles) {
            var data = tiles[key].tile.data;
            for (var j = 0, len1 = data.length; j < len1; j++) {
                var prop = data[j];
                if (id === prop[0]) {
                    geomItems.push(prop[prop.length - 1]);
                    break;
                }
            }
        }
        return geomItems;
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
		var tileKeys = tilesTree.selectTiles(dateBegin, dateEnd).tiles,
            loadingDefs = [];
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
					gmx.itemCount += _updateItemsFromTile(tile);
					var treeNode = tilesTree.getNode(tile.d, tile.s);
					treeNode && treeNode.count--; //decrease number of tiles to load inside this node
				})
			})(tile);
			loadingDefs.push(loadDef);
		}

		return gmxDeferred.all.apply(null, loadingDefs);
	}
    
    this.updateTilesList = function(newTilesList) {
        var changedTiles = [],
            subscriptionsToUpdate = {};
            
        var checkSubscription = function(gmxTileKey) {
            var bounds = gmxVectorTile.boundsFromTileKey(gmxTileKey);
            
            for (var sid in subscriptions) {
                if (bounds.intersects(subscriptions.styleBounds)) {
                    subscriptionsToUpdate[sid] = true;
                }
            }
        }
            
        for (var key in newTilesList) {
            if (!activeTileKeys[key]) {
                checkSubscription(key);
            }
        }

        for (var key in activeTileKeys) {
            if (!newTilesList[key]) {
                checkSubscription(key);
            }
        }
        
        activeTileKeys = newTilesList;
        
        this._triggerAllSubscriptions(subscriptionsToUpdate);
    }

    if (isTemporalLayer) {
        this.addFilter('TemporalFilter', function(item) {
            var unixTimeStamp = item.options.unixTimeStamp;
            return unixTimeStamp >= beginDate.valueOf() && unixTimeStamp <= endDate.valueOf();
        })
        if (gmx.beginDate && gmx.endDate) {
            this.setDateInterval(gmx.beginDate, gmx.endDate);
        }
    }
}