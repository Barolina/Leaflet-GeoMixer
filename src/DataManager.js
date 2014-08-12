var gmxDataManager = L.Class.extend({
	includes: L.Mixin.Events,
    initialize: function(gmx, layerDescription) {
        var _this = this,
            isTemporalLayer = layerDescription.properties.Temporal;

        this._tilesTree = isTemporalLayer ? new gmxTilesTree(gmx.TemporalPeriods, gmx.ZeroUT) : null;
        this._beginDate = gmx.beginDate;
        this._endDate = gmx.endDate;
        this._gmx = gmx;
        this._isTemporalLayer = isTemporalLayer;
        this._tiles = {};
        this._activeTileKeys = {};
        //this._subscriptions = {};
        this._filters = {};
        this._freeSubscrID = 0;
        this._maxStyleSize = 0;
        this._items = {};
        this._observers = {};

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
        this.on('checkObservers', function() {
            if (this._checkObserversTimer) clearTimeout(this._checkObserversTimer);
            this._checkObserversTimer = setTimeout(L.bind(this.checkObservers, this), 0);
        }, this);
    },

    getStyleBounds: function(gmxTilePoint) {
        if (!gmxTilePoint) return gmxAPIutils.bounds();
        if (this._maxStyleSize === 0) {
            this._maxStyleSize = this._gmx.styleManager.getMaxStyleSize();
        }
        var mercSize = 2 * this._maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize);
    },

    //TODO: optimize this by storing current number of not loaded tiles for subscriptions
    _triggerObservers: function(oKeys) {
        var keys = oKeys || this._observers;
        for (var id in keys) {
            var s = this._observers[id];
            s.active = true;
        }
        this.checkObservers();
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
        this._triggerObservers(this._observers);
    },

    getDateInterval: function() {
        return [this._beginDate, this._endDate];
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerObservers(this._observers);
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            delete this._filters[filterName];
            this._triggerObservers(this._observers);
        }
    },

    checkObservers: function() {
        for (var subscrID in this._observers) {
            var s = this._observers[subscrID];
            if (s.active) {
                s.active = false;
                this._loadTiles(s.gmxTilePoint) || s.callback();
            }
        }
    },

    getItems: function(oId, bboxActive) {
        var resItems = [],
            observer = this._observers[oId];
        if (observer) {
            var bounds = bboxActive || observer.bbox || [],
                filters = observer.filters || {};

            for (var key in this._activeTileKeys) {
                var tile = this._tiles[key].tile,
                    data = tile.data;
                if (!data || !bounds.intersects(tile.bounds)) {
                    // VectorTile is not loaded or is not on a screen
                    continue;
                }

                for (var j = 0, len1 = data.length; j < len1; j++) {
                    var it = data[j],
                        id = it[0],
                        item = this.getItem(id),
                        isFiltered = false;
                    for (var filterName in filters) {
                        if (filters[filterName] && !filters[filterName](item, tile)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (isFiltered) {continue;}

                    var geom = it[it.length - 1],
                        type = geom.type,
                        dataOption = tile.dataOptions[j];

                    if (!bounds.intersects(dataOption.bounds)) {
                        // TODO: есть лишние обьекты которые отрисовываются за пределами screenTile
                        continue;
                    }

                    if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                        tile.calcEdgeLines(j);
                    }
                    resItems.push({
                        arr: it,
                        dataOption: dataOption
                    });
                }
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
                id = it[0],
                item = this._items[id];
            // TODO: old properties null = ''
            it.forEach(function(zn, j) {
                if (zn === null) it[j] = '';
            });
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
            delete item.bounds;
            item.properties = it;
            item.options.fromTiles[gmxTileKey] = i;
            if(layerProp.TemporalColumnName) {
                var zn = it[this._gmx.tileAttributeIndexes[layerProp.TemporalColumnName]];
                item.options.unixTimeStamp = zn*1000;
            }
        }
        return len;
    },

    _getNotLoadedTileCount: function(gmxTilePoint) {
        var count = 0,
            bounds = this.getStyleBounds(gmxTilePoint);
        for (var key in this._activeTileKeys) {
            var tile = this._tiles[key].tile;
            if (tile.state !== 'loaded' && bounds.intersects(tile.bounds)) {
                count++;
            }
        }
        return count;
    },

    _loadTiles: function(gmxTilePoint) {
        var bounds = this.getStyleBounds(gmxTilePoint),
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
                    
                    var observers = _this._observers;
                    for (var key in observers) {
                        var observer = observers[key];
                        if (tile.bounds.intersects(observer.bbox)) {
                            if (!observer.gmxTilePoint) {
                                observer.active = true;
                                _this.fire('checkObservers');
                            } else if (_this._getNotLoadedTileCount(observer.gmxTilePoint) == 0) { 
                                observer.callback();
                            }
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
    addObserver: function(options) {
        var id = options.zKey || 's'+(this._freeSubscrID++),
            callback = options.callback,
            gmxTilePoint = options.gmxTilePoint;
        var observer = new gmxObserver(this, options);
        observer.id = id;
        observer.active = true;
        this._observers[id] = observer;
        this.fire('checkObservers');
        return id;
    },

    getObserver: function(id) {
        return this._observers[id];
    },

    removeObserver: function(id) {
        delete this._observers[id];
    },

    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                bounds = gmxAPIutils.bounds();
            for (var key in fromTiles) {
                var tile = this._tiles[key].tile,
                    dataOptions = tile.dataOptions,
                    num = fromTiles[key];
                var dataOption = dataOptions[num];
                if (!dataOption) dataOption = dataOptions[num] = {};
                if (!dataOption.bounds) {
                    var geoItem = tile.data[num];
                    var b = gmxAPIutils.geoItemBounds(geoItem[geoItem.length - 1]);
                    dataOption.bounds = b.bounds;
                    if (b.boundsArr.length) dataOption.boundsArr = b.boundsArr;
                }
                bounds.extendBounds(dataOption.bounds);
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
        var observers = this._observers;
        for (var subscrID in observers) {
            var tp = observers[subscrID].gmxTilePoint;
            this._loadTiles(tp);
            if (this._getNotLoadedTileCount(tp) == 0) {
                observers[subscrID].callback();
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
            observersToUpdate = {},
            _this = this;
            
        var checkSubscription = function(gmxTileKey) {
            var bounds = gmxVectorTile.boundsFromTileKey(gmxTileKey),
                observers = _this._observers;

            for (var sid in observers) {
                if (bounds.intersects(observers[sid].styleBounds)) {
                    observersToUpdate[sid] = true;
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
        
        this._triggerObservers(observersToUpdate);
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