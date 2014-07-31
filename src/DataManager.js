var gmxDataManager = L.Class.extend({
	includes: L.Mixin.Events,
    _tiles: {},
    _tilesTree: null,
    _activeTileKeys: {},
    _subscriptions: {},
    _filters: {},
    _freeSubscrID: 0,
    _maxStyleSize: 0,
    _gmx: null,
    _beginDate: null,
    _endDate: null,
    _items: {},
    initialize: function(gmx, layerDescription) {
        var _this = this,
            isTemporalLayer = layerDescription.properties.Temporal;

        this._tilesTree = isTemporalLayer ? new gmxTilesTree(gmx.TemporalPeriods, gmx.ZeroUT) : null;
        this._beginDate = gmx.beginDate;
        this._endDate = gmx.endDate;
        this._gmx = gmx;
        this._isTemporalLayer = isTemporalLayer;

        this._vectorTileDataProvider = {
            load: function(x, y, z, v, s, d, callback) {
                gmxVectorTileLoader.load(
                    _this._gmx.tileSenderPrefix, 
                    {x: x, y: y, z: z, v: v, s: s, d: d, layerID: _this._gmx.layerID}
                ).then(callback, function() {
                    console.log('Error loading vector tile');
                    callback([]);
                    _this.fire('chkLayerUpdate', {dataProvider: _this});
                })
            }
        }
        this.initTileList(layerDescription.properties);    

        if (isTemporalLayer) {
            this.addFilter('TemporalFilter', function(item) {
                var unixTimeStamp = item.options.unixTimeStamp;
                return unixTimeStamp >= _this._beginDate.valueOf() && unixTimeStamp <= _this._endDate.valueOf();
            })
        }
    },

    _getStyleBounds: function(gmxTilePoint) {
        if (this._maxStyleSize === 0) {
            this._maxStyleSize = this._gmx.styleManager.getMaxStyleSize();
        }
        var mercSize = 2 * this._maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize, mercSize, mercSize, mercSize);
    },

    //TODO: optimize this by storing current number of not loaded tiles for subscriptions
    _triggerAllSubscriptions: function(subscriptionIDs) {
        for (var subscrID in subscriptionIDs) {
            var s = this._subscriptions[subscrID];
            this._loadTiles(s.tilePoint) || s.callback();
        }
    },

    setDateInterval: function(newBeginDate, newEndDate) {
        if (!this._isTemporalLayer || (newBeginDate == this._beginDate && newBeginDate == this._endDate)) {
            return;
        };

        var selection = this._tilesTree.selectTiles(newBeginDate, newEndDate);
        this._activeTileKeys = selection.tiles;
        // activeIntervals = selection.nodes;
        this._beginDate = newBeginDate;
        this._endDate = newEndDate;
        
        //trigger all subscriptions because temporal filter will be changed
        this._triggerAllSubscriptions(this._subscriptions);
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerAllSubscriptions(this._subscriptions);
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            delete this._filters[filterName];
            this._triggerAllSubscriptions(this._subscriptions);
        }
    },

    getItems: function(bounds, hover) {
        var resItems = [];
        for (var key in this._activeTileKeys) {
            var tile = this._tiles[key].tile,
                data = tile.data;
            if (!data || !bounds.intersects(tile.bounds)) {
                // VectorTile is not loaded or is not on a screen
                continue;
            }

            var dataOptions = tile.dataOptions || [];
            for (var j = 0, len1 = data.length; j < len1; j++) {
                var it = data[j],
                    id = it[0],
                    item = this._items[id],
                    filters = this._filters,
                    isFiltered = false;
                for (var filterName in filters) {
                    if (filters[filterName] && !filters[filterName](item, tile)) {
                        isFiltered = true;
                        break;
                    }
                }

                if (isFiltered) {continue;}

                var geom = it[it.length - 1],
                    type = item.type,
                    dataOption = dataOptions[j] || {};
                if(!dataOption.bounds) {
                    var b = gmxAPIutils.geoItemBounds(geom);
                    dataOption.bounds = b.bounds;
                    if (b.boundsArr.length) dataOption.boundsArr = b.boundsArr;
                    if (!dataOptions[j]) dataOptions[j] = dataOption;
                }

                if (!bounds.intersects(dataOption.bounds)) {
                    // TODO: есть лишние обьекты которые отрисовываются за пределами screenTile
                    continue;
                }

                if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                    tile.calcHiddenPoints();
                }

                var out = {arr: it, dataOption: dataOptions[j]};
                resItems.push(out);
            }
        }
        return resItems;
    },

    _updateItemsFromTile: function(tile) {
        var gmxTileKey = tile.gmxTileKey,
            layerProp = this._gmx.properties,
            data = tile.data,
            len = data.length,
            geomIndex = data[0] && (data[0].length - 1);

        for (var i = 0; i < len; i++) {
            var it = data[i],
                geom = it[geomIndex],
                //prop = it.properties,
                id = it[0],
                item = this._items[id];
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
                    ,options: {
                        fromTiles: {}
                    }
                };
                this._items[id] = item;
            }
            //it.item = item;
            item.properties = it;
            item.options.fromTiles[gmxTileKey] = i;
            if(layerProp.TemporalColumnName) {
                var zn = it[this._gmx.tileAttributeIndexes[layerProp.TemporalColumnName]];
                item.options.unixTimeStamp = zn*1000;
                
                // var zn = prop[layerProp.TemporalColumnName] || '';
                // zn = zn.replace(/(\d+)\.(\d+)\.(\d+)/g, '$2/$3/$1');
                // var vDate = new Date(zn);
                // var offset = vDate.getTimezoneOffset();
                // item.options.unixTimeStamp = vDate.getTime() - offset*60*1000;
            }
        }
        return len;
    },

    _getNotLoadedTileCount: function(gmxTilePoint) {
        var count = 0,
            bounds = this._getStyleBounds(gmxTilePoint);
        for (var key in this._activeTileKeys) {
            var tile = this._tiles[key].tile;
            if (tile.state !== 'loaded' && bounds.intersects(tile.bounds)) {
                count++;
            }
        }
        return count;
    },

    _loadTiles: function(gmxTilePoint) {
        var bounds = this._getStyleBounds(gmxTilePoint),
            leftToLoad = 0,
            _this = this;

        for (var key in this._activeTileKeys) (function(tile) {

            if (!bounds.intersects(tile.bounds)) return;

            if (tile.state === 'notLoaded') {
                tile.load().then(function() {
                    _this._updateItemsFromTile(tile);
              
                    if (_this._tilesTree) {
                        var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                        treeNode && treeNode.count--; //decrease number of tiles to load inside this node
                    }
                    
                    for (var key in _this._subscriptions) {
                        if (tile.bounds.intersects(_this._subscriptions[key].styleBounds)
                            && _this._getNotLoadedTileCount(_this._subscriptions[key].tilePoint) == 0) 
                        {
                            _this._subscriptions[key].callback();
                        }
                    }
                })
            }
            
            if (tile.state !== 'loaded') {
                leftToLoad++;
            }
        })(this._tiles[key].tile);
        
        return leftToLoad;
    },

    //'callback' will be called at least once:
    // - immediately, if all the data for a given bbox is already loaded
    // - after all the data for a given bbox will be loaded
    subscribe: function(gmxTilePoint, callback) {
        var id = 's'+(this._freeSubscrID++);
        this._subscriptions[id] = {
            tilePoint: gmxTilePoint,
            callback: callback,
            styleBounds: this._getStyleBounds(gmxTilePoint)
        };

        var leftToLoad = this._loadTiles(gmxTilePoint);

        leftToLoad || callback();

        return id;
    },

    unsubscribe: function(id) {
        delete this._subscriptions[id];
    },

    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                bounds = gmxAPIutils.bounds();
            for (var key in fromTiles) {
                var dataOptions = this._tiles[key].tile.dataOptions;
                bounds.extendBounds(dataOptions[fromTiles[key]].bounds);
            }
            item.bounds = bounds;
        }
        return item;
    },

    getItemGeometries: function(id) {
        var fromTiles = this._items[id].options.fromTiles,
            geomItems = [];
        for (var key in fromTiles) {
            var data = this._tiles[key].tile.data;
            for (var j = 0, len1 = data.length; j < len1; j++) {
                var prop = data[j];
                if (id === prop[0]) {
                    geomItems.push(prop[prop.length - 1]);
                    break;
                }
            }
        }
        return geomItems;
    },

    addTile: function(tile) {
        this._tiles[tile.gmxTileKey] = {tile: tile};
        this._activeTileKeys[tile.gmxTileKey] = true;
        for (var subscrID in this._subscriptions) {
            var tp = this._subscriptions[subscrID].tilePoint;
            this._loadTiles(tp);
            if (this._getNotLoadedTileCount(tp) == 0) {
                this._subscriptions[subscrID].callback();
            }
        }
    },

    preloadTiles: function(dateBegin, dateEnd, bounds) {
        var tileKeys = this._isTemporalLayer ? this._tilesTree.selectTiles(dateBegin, dateEnd).tiles : this._activeTileKeys,
            _this = this,
            loadingDefs = [];
        for (var key in tileKeys) {
            var tile = this._tiles[key].tile;

            if (tile.state !== 'notLoaded') {
                continue;
            }

            if (bounds && !bounds.intersects(tile.bounds)) {
                continue;
            }

            var loadDef = tile.load();
            (function(tile) {
                loadDef.then(function() {
                    _this._updateItemsFromTile(tile);
                    
                    if (_this._tilesTree) {
                        var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                        treeNode && treeNode.count--; //decrease number of tiles to load inside this node
                    }
                })
            })(tile);
            loadingDefs.push(loadDef);
        }

        return gmxDeferred.all.apply(null, loadingDefs);
    },
    
    _updateActiveTilesList: function(newTilesList) {
    
        if (!this._activeTileKeys) {
            this._activeTileKeys = newTilesList;
            return;
        }
        
        var changedTiles = [],
            subscriptionsToUpdate = {},
            _this = this;
            
        var checkSubscription = function(gmxTileKey) {
            var bounds = gmxVectorTile.boundsFromTileKey(gmxTileKey);
            
            for (var sid in _this._subscriptions) {
                if (bounds.intersects(_this._subscriptions[sid].styleBounds)) {
                    subscriptionsToUpdate[sid] = true;
                }
            }
        }
            
        for (var key in newTilesList) {
            if (!this._activeTileKeys[key]) {
                checkSubscription(key);
            }
        }

        for (var key in this._activeTileKeys) {
            if (!newTilesList[key]) {
                checkSubscription(key);
            }
        }
        
        this._activeTileKeys = newTilesList;
        
        this._triggerAllSubscriptions(subscriptionsToUpdate);
    },

    _propertiesToArray: function(it) {
        var prop = it.properties,
            indexes = this._gmx.tileAttributeIndexes,
            arr = [];

        for (var key in indexes)
            arr[indexes[key]] = prop[key];

        arr[arr.length] = it.geometry;
        arr[0] = it.id;
        return arr;
    },

    _chkProcessing: function(processing) {
        var tile = this.processingTile;
        if (tile) {
            if (tile.data)
                tile.data.forEach(function(it) {
                    this._items[it[0]].processing = false;
                });
            tile.clear();
        }
        var skip = {};
        if (processing.Deleted)
            processing.Deleted.forEach(function(id) {
                skip[id] = true;
                if (this._items[id]) this._items[id].processing = true;
            });

        var out = {};
        if (processing.Inserted)
            processing.Inserted.forEach(function(it) { if (!skip[it.id]) out[it.id] = it; });

        if (processing.Updated)
            processing.Updated.forEach(function(it) { if (!skip[it.id]) out[it.id] = it; });

        var data = [];
        for (var id in out) {
            if (this._items[id]) this._items[id].processing = true;
            data.push(this._propertiesToArray(out[id]));
        }
        
        if (data.length > 0) {
            if (!tile) {
                this.processingTile = tile = new gmxVectorTile({load: function(x, y, z, v, s, d, callback) {
                    callback([]);
                }}, -0.5, -0.5, 0, 0, -1, -1);
                this.addFilter('processingFilter', function(item, tile) {
                    return tile.z === 0 || !item.processing;
                });
            }
            tile.addData(data);
            this._updateItemsFromTile(tile);
            this.addTile(tile);
        }
    },
    
    initTileList: function(layerProperties) {
        var arr, vers;

        if (this._isTemporalLayer) {
            arr = layerProperties.TemporalTiles || [];
            vers = layerProperties.TemporalVers || [];

            for (var i = 0, len = arr.length; i < len; i++) {
                var arr1 = arr[i];
                var z = Number(arr1[4]),
                    y = Number(arr1[3]),
                    x = Number(arr1[2]),
                    s = Number(arr1[1]),
                    d = Number(arr1[0]),
                    v = Number(vers[i]),
                    tileKey = gmxVectorTile.makeTileKey(x, y, z, v, s, d);
                    
                this._tiles[tileKey] = this._tiles[tileKey] || {
                    tile: new gmxVectorTile(this._vectorTileDataProvider, x, y, z, v, s, d)
                }
            }

            this._tilesTree.initFromTiles(this._tiles);
            
            if (this._beginDate && this._endDate) {
                var selection = this._tilesTree.selectTiles(this._beginDate, this._endDate);
                this._updateActiveTilesList(selection.tiles);
            }
            
        } else {
            arr = layerProperties.tiles || [];
            vers = layerProperties.tilesVers;
            var newActiveTileKeys = {};
            for (var i = 0, cnt = 0, len = arr.length; i < len; i+=3, cnt++) {
                var tile = new gmxVectorTile(this._vectorTileDataProvider, Number(arr[i]), Number(arr[i+1]), Number(arr[i+2]), Number(vers[cnt]), -1, -1);
                this._tiles[tile.gmxTileKey] = this._tiles[tile.gmxTileKey] || {tile: tile};
                newActiveTileKeys[tile.gmxTileKey] = true;
            }
            
            this._updateActiveTilesList(newActiveTileKeys);
        }

        if (layerProperties.Processing) {
            this._chkProcessing(layerProperties.Processing);
        }
    }
});