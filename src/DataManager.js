var ObserverTileLoader = L.Class.extend({
    includes: L.Mixin.Events,
    initialize: function(dataManager) {
        this._dataManager = dataManager;
        this._observerData = {};
        this._tileData = {};
    },

    addObserver: function(observer) {
        this._observerData[observer.id] = {
            observer: observer,
            tiles: {},
            leftToLoad: 0,
            loadingState: false //are we loading any tiles for this observer?
        };

        observer.on('update', this._updateObserver.bind(this, observer));

        this._updateObserver(observer);

        return this;
    },

    removeObserver: function(id) {
        var obsTiles = this._observerData[id].tiles;

        for (var tileId in obsTiles) {
            delete this._tileData[tileId].observers[id];
        }

        delete this._observerData[id];

        return this;
    },

    addTile: function(tile) {
        var leftToLoadDelta = tile.state === 'loaded' ? 0 : 1;
        tile.loadDef.then(this._tileLoadedCallback.bind(this, tile));

        var tileObservers = {};

        for (var key in this._observerData) {
            var obsInfo = this._observerData[key];

            if (obsInfo.observer.intersectsWithTile(tile)) {
                obsInfo.tiles[tile.vectorTileKey] = true;
                obsInfo.leftToLoad += leftToLoadDelta;
                tileObservers[key] = true;
            }
        }

        this._tileData[tile.vectorTileKey] = {
            observers: tileObservers,
            tile: tile
        };

        return this;
    },

    removeTile: function(tileId) {
        var tileData = this._tileData[tileId],
            leftToLoadDelta = tileData.tile.state === 'loaded' ? 0 : 1;

        for (var id in tileData.observers) {
            var observerData = this._observerData[id];
            observerData.leftToLoad -= leftToLoadDelta;
            delete observerData.tiles[tileId];
        }

        delete this._tileData[tileId];

        return this;
    },

    startLoadTiles: function(observer) {

        //force active tile list update
        this._dataManager._getActiveTileKeys();

        var obsData = this._observerData[observer.id];
        if (obsData.leftToLoad === 0) {
            this.fire('observertileload', {observer: observer});
            return this;
        }
        
        if (!obsData.loadingState) {
            obsData.loadingState = true;
            observer.fire('startLoadingTiles');
        }

        for (var tileId in obsData.tiles) {
            this._tileData[tileId].tile.load();
        }

        return this;
    },

    getTileObservers: function(tileId) {
        return this._tileData[tileId].observers;
    },

    getObserverLoadingState: function(observer) {
        return this._observerData[observer.id].loadingState;
    },

    _updateObserver: function(observer) {
        var obsData = this._observerData[observer.id],
            newObserverTiles = {},
            leftToLoad = 0,
            key;

        for (key in this._tileData) {
            var tile = this._tileData[key].tile;
            if (observer.intersectsWithTile(tile)) {
                newObserverTiles[key] = true;
                if (tile.state !== 'loaded') {
                    leftToLoad++;
                }
                this._tileData[key].observers[observer.id] = true;
            }
        }

        for (key in obsData.tiles) {
            if (!(key in newObserverTiles)) {
                delete this._tileData[key].observers[observer.id];
            }
        }

        obsData.tiles = newObserverTiles;
        obsData.leftToLoad = leftToLoad;
    },

    _tileLoadedCallback: function(tile) {
        this.fire('tileload', {tile: tile});

        if (!(tile.vectorTileKey in this._tileData)) {
            return;
        }

        var tileObservers = this._tileData[tile.vectorTileKey].observers;
        for (var id in tileObservers) {
            var obsData = this._observerData[id];
            obsData.leftToLoad--;

            if (obsData.leftToLoad === 0) {
                if (obsData.loadingState) {
                    obsData.loadingState = false;
                    obsData.observer.fire('stopLoadingTiles');
                }
                this.fire('observertileload', {observer: obsData.observer});
            }
        }
    }
});

var DataManager = L.Class.extend({
    includes: L.Mixin.Events,

    options: {
        name: null,                         // layer ID
        identityField: '',                  // attribute name for identity items
        attributes: [],                     // attributes names
        attrTypes: [],                      // attributes types
        tiles: null,                        // tiles array for nontemporal data
        tilesVers: null,                    // tiles version array for nontemporal data
        LayerVersion: 0,                    // layer version
        GeoProcessing: null,                // processing data
        Temporal: false,                    // only for temporal data
        TemporalColumnName: '',             // temporal attribute name
        ZeroDate: '01.01.2008',             // 0 date string
        TemporalPeriods: [],                // temporal periods
        TemporalTiles: [],                  // temporal tiles array
        TemporalVers: [],                   // temporal version array
        hostName: 'maps.kosmosnimki.ru',    // default hostName
        sessionKey: ''                      // session key
    },

    setOptions: function(options) {
        if (!options.GeoProcessing) {
            this.options.GeoProcessing = null;
        } else {
            this.processingTile = this.addData([]);
        }
        L.setOptions(this, options);

        var arr = this.options.ZeroDate.split('.'),
            zn = new Date(
                (arr.length > 2 ? arr[2] : 2008),
                (arr.length > 1 ? arr[1] - 1 : 0),
                (arr.length > 0 ? arr[0] : 1)
            );
        this.dateZero = new Date(zn.getTime()  - zn.getTimezoneOffset() * 60000);
        this.ZeroUT = this.dateZero.getTime() / 1000;
        this._isTemporalLayer = this.options.Temporal;

        var tileAttributes = L.gmxUtil.getTileAttributes(this.options);
        this.tileAttributeIndexes = tileAttributes.tileAttributeIndexes;
        var hostName = this.options.hostName,
            sessionKey = this.options.sessionKey;
        if (!sessionKey) {
            sessionKey = L.gmx.gmxSessionManager.getSessionKey(hostName);
        }
        this.tileSenderPrefix = 'http://' + hostName + '/' +
            'TileSender.ashx?WrapStyle=None' +
            '&key=' + encodeURIComponent(sessionKey);

        this._needCheckActiveTiles = true;
    },

    _vectorTileDataProviderLoad: function(x, y, z, v, s, d, callback) {
        var _this = this;
        gmxVectorTileLoader.load(
            _this.tileSenderPrefix,
            {x: x, y: y, z: z, v: v, s: s, d: d, layerID: _this.options.name}
        ).then(callback, function() {
            console.log('Error loading vector tile');
            callback([]);
            _this.fire('chkLayerUpdate', {dataProvider: _this}); //TODO: do we really need event here?
        });
    },

    initialize: function(options) {
        this._tilesTree = null;
        this._activeTileKeys = {};
        this._endDate = null;
        this._beginDate = null;

        this._tiles = {};
        this._filters = {};
        this._freeSubscrID = 0;
        this._items = {};
        this._observers = {};

        this._needCheckDateInterval = false;
        this._needCheckActiveTiles = true;

        var _this = this;
        this._vectorTileDataProvider = {
            load: this._vectorTileDataProviderLoad.bind(this)
        };

        this._observerTileLoader = new ObserverTileLoader(this);
        this._observerTileLoader.on('tileload', function(event) {
            var tile = event.tile;
            _this._updateItemsFromTile(tile);

            if (_this._tilesTree) {
                var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                treeNode && treeNode.count--; //decrease number of tiles to load inside this node
            }
        });

        this._observerTileLoader.on('observertileload', function(event) {
            var observer = event.observer;
            if (observer.isActive()) {
                observer.needRefresh = false;
                observer.updateData(_this.getItems(observer.id));
            }
        });
        this.setOptions(options);
        if (this._isTemporalLayer) {
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

        var processing = this.options.GeoProcessing;
        if (processing || this.processingTile) {
            this._chkProcessing(processing);
        }

        if (this._isTemporalLayer) {
            var newTileKeys = {};
            if (this._beginDate && this._endDate) {
                if (!this._tilesTree) {
                    this.initTilesTree();
                }

                /*var commonBounds = L.gmxUtil.bounds();
                for (var obs in this._observers) {
                    commonBounds.extendBounds(this._observers[obs].bbox);
                }*/

                newTileKeys = this._tilesTree.selectTiles(this._beginDate, this._endDate).tiles;
            }
            this._updateActiveTilesList(newTileKeys);
        } else {
            this.initTilesList();
        }

        return this._activeTileKeys;
    },

    _getObserversByFilterName: function(filterName) {
        var oKeys = {};
        for (var id in this._observers) {
            if (this._observers[id].hasFilter(filterName)) {
                oKeys[id] = true;
            }
        }
        return oKeys;
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerObservers(this._getObserversByFilterName(filterName));
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            var oKeys = this._getObserversByFilterName(filterName);
            delete this._filters[filterName];
            this._triggerObservers(oKeys);
        }
    },

    getItems: function(oId) {
        var resItems = [],
            observer = this._observers[oId];

        if (!observer) {
            return [];
        }

        //add internal filters
        var filters = observer.filters.concat('processingFilter');
        this._isTemporalLayer && filters.push('TemporalFilter');

        filters = filters.filter(function(filter) {
            return filter in this._filters;
        }.bind(this));

        var _this = this,
            putData = function(tile) {
                var data = tile.data;
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
                        if (!filterFunc(item, tile, observer, geom, dataOption)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (isFiltered) { continue; }

                    var type = geom.type;

                    //TODO: remove from data manager
                    if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                        tile.calcEdgeLines(j);
                    }
                    resItems.push({
                        id: id,
                        properties: it,
                        item: item,
                        dataOption: dataOption,
                        tileKey: tile.vectorTileKey
                    });
                }
            };
        var activeTileKeys =  this._getActiveTileKeys();
        for (var tkey in activeTileKeys) {
            var tile = _this._tiles[tkey].tile;
            if (tile.data && tile.data.length > 0 && (tile.z === 0 || observer.intersectsWithTile(tile))) {
                putData(tile);
            }
        }

        return resItems;
    },

    _updateItemsFromTile: function(tile) {
        var vectorTileKey = tile.vectorTileKey,
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
                if (item.processing) { continue; }  // skip processing items
                if (item.type.indexOf('MULTI') === -1) {
                    item.type = 'MULTI' + item.type;
                }
                delete item.bounds;
                item.currentFilter = null;
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
            if (this.options.TemporalColumnName) {
                var zn = it[this.tileAttributeIndexes[this.options.TemporalColumnName]];
                item.options.unixTimeStamp = zn * 1000;
            }
        }
        return len;
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
        id = id || 's' + (++this._freeSubscrID);
        var _this = this,
            observer = new Observer(options);

        observer.id = id;
        observer.needRefresh = true;
        this._observerTileLoader.addObserver(observer);

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
                _this.checkObserver(observer);
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
            this._observerTileLoader.removeObserver(id);
            var isActive = this._observers[id].isActive();

            delete this._observers[id];

            if (isActive) {
                this.fire('observeractivate');
            }
        }
    },

    getObserverLoadingState: function(observer) {
        return this._observerTileLoader.getObserverLoadingState(observer);
    },

    getItemsBounds: function() {
        if (!this._itemsBounds) {
            this._itemsBounds = gmxAPIutils.bounds();
            for (var id in this._items) {
                var item = this.getItem(id);
                this._itemsBounds.extendBounds(item.bounds);
            }
        }
        return this._itemsBounds;
    },

    //combine and return all parts of geometry
    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                arr = [];
            for (var key in fromTiles) {    // get full object bounds
                if (this._tiles[key]) {
                    var num = fromTiles[key],
                        tile = this._tiles[key].tile;
                    if (tile.state === 'loaded' && tile.dataOptions[num]) {
                        arr.push(tile.dataOptions[num].bounds);
                    } else {
                        delete fromTiles[key];
                    }
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
                    objIndex = fromTiles[key],
                    props = tile.data[objIndex],
                    dataOption = tile.dataOptions[objIndex],
                    bbox = dataOption.bounds;

                members.push({
                    geo: props[props.length - 1],
                    width: bbox.max.x - bbox.min.x,
                    dataOption: dataOption
                });

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
                var tileData = this._tiles[key].tile.data,
                    props = tileData[fromTiles[key]];

                geomItems.push(props[props.length - 1]);
            }
        }
        return geomItems;
    },

    addTile: function(tile) {
        this._tiles[tile.vectorTileKey] = {tile: tile};
        this._getActiveTileKeys()[tile.vectorTileKey] = true;
        this._observerTileLoader.addTile(tile);
        this.checkObservers();
    },

    checkObserver: function(observer) {
        if (observer.needRefresh && observer.isActive()) {
            this._observerTileLoader.startLoadTiles(observer);
        }
    },

    checkObservers: function() {
        var observers = this._observers;
        for (var id in this._observers) {
            this.checkObserver(observers[id]);
        }
    },

    _waitCheckObservers: function() {
        //TODO: refactor
        if (this._checkObserversTimer) {
            clearTimeout(this._checkObserversTimer);
        }

        this._checkObserversTimer = setTimeout(L.bind(this.checkObservers, this), 0);
    },

    _triggerObservers: function(oKeys) {
        var keys = oKeys || this._observers;

        for (var id in keys) {
            if (this._observers[id]) {
                this._observers[id].needRefresh = true;
            }
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
                this.initTilesTree();
            }
            tileKeys = this._tilesTree.selectTiles(dateBegin, dateEnd).tiles;
        } else {
            this._needCheckActiveTiles = true;
            tileKeys = this._getActiveTileKeys();
        }

        var loadingDefs = [];
        for (var key in tileKeys) {
            var tile = this._tiles[key].tile;

            if (tile.state !== 'notLoaded') {
                continue;
            }

            if (bounds && !bounds.intersects(tile.bounds)) {
                continue;
            }

            var loadDef = tile.load();
            loadingDefs.push(loadDef);
        }

        return Deferred.all.apply(null, loadingDefs);
    },

    _updateActiveTilesList: function(newTilesList) {

        if (this._tileFilteringHook) {
            var filteredTilesList = {};
            for (var tk in newTilesList) {
                if (this._tileFilteringHook(this._tiles[tk].tile)) {
                    filteredTilesList[tk] = true;
                }
            }
            newTilesList = filteredTilesList;
        }

        var oldTilesList = this._activeTileKeys || {};

        var observersToUpdate = {},
            _this = this,
            key;

        if (this.processingTile) {
            newTilesList[this.processingTile.vectorTileKey] = true;
        }

        var checkSubscription = function(vKey) {
            var observerIds = _this._observerTileLoader.getTileObservers(vKey);
            for (var sid in observerIds) {
                observersToUpdate[sid] = true;
            }
        };

        for (key in newTilesList) {
            if (!oldTilesList[key]) {
                this._observerTileLoader.addTile(this._tiles[key].tile);
                checkSubscription(key);
            }
        }

        for (key in oldTilesList) {
            if (!newTilesList[key]) {
                checkSubscription(key);
                this._observerTileLoader.removeTile(key);
            }
        }

        this._activeTileKeys = newTilesList;

        this._triggerObservers(observersToUpdate);
    },

    _propertiesToArray: function(it) {
        var prop = it.properties,
            indexes = this.tileAttributeIndexes,
            arr = [];

        for (var key in indexes)
            arr[indexes[key]] = prop[key];

        arr[arr.length] = it.geometry;
        arr[0] = it.id;
        return arr;
    },

    _chkProcessing: function(processing) {
        var _items = this._items,
            tile = this.processingTile,
            needProcessingFilter = false,
            skip = {},
            id, i, len, it;


        if (tile) {
            var vKey = tile.vectorTileKey;
            for (i = 0, len = tile.data.length; i < len; i++) {
                it = tile.data[i];
                id = it[0];
                if (_items[id]) {
                    var item = _items[id];
                    item.processing = false;
                    item.currentFilter = null;
                    delete item.options.fromTiles[vKey];
                }
            }
            tile.clear();
        }

        if (processing) {
            if (processing.Deleted) {
                for (i = 0, len = processing.Deleted.length; i < len; i++) {
                    id = processing.Deleted[i];
                    skip[id] = true;
                    if (_items[id]) {
                        _items[id].processing = true;
                        _items[id].currentFilter = null;
                    }
                    if (len > 0) { needProcessingFilter = true; }
                }
            }

            var out = {};
            if (processing.Inserted) {
                for (i = 0, len = processing.Inserted.length; i < len; i++) {
                    it = processing.Inserted[i];
                    if (!skip[it[0]]) { out[it[0]] = it; }
                }
            }

            if (processing.Updated) {
                for (i = 0, len = processing.Updated.length; i < len; i++) {
                    it = processing.Updated[i];
                    if (!skip[it[0]]) { out[it[0]] = it; }
                }
                if (!needProcessingFilter && len > 0) { needProcessingFilter = true; }
            }

            var data = [];
            for (id in out) {
                if (this._items[id]) {
                    this._items[id].properties = out[id];
                    this._items[id].processing = true;
                    this._items[id].currentFilter = null;
                }
                data.push(out[id]);
            }

            if (data.length > 0) {
                this.processingTile = tile = this.addData(data);
            }
        }
        if (needProcessingFilter) {
            this.addFilter('processingFilter', function(item, tile) {
                return tile.z === 0 || !item.processing;
            });
        } else {
            this.removeFilter('processingFilter');
        }
        this.options.GeoProcessing = null;
    },

    updateVersion: function(layerDescription) {
        if (layerDescription && layerDescription.properties) {
            this.setOptions(layerDescription.properties);
        }
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

    _getProcessingTile: function() {
        if (!this.processingTile) {
        var x = -0.5, y = -0.5, z = 0, v = 0, s = -1, d = -1;

            this.processingTile = new VectorTile({load: function(x, y, z, v, s, d, callback) {
                            callback([]);
            }}, x, y, z, v, s, d);

            this.addTile(this.processingTile);
        }
        return this.processingTile;
    },

    addData: function(data) {
        if (!data) {
            data = [];
        }
        var vTile = this._getProcessingTile(),
            chkKeys = this._getDataKeys(data),
            dataBounds = vTile.addData(data, chkKeys);

        if (this._itemsBounds) {
            this._itemsBounds.extendBounds(dataBounds);
        }
        this._updateItemsFromTile(vTile);
        this._triggerObservers();
        return vTile;
    },

    removeData: function(data) {
        this._itemsBounds = null;
        var vTile = this.processingTile;
        if (vTile) {
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

            this._triggerObservers();
        }

        return vTile;
    },

    initTilesTree: function() {
        var tiles = this.options.TemporalTiles || [],
            vers = this.options.TemporalVers || [],
            newTiles = {};

        for (var i = 0, len = tiles.length; i < len; i++) {
            var tileInfo = tiles[i];
            var z = Number(tileInfo[4]),
                y = Number(tileInfo[3]),
                x = Number(tileInfo[2]),
                s = Number(tileInfo[1]),
                d = Number(tileInfo[0]),
                v = Number(vers[i]),
                tileKey = VectorTile.makeTileKey(x, y, z, v, s, d);

            newTiles[tileKey] = this._tiles[tileKey] || {
                tile: new VectorTile(this._vectorTileDataProvider, x, y, z, v, s, d, this.dateZero)
            };
        }
        this._tiles = newTiles;

        this._tilesTree = new TilesTree(this.options.TemporalPeriods, this.ZeroUT);
        this._tilesTree.initFromTiles(this._tiles);
        if (this.processingTile) {
            this._tiles[this.processingTile.vectorTileKey] = {
                tile: this.processingTile
            };
        }
    },

    initTilesList: function() {
        var newActiveTileKeys = {};
        if (this.options.tiles) {
            var arr = this.options.tiles || [],
                vers = this.options.tilesVers,
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
                this._tiles[this.processingTile.vectorTileKey] = {
                    tile: this.processingTile
                };
            }
        }
        this._updateActiveTilesList(newActiveTileKeys);
    },

    //Tile filtering hook filters out active vector tiles.
    //Can be used to prevent loading data from some spatial-temporal region
    setTileFilteringHook: function(filteringHook) {
        this._tileFilteringHook = filteringHook;
        this._needCheckActiveTiles = true;
        this._getActiveTileKeys(); //force list update
    },

    removeTileFilteringHook: function() {
        this._tileFilteringHook = null;
        this._needCheckActiveTiles = true;
        this._getActiveTileKeys(); //force list update
    }

});
L.gmx = L.gmx || {};
L.gmx.DataManager = DataManager;
