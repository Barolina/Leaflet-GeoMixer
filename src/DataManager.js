var DataManager = L.Class.extend({
    includes: L.Mixin.Events,
    initialize: function(gmx) {
        var _this = this,
            isTemporalLayer = gmx.properties.Temporal;

        this._tilesTree = null;
        this._activeTileKeys = {};
        this._endDate = null;
        this._beginDate = null;

        this._gmx = gmx;
        this._isTemporalLayer = isTemporalLayer;
        this._tiles = {};
        this._filters = {};
        this._freeSubscrID = 0;
        this._items = {};
        this._observers = {};

        this._needCheckDateInterval = false;
        this._needCheckActiveTiles = true;
        this._processingTileKey = VectorTile.makeTileKey(-0.5, -0.5, 0, 0, -1, -1);

        this._vectorTileDataProvider = {
            load: function(x, y, z, v, s, d, callback) {
                gmxVectorTileLoader.load(
                    _this._gmx.tileSenderPrefix,
                    {x: x, y: y, z: z, v: v, s: s, d: d, layerID: _this._gmx.layerID}
                ).then(callback, function() {
                    console.log('Error loading vector tile');
                    callback([]);
                    _this.fire('chkLayerUpdate', {dataProvider: _this}); //TODO: do we really need event here?
                });
            }
        };
        if (isTemporalLayer) {
            this.addFilter('TemporalFilter', function(item, tile, observer) {
                var unixTimeStamp = item.options.unixTimeStamp,
                    dates = observer.dateInterval;
                return dates && unixTimeStamp >= dates.beginDate.valueOf() && unixTimeStamp <= dates.endDate.valueOf();
            });
        }
    },

    _getActiveTileKeys: function() {

        this._chkMaxDateInterval();

        if (!this._needCheckActiveTiles) {
            return this._activeTileKeys;
        }

        this._needCheckActiveTiles = false;

        var processing = this._gmx.properties.Processing;
        if (processing) {
            this._chkProcessing(processing);
            delete this._gmx.properties.Processing;
        }

        if (this._isTemporalLayer) {
            var newTileKeys = {};
            if (this._beginDate && this._endDate) {
                if (!this._tilesTree) {
                    this.initTilesTree(this._gmx.properties);
                }

                newTileKeys = this._tilesTree.selectTiles(this._beginDate, this._endDate).tiles;
            }
            this._updateActiveTilesList(newTileKeys);
        } else {
            this.initTilesList(this._gmx.properties);
        }

        return this._activeTileKeys;
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

        var _this = this,
            isIntersects = function(bounds, dx, dy) {
                return bboxActive ? bboxActive.intersectsWithDelta(bounds, dx, dy) : observer.intersects(bounds);
            },
            putData = function(tile) {
                var data = tile.data;
                if (!data || (tile.z !== 0 && !isIntersects(tile.bounds))) {
                    // VectorTile is not loaded or is not on bounds
                    return;
                }

                for (var j = 0, len1 = data.length; j < len1; j++) {
                    var dataOption = tile.dataOptions[j];
                    if (!observer.intersects(dataOption.bounds)) { continue; }

                    var it = data[j],
                        id = it[0],
                        item = _this.getItem(id);

                    var geom = it[it.length - 1],
                        isFiltered = false;

                    for (var f = 0; f < filters.length; f++) {
                        var filterFunc = _this._filters[filters[f]];
                        if (filterFunc && !filterFunc(item, tile, observer, geom)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (isFiltered) { continue; }

                    var type = geom.type;

                    //TODO: remove from data manager
                    if (type !== 'POINT' && type !== 'MULTIPOINT') {
                        tile.calcEdgeLines(j);
                    }

                    resItems.push({
                        id: id,
                        properties: it,
                        item: item,
                        dataOption: dataOption
                    });
                }
            };
        var activeTileKeys =  this._getActiveTileKeys();
        for (var tkey in activeTileKeys) {
            putData(_this._tiles[tkey].tile);
        }

        return resItems;
    },

    _updateItemsFromTile: function(tile) {
        var vectorTileKey = tile.vectorTileKey,
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
            for (var j = 0, len1 = it.length; j < len1; j++) {
                if (it[j] === null) { it[j] = ''; }
            }
            if (item) {
                if (item.type.indexOf('MULTI') === -1) {
                    item.type = 'MULTI' + item.type;
                }
                delete item.bounds;
            } else {
                item = {
                    id: id,
                    type: geom.type,
                    options: {
                        fromTiles: {}
                    }
                };
                this._items[id] = item;
            }
            item.properties = it;
            item.options.fromTiles[vectorTileKey] = i;
            if (layerProp.TemporalColumnName) {
                var zn = it[this._gmx.tileAttributeIndexes[layerProp.TemporalColumnName]];
                item.options.unixTimeStamp = zn * 1000;
            }
        }
        return len;
    },

    _getNotLoadedTileCount: function(observer) {
        var count = 0;
        var activeTileKeys = this._getActiveTileKeys();
        for (var key in activeTileKeys) {
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

        var activeTileKeys = this._getActiveTileKeys();
        for (var key in activeTileKeys) (function(tile) {

            if (!observer.intersects(tile.bounds)) {
                return;
            }

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
                            if (_this._getNotLoadedTileCount(observer) === 0) {
                                observer.updateData(_this.getItems(id));
                            }
                        }
                    }
                });
            }

            if (tile.state !== 'loaded') {
                leftToLoad++;
            }
        })(this._tiles[key].tile);

        return leftToLoad;
    },

    _chkMaxDateInterval: function() {
        if (this._isTemporalLayer && this._needCheckDateInterval) {
            this._needCheckDateInterval = false;
            var observers = this._observers,
                newBeginDate = null,
                newEndDate = null;
            for (var oId in observers) {
                var observer = observers[oId],
                    dateInterval = observer.dateInterval;

                if (!dateInterval) {
                    continue;
                }

                if (!newBeginDate || dateInterval.beginDate < newBeginDate) {
                    newBeginDate = dateInterval.beginDate;
                }

                if (!newEndDate || dateInterval.endDate > newEndDate) {
                    newEndDate = dateInterval.endDate;
                }
            }
            if (newBeginDate && newEndDate && (this._beginDate !== newBeginDate || this._endDate !== newEndDate)) {

                this._beginDate = newBeginDate;
                this._endDate = newEndDate;
                this._needCheckActiveTiles = true;
            }
        }
    },

    addObserver: function(options, id) {
        id = id || 's' + (this._freeSubscrID++);
        var _this = this,
            observer = new Observer(options);

        observer.id = id;
        observer.needRefresh = true;

        observer
            .on('update', function(ev) {
                observer.needRefresh = true;
                if (ev.temporalFilter) {
                    _this._needCheckDateInterval = true;
                }

                _this._waitCheckObservers();
            })
            .on('activate', function() {
                _this.fire('observeractivate');
                if (observer.isActive() && observer.needRefresh) {
                    _this.checkObserver(observer);
                }
            });

        _this._needCheckDateInterval = true;
        this._observers[id] = observer;
        this._waitCheckObservers();

        if (observer.isActive()) {
            this.fire('observeractivate');
        }

        return observer;
    },

    getActiveObserversCount: function() {
        var count = 0;
        for (var k in this._observers) {
            if (this._observers[k].isActive()) { count++; }
        }
        return count;
    },

    getObserver: function(id) {
        return this._observers[id];
    },

    removeObserver: function(id) {
        if (this._observers[id]) {
            var isActive = this._observers[id].isActive();

            delete this._observers[id];

            if (isActive) {
                this.fire('observeractivate');
            }
        }
    },

    //combine and return all parts of geometry
    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                arr = [];
            for (var key in fromTiles) {    // get full object bounds
                if (this._tiles[key]) {
                    var dataOptions = this._tiles[key].tile.dataOptions,
                        num = fromTiles[key];
                    arr.push(dataOptions[num].bounds);
                }
            }
            if (arr.length === 1) {
                item.bounds = arr[0];
            } else {
                item.bounds = gmxAPIutils.bounds();
                var w = gmxAPIutils.worldWidthMerc;
                for (var i = 0, len = arr.length; i < len; i++) {
                    var it = arr[i];
                    if (item.bounds.max.x - it.min.x > w) {
                        it = gmxAPIutils.bounds([
                            [it.min.x + 2 * w, it.min.y],
                            [it.max.x + 2 * w, it.max.y]
                        ]);
                    }
                    item.bounds.extendBounds(it);
                }
            }
        }
        return item;
    },

    getItemMembers: function(id) {
        var fromTiles = this._items[id].options.fromTiles,
            members = [];
        for (var key in fromTiles) {
            if (this._tiles[key]) {
                var tile = this._tiles[key].tile,
                    data = tile.data;
                for (var j = 0, len1 = data.length; j < len1; j++) {
                    var prop = data[j];
                    if (id === prop[0]) {
                        var dataOption = tile.dataOptions[j],
                            bbox = dataOption.bounds;
                        members.push({
                            geo: prop[prop.length - 1],
                            width: bbox.max.x - bbox.min.x,
                            dataOption: dataOption
                        });
                        break;
                    }
                }
            }
        }
        return members.sort(function(a, b) {
            return b.width - a.width;
        });
    },

    getItemGeometries: function(id) {
        var fromTiles = this._items[id].options.fromTiles,
            geomItems = [];
        for (var key in fromTiles) {
            if (this._tiles[key]) {
                var data = this._tiles[key].tile.data;
                for (var j = 0, len1 = data.length; j < len1; j++) {
                    var prop = data[j];
                    if (id === prop[0]) {
                        geomItems.push(prop[prop.length - 1]);
                        break;
                    }
                }
            }
        }
        return geomItems;
    },

    addTile: function(tile) {
        this._tiles[tile.vectorTileKey] = {tile: tile};
        this._getActiveTileKeys()[tile.vectorTileKey] = true;
        this.checkObservers();
    },

    checkObserver: function(observer) {
        if (observer.needRefresh && observer.isActive()) {
            observer.needRefresh = false;
            if (this._loadTiles(observer) === 0) {
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
        if (this._checkObserversTimer) {
            clearTimeout(this._checkObserversTimer);
        }

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
        var keys = this._observers;
        for (var id in keys) {
            this._observers[id].removeData(data);
        }
        this._waitCheckObservers();
    },

    preloadTiles: function(dateBegin, dateEnd, bounds) {
        var tileKeys = {};
        if (this._isTemporalLayer) {
            if (!this._tilesTree) {
                this.initTilesTree(this._gmx.properties);
            }
            tileKeys = this._tilesTree.selectTiles(dateBegin, dateEnd).tiles;
        } else {
            this._needCheckActiveTiles = true;
            tileKeys = this._getActiveTileKeys();
        }

        var _this = this,
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
                });
            })(tile);
            loadingDefs.push(loadDef);
        }

        return Deferred.all.apply(null, loadingDefs);
    },

    _updateActiveTilesList: function(newTilesList) {

        var oldTilesList = this._activeTileKeys || {};

        var observersToUpdate = {},
            _this = this,
            key;

        var checkSubscription = function(vKey) {
            var bounds = VectorTile.boundsFromTileKey(vKey),
                observers = _this._observers;

            for (var sid in observers) {
                if (bounds.intersects(observers[sid].bbox)) {
                    observersToUpdate[sid] = true;
                }
            }
        };

        for (key in newTilesList) {
            if (!oldTilesList[key]) {
                checkSubscription(key);
            }
        }

        for (key in oldTilesList) {
            if (!newTilesList[key]) {
                checkSubscription(key);
            }
        }

        this._activeTileKeys = newTilesList;

        if (this.clientSideTile) {
            this._activeTileKeys[this.clientSideTile] = true;
        }

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
        var _items = this._items,
            id, i, len, it;

        var tile = this.processingTile,
            skip = {};

        if (tile) {
            var zKey = this._processingTileKey;
            for (i = 0, len = tile.data.length; i < len; i++) {
                it = tile.data[i];
                id = it[0];
                if (_items[id]) {
                    var item = _items[id];
                    item.processing = false;
                    delete item.options.fromTiles[zKey];
                }
            }
            tile.clear();
        }

        if (processing.Deleted) {
            for (i = 0, len = processing.Deleted.length; i < len; i++) {
                id = processing.Deleted[i];
                skip[id] = true;
                if (_items[id]) {
                    _items[id].processing = true;
                }
            }
        }

        var out = {};
        if (processing.Inserted) {
            for (i = 0, len = processing.Inserted.length; i < len; i++) {
                it = processing.Inserted[i];
                if (!skip[it.id]) { out[it.id] = it; }
            }
        }

        if (processing.Updated) {
            for (i = 0, len = processing.Updated.length; i < len; i++) {
                it = processing.Updated[i];
                if (!skip[it.id]) { out[it.id] = it; }
            }
        }

        var data = [];
        for (id in out) {
            if (this._items[id]) {
                this._items[id].processing = true;
            }

            data.push(this._propertiesToArray(out[id]));
        }

        if (data.length > 0) {
            if (!tile) {
                this.processingTile = tile = this.addData(data);
                this.addFilter('processingFilter', function(item, tile) {
                    return tile.z === 0 || !item.processing;
                });
            } else {
                this.addData(data);
            }
        }
        tile && this._triggerObservers();
    },

    updateVersion: function() {
        this._tilesTree = null;
        this._needCheckActiveTiles = true;
        this._getActiveTileKeys(); //force list update
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
            if ('x' in options) { x = options.x; }
            if ('y' in options) { y = options.y; }
            if ('z' in options) { z = options.z; }
            if ('v' in options) { v = options.v; }
            if ('s' in options) { s = options.s; }
            if ('d' in options) { d = options.d; }
        }
        var tileKey = VectorTile.makeTileKey(x, y, z, v, s, d),
            tileLink = this._tiles[tileKey];
        if (!tileLink) {
            tileLink = this._tiles[tileKey] = {
                tile: new VectorTile({load: function(x, y, z, v, s, d, callback) {
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
        if (!data) {
            data = [];
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
            vTile.removeData(chkKeys, true);
            this._updateItemsFromTile(vTile);

            //TODO: trigger observers depending on tile position, not all observers
            this._triggerObservers();
        }

        return vTile;
    },

    initTilesTree: function(layerProperties) {
        var arr = layerProperties.TemporalTiles || [],
            vers = layerProperties.TemporalVers || [],
            newTiles = {};

        for (var i = 0, len = arr.length; i < len; i++) {
            var arr1 = arr[i];
            var z = Number(arr1[4]),
                y = Number(arr1[3]),
                x = Number(arr1[2]),
                s = Number(arr1[1]),
                d = Number(arr1[0]),
                v = Number(vers[i]),
                tileKey = VectorTile.makeTileKey(x, y, z, v, s, d);

            newTiles[tileKey] = this._tiles[tileKey] || {
                tile: new VectorTile(this._vectorTileDataProvider, x, y, z, v, s, d)
            };
        }
        this._tiles = newTiles;

        this._tilesTree = new TilesTree(this._gmx.TemporalPeriods, this._gmx.ZeroUT);
        this._tilesTree.initFromTiles(this._tiles);
        if (this.processingTile) {
            this._tiles[this._processingTileKey] = {
                tile: this.processingTile
            };
        }
    },

    initTilesList: function(layerProperties) {
        var newActiveTileKeys = {};
        if (layerProperties.tiles) {
            var arr = layerProperties.tiles || [],
                vers = layerProperties.tilesVers,
                newTiles = {};

            for (var i = 0, cnt = 0, len = arr.length; i < len; i += 3, cnt++) {
                var z = Number(arr[i + 2]),
                    y = Number(arr[i + 1]),
                    x = Number(arr[i]),
                    v = Number(vers[cnt]),
                    tileKey = VectorTile.makeTileKey(x, y, z, v, -1, -1);

                newTiles[tileKey] = this._tiles[tileKey] || {
                    tile: new VectorTile(this._vectorTileDataProvider, x, y, z, v, -1, -1)
                };

                newActiveTileKeys[tileKey] = true;
            }
            this._tiles = newTiles;
            if (this.processingTile) {
                this._tiles[this._processingTileKey] = {
                    tile: this.processingTile
                };
            }
        }
        this._updateActiveTilesList(newActiveTileKeys);
    }
});
