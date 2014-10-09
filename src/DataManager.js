﻿var gmxDataManager = L.Class.extend({
	includes: L.Mixin.Events,
    initialize: function(gmx) {
        var _this = this,
            oneDay = 1000*60*60*24, // milliseconds in one day
            isTemporalLayer = gmx.properties.Temporal;

        this._tilesTree = isTemporalLayer ? new gmxTilesTree(gmx.TemporalPeriods, gmx.ZeroUT) : null;
        this._activeTileKeys = null;
        this._endDate = null;
        this._beginDate = null;

        this._gmx = gmx;
        this._isTemporalLayer = isTemporalLayer;
        this._tiles = {};
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
        if (isTemporalLayer) {
            this.addFilter('TemporalFilter', function(item, tile, observer) {
                var unixTimeStamp = item.options.unixTimeStamp,
                    dates = observer.dateInterval;
                return dates && unixTimeStamp >= dates.beginDate.valueOf() && unixTimeStamp <= dates.endDate.valueOf();
            })
        }
    },

    _lazyInitActiveTileKeys: function() {
        if (!this._activeTileKeys) {
            this.initTileList(this._gmx.properties);
        }
        if (this._isTemporalLayer) {
            this._chkMaxDateInterval();
        }
    },

    getStyleBounds: function(gmxTilePoint) {
        if (!gmxTilePoint) return gmxAPIutils.bounds();

        this._maxStyleSize = this._gmx.styleManager.getMaxStyleSize();

        var mercSize = 2 * this._maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize);
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerObservers(); //TODO: trigger only observers that use this filter
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            delete this._filters[filterName];
            this._triggerObservers(); //TODO: trigger only observers that use this filter
        }
    },

    getItems: function(oId, bboxActive) {
        var resItems = [],
            observer = this._observers[oId];
            
        if (!observer) {
            return [];
        }
        
        //add internal filters
        var filters = observer.filters.concat('processingFilter');
        this._isTemporalLayer && filters.push('TemporalFilter');
        
        var isIntersects = function(bounds) {
                return (bboxActive && bboxActive.intersects(bounds))
                    || observer.intersects(bounds);
            },
            _this = this,
            putData = function(key) {
                var tile = _this._tiles[key].tile,
                    data = tile.data;
                if (!data || (tile.z !== 0 && !isIntersects(tile.bounds))) {
                    // VectorTile is not loaded or is not on bounds
                    return;
                }

                for (var j = 0, len1 = data.length; j < len1; j++) {
                    var dataOption = tile.dataOptions[j];

                    if (!isIntersects(dataOption.bounds)) {
                        continue;
                    }
                    var it = data[j],
                        id = it[0],
                        item = _this.getItem(id),
                        isFiltered = false;

                    for (var f = 0; f < filters.length; f++) {
                        var filterFunc = _this._filters[filters[f]];
                        if (filterFunc && !filterFunc(item, tile, observer)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (isFiltered) continue;

                    var geom = it[it.length - 1],
                        type = geom.type;

                    //TODO: remove from data manager
                    if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                        tile.calcEdgeLines(j);
                    }
                    
                    resItems.push({
                        arr: it,
                        item: item,
                        dataOption: dataOption
                    });
                }
            };
        if (!this._activeTileKeys) this._lazyInitActiveTileKeys();
        for (var tkey in this._activeTileKeys) {
            putData(tkey);
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

    _getNotLoadedTileCount: function(observer) {
        var count = 0;
        for (var key in this._activeTileKeys) {
            var tile = this._tiles[key].tile;
            if (tile.state !== 'loaded' && observer.intersects(tile.bounds)) {
                count++;
            }
        }
        return count;
    },

    _loadTiles: function(observer) {
        var leftToLoad = 0,
            _this = this;

        if (!this._activeTileKeys) this._lazyInitActiveTileKeys();

        for (var key in this._activeTileKeys) (function(tile) {

            if (!observer.intersects(tile.bounds)) return;

            if (tile.state === 'notLoaded') {
                tile.load().then(function() {
                    _this._updateItemsFromTile(tile);
              
                    if (_this._tilesTree) {
                        var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                        treeNode && treeNode.count--; //decrease number of tiles to load inside this node
                    }
                    
                    var observers = _this._observers;
                    for (var id in observers) {
                        var observer = observers[id];
                        if (observer.intersects(tile.bounds)) {
                            if (_this._getNotLoadedTileCount(observer) == 0) { 
                                observer.updateData(_this.getItems(id));
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

    _chkMaxDateInterval: function() {
        if (this._isTemporalLayer) {
        var observers = this._observers,
            newBeginDate = null,
            newEndDate = null;
        for (var oId in observers) {
            var observer = observers[oId],
                dateInterval = observer.dateInterval;
                
            if (!dateInterval) continue;
                
            if (!newBeginDate || dateInterval.beginDate < newBeginDate) newBeginDate = dateInterval.beginDate;
            if (!newEndDate || dateInterval.endDate > newEndDate) newEndDate = dateInterval.endDate;
        }
        
        if (newBeginDate && newEndDate && (this._beginDate != newBeginDate || this._endDate != newEndDate)) {
        
            this._beginDate = newBeginDate;
            this._endDate = newEndDate;
                this._activeTileKeys = null;
            
            var selection = this._tilesTree.selectTiles(newBeginDate, newEndDate);
            
            this._updateActiveTilesList(selection.tiles);
        }
        }
    },

    addObserver: function(options, id) {
        if (!id) id = 's'+(this._freeSubscrID++);
        var _this = this,
            observer = new gmxObserver(options);
            
        observer.id = id;
        observer.needRefresh = true;
        
        observer
            .on('update', function(ev) {
                observer.needRefresh = true;
                if (ev.temporalFilter) {
                    _this._beginDate = _this._endDate = null;
                    _this._activeTileKeys = null;
                }
                _this._waitCheckObservers();
            })
            .on('activate', function(ev) {
                if (observer.isActive() && observer.needRefresh) {
                    _this.checkObserver(observer);
                }
        });

        this._observers[id] = observer;
        this._waitCheckObservers();
        
        //var count = 0; for (var k in this._observers) count++;
        
        return observer;
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
        if (!this._activeTileKeys) this._lazyInitActiveTileKeys();
        this._tiles[tile.gmxTileKey] = {tile: tile};
        this._activeTileKeys[tile.gmxTileKey] = true;
        this.checkObservers();
    },

    checkObserver: function(observer) {
        if (observer.needRefresh && observer.isActive()) {
            observer.needRefresh = false;
            if (this._loadTiles(observer) == 0) {
                var data = this.getItems(observer.id);
                observer.updateData(data);
            }
        }
    },

    checkObservers: function() {
        var observers = this._observers;
        for (var id in this._observers) {
            this.checkObserver(observers[id]);
        }
    },

    _waitCheckObservers: function() {
        if (this._checkObserversTimer) clearTimeout(this._checkObserversTimer);
        this._checkObserversTimer = setTimeout(L.bind(this.checkObservers, this), 0);
    },

    _triggerObservers: function(oKeys) {
        var keys = oKeys || this._observers;

        for (var id in keys) {
            this._observers[id].needRefresh = true;
        }
        this._waitCheckObservers();
    },

    _removeDataFromObservers: function(data) {
        var keys = this._observers,
            zoom = this._gmx.currentZoom;
        for (var id in keys) {
            this._observers[id].removeData(data);
        }
        this._waitCheckObservers();
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
                if (bounds.intersects(observers[sid].bbox)) {
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
        if (this.clientSideTile) this._activeTileKeys[this.clientSideTile] = true;
        
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
        var tile = this.processingTile,
            _items = this._items;
        if (tile) {
            if (tile.data)
                tile.data.forEach(function(it) {
                    _items[it[0]].processing = false;
                });
            tile.clear();
        }
        var skip = {};
        if (processing.Deleted)
            processing.Deleted.forEach(function(id) {
                skip[id] = true;
                if (_items[id]) _items[id].processing = true;
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
                this.processingTile = this.addData(data);
                this.addFilter('processingFilter', function(item, tile) {
                    return tile.z === 0 || !item.processing;
                });
            }
        }
    },

    _getDataKeys: function(data) {
        var chkKeys = {};
        for (var i = 0, len = data.length; i < len; i++) {
            chkKeys[data[i][0]] = true;
        }
        return chkKeys;
    },

    _getTileLink: function(options) {
        var x = -0.5, y = -0.5, z = 0, v = 0, s = -1, d = -1;
        if (options) {
            if ('x' in options) x = options.x;
            if ('y' in options) y = options.y;
            if ('z' in options) z = options.z;
            if ('v' in options) v = options.v;
            if ('s' in options) s = options.s;
            if ('d' in options) d = options.d;
        }
        var tileKey = gmxVectorTile.makeTileKey(x, y, z, v, s, d),
            tileLink = this._tiles[tileKey];
        if (!tileLink) {
            tileLink = this._tiles[tileKey] = {
                tile: new gmxVectorTile({load: function(x, y, z, v, s, d, callback) {
                            callback([]);
                        }}, x, y, z, v, s, d)
            };
            if (!this._gmx.mapName) {     // client side layer
                this.clientSideTile = tileKey;
            }
            this.addTile(tileLink.tile);
        }
        return tileLink;
    },

    addData: function(data, options) {
        if (!data || !data.length) {
            return;
        }
        
        var tileLink = this._getTileLink(options),
            chkKeys = this._getDataKeys(data),
            vTile = tileLink.tile;

        vTile.addData(data, chkKeys);
        this._updateItemsFromTile(vTile);
        this._triggerObservers();
        return vTile;
    },

    removeData: function(data, options) {
        var tileLink = this._getTileLink(options),
            vTile = null;
        if (tileLink) {
            vTile = tileLink.tile;
            var chkKeys = {};
            
            if (!data || !data.length) {
                return vTile;
            }
            
            for (var i = 0, len = data.length; i < len; i++) {
                var id = data[i];
                chkKeys[id] = true;
                delete this._items[id];
            }
            this._removeDataFromObservers(chkKeys);
            vTile.removeData(chkKeys);
            this._updateItemsFromTile(vTile);
            
            //TODO: trigger observers depending on tile position, not all observers
            this._triggerObservers();
        }
        
        return vTile;
    },

    initTileList: function(layerProperties) {
        var arr, vers;

        if (this._isTemporalLayer && this._gmx.TemporalPeriods) {
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
            
        } else {
            if (!this._activeTileKeys) this._activeTileKeys = {};
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