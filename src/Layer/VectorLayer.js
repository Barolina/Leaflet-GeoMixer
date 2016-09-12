L.gmx.VectorLayer = L.TileLayer.Canvas.extend(
{
    options: {
        openPopups: [],
        minZoom: 1,
        zIndexOffset: 0,
        isGeneralized: true,
        isFlatten: false,
        useWebGL: false,
        clickable: true
    },

    initialize: function(options) {
        options = L.setOptions(this, options);

        this.initPromise = new L.gmx.Deferred();

        this._drawQueue = [];
        this._drawQueueHash = {};

        this._drawInProgress = {};

        this._anyDrawings = false; //are we drawing something?
        this.repaintObservers = {};    // external observers like screen

        var _this = this;

        this._gmx = {
            hostName: gmxAPIutils.normalizeHostname(options.hostName || 'maps.kosmosnimki.ru'),
            mapName: options.mapID,
            useWebGL: options.useWebGL,
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            tileSubscriptions: {},
            _tilesToLoad: 0,
            shiftXlayer: 0,
            shiftYlayer: 0,
            renderHooks: [],
            preRenderHooks: [],
            _needPopups: {}
        };
        if (options.crossOrigin) {
            this._gmx.crossOrigin = options.crossOrigin;
        }

        this.on('tileunload', function(e) {
            _this._clearTileSubscription(e.tile.zKey);
        });
    },

    // extended from L.TileLayer.Canvas
    _removeTile: function (zKey) {
        var tileLink = this._tiles[zKey];
        if (tileLink) {
            var tile = tileLink.el;
            if (tile && tile.parentNode) {
                tile.parentNode.removeChild(tile);
            }

            delete this._tiles[zKey];
        }
    },

    onAdd: function(map) {
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw 'GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer';
        }
        var gmx = this._gmx;

        gmx.shiftY = 0;
        gmx.applyShift = map.options.crs === L.CRS.EPSG3857;
        gmx.currentZoom = map.getZoom();
        gmx.styleManager.initStyles();

        L.TileLayer.Canvas.prototype.onAdd.call(this, map);

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        if (gmx.properties.type === 'Vector') {
            map.on('moveend', this._moveEnd, this);
        }
        if (this.options.clickable === false) {
            this._container.style.pointerEvents = 'none';
        }
        if (gmx.balloonEnable && !this._popup) { this.bindPopup(''); }
        this.on('stylechange', this._onStyleChange, this);
        this.on('versionchange', this._onVersionChange, this);

        this._zIndexOffsetCheck();
        L.gmx.layersVersion.add(this);
        this.fire('add');
    },

    onRemove: function(map) {
        if (this._container) {
            this._container.parentNode.removeChild(this._container);
        }

        map.off({
            'viewreset': this._reset,
            'moveend': this._update
        }, this);

        if (this._animated) {
            map.off({
                'zoomanim': this._animateZoom,
                'zoomend': this._endZoomAnim
            }, this);
        }

        if (!this.options.updateWhenIdle) {
            map.off('move', this._limitedUpdate, this);
        }
        this._container = null;
        this._map = null;

        this._clearAllSubscriptions();
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
        this.off('stylechange', this._onStyleChange, this);

        var gmx = this._gmx;

        delete gmx.map;
        if (gmx.properties.type === 'Vector') {
            map.off('moveend', this._moveEnd, this);
        }
        if (gmx.dataManager && !gmx.dataManager.getActiveObserversCount()) {
            L.gmx.layersVersion.remove(this);
        }
        this.fire('remove');
    },

    _initContainer: function () {
        L.TileLayer.Canvas.prototype._initContainer.call(this);
        this._prpZoomData();
        this.setZIndexOffset();
    },

    _updateZIndex: function () {
        if (this._container) {
            var options = this.options,
                zIndex = options.zIndex || 0,
                zIndexOffset = options.zIndexOffset || 0;

            this._container.style.zIndex = zIndexOffset + zIndex;
        }
    },

    _update: function () {
        if (!this._map ||
            this.isExternalVisible && this.isExternalVisible(this._map._zoom) // External layer enabled on this.zoom
            ) {
            this._clearAllSubscriptions();
            return;
        }
        this._gmx.styleManager.deferred.then(this.__update.bind(this));
    },

    _addTile: function (tilePoint) {
        var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

        if (!gmx.layerType || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            this._tileLoaded();
            return;
        }

        var zKey = this._tileCoordsToKey(tilePoint, zoom);
        if (!gmx.tileSubscriptions[zKey]) {
            gmx._tilesToLoad++;
            var isDrawnFirstTime = false,
                gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
                done = function() {
                    if (!isDrawnFirstTime) {
                        gmx._tilesToLoad--;
                        myLayer._tileLoaded();
                        isDrawnFirstTime = true;
                    }
                },
                attr = {
                    type: 'resend',
                    active: false,
                    bbox: gmx.styleManager.getStyleBounds(gmxTilePoint),
                    filters: ['clipFilter', 'userFilter_' + gmx.layerID, 'styleFilter', 'userFilter'],
                    callback: function(data) {
                        myLayer._drawTileAsync(tilePoint, zoom, data).always(done);
                    }
                };
            if (this.options.isGeneralized) {
                attr.targetZoom = zoom;
            }
            if (gmx.layerType === 'VectorTemporal') {
                attr.dateInterval = [gmx.beginDate, gmx.endDate];
            }

            var observer = gmx.dataManager.addObserver(attr, zKey);
            observer.on('activate', function() {
                //if observer is deactivated before drawing,
                //we can consider corresponding tile as already drawn
                if (!observer.isActive()) {
                    done();
                }
            });

            observer.on('startLoadingTiles', this._chkDrawingState, this);

            gmx.tileSubscriptions[zKey] = {
                z: zoom,
                x: tilePoint.x,
                y: tilePoint.y,
                px: 256 * gmxTilePoint.x,
                py: 256 * (1 + gmxTilePoint.y)
            };
            observer.activate();
        }
    },

    _chkDrawingState: function() {
        var gmx = this._gmx,
            isDrawing = this._drawQueue.length > 0 || Object.keys(this._drawInProgress).length > 0;

        if (!isDrawing) {
            for (var key in gmx.tileSubscriptions) {
                var observer = gmx.dataManager.getObserver(key);
                if (observer && gmx.dataManager.getObserverLoadingState(observer)) {
                    isDrawing = true;
                    break;
                }
            }
        }

        if (!isDrawing && this._anyDrawings) {
            this.fire('doneDraw');
        } else  if (isDrawing && !this._anyDrawings) {
            this.fire('startDraw');
        }

        this._anyDrawings = isDrawing;
    },

    _getLoadedTilesPercentage: function (container) {
        if (!container) { return 0; }
        var len = 0, count = 0;
        var arr = ['img', 'canvas'];
        for (var key in arr) {
            var tiles = container.getElementsByTagName(arr[key]);
            if (tiles && tiles.length > 0) {
                len += tiles.length;
                for (var i = 0, len1 = tiles.length; i < len1; i++) {
                    if (tiles[i]._tileComplete) {
                        count++;
                    }
                }
            }
        }
        if (len < 1) { return 0; }
        return count / len;
    },

    _tileLoaded: function () {
        if (this._animated) {
            L.DomUtil.addClass(this._tileContainer, 'leaflet-zoom-animated');
        }
        if (this._gmx._tilesToLoad === 0) {
            this.fire('load');

            if (this._animated) {
                // clear scaled tiles after all new tiles are loaded (for performance)
                this._setClearBgBuffer(0);
            }
        }
    },

    _tileOnLoad: function (tile) {
        if (tile) { L.DomUtil.addClass(tile, 'leaflet-tile-loaded'); }
        this._tileLoaded();
    },

    _tileOnError: function () {
    },

    tileDrawn: function (tile) {
        this._tileOnLoad(tile);
    },

    // prepare for Leaflet 1.0 - this methods exists in L.GridLayer
    // converts tile coordinates to key for the tile cache
    _tileCoordsToKey: function (coords, zoom) {
        return coords.x + ':' + coords.y + ':' + (coords.z || zoom);
    },

    _getTiledPixelBounds: function (center) {
        var map = this._map,
            gmx = this._gmx,
            shiftPoint = new L.Point(gmx.shiftX, gmx.shiftY),
            pixelCenter = map.project(center, this._tileZoom).add(shiftPoint)._floor(),
            halfSize = map.getSize().divideBy(2);

        return new L.Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize));
    },

    _pxBoundsToTileRange: function (bounds) {
        var tileSize = this.options.tileSize;
        return new L.Bounds(
            bounds.min.divideBy(tileSize)._floor(),
            bounds.max.divideBy(tileSize)._round());
    },

    // original for L.gmx.VectorLayer

    //public interface
    initFromDescription: function(ph) {
        var gmx = this._gmx;

        gmx.properties = ph.properties;
        gmx.geometry = ph.geometry;

        if (gmx.properties._initDone) {    // need delete tiles key
            delete gmx.properties[gmx.properties.Temporal ? 'TemporalTiles' : 'tiles'];
        }
        gmx.properties._initDone = true;

        if (!gmx.geometry) {
            var worldSize = gmxAPIutils.tileSizes[1];
            gmx.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        }

        // Original properties from the server.
        // Descendant classes can override this property
        // Not so good solution, but it works
        gmx.rawProperties = ph.rawProperties || ph.properties;

        this._updateProperties(ph.properties);

        ph.properties.isGeneralized = this.options.isGeneralized;
        ph.properties.isFlatten = this.options.isFlatten;

        gmx.dataManager = this.options.dataManager || new DataManager(ph.properties);

        if (this.options.parentOptions) {
			if (!ph.properties.styles) { ph.properties.styles = this.options.parentOptions.styles; }
			gmx.dataManager.on('versionchange', this._onVersionChange, this);
		}

		gmx.styleManager = new StyleManager(gmx);
        this.options.minZoom = gmx.styleManager.minZoom;
        this.options.maxZoom = gmx.styleManager.maxZoom;

        gmx.dataManager.on('observeractivate', function() {
            if (gmx.dataManager.getActiveObserversCount()) {
                L.gmx.layersVersion.add(this);
            } else {
                L.gmx.layersVersion.remove(this);
            }
        }, this);

        if (gmx.properties.type === 'Vector' && !('chkUpdate' in this.options)) {
            this.options.chkUpdate = true; //Check updates for vector layers by default
        }
        if (gmx.rawProperties.type !== 'Raster' && this._objectsReorderInit) {
            this._objectsReorderInit(this);
        }

        if (gmx.clusters) {
            this.bindClusters(JSON.parse(gmx.clusters));
        }
        if (gmx.filter) {
            var func = L.gmx.Parsers.parseSQL(gmx.filter.replace(/[\[\]]/g, '"'));
            if (func) {
				gmx.dataManager.addFilter('userFilter_' + gmx.layerID, function(item) {
					return gmx.layerID !== this._gmx.layerID || !func || func(item.properties, gmx.tileAttributeIndexes) ? item.properties : null;
				}.bind(this));
            }
        }
        if (gmx.dateBegin && gmx.dateEnd) {
            this.setDateInterval(gmx.dateBegin, gmx.dateEnd);
        }

        this.initPromise.resolve();
        return this;
    },

    getDataManager: function () {
		return this._gmx.dataManager;
    },

    enableGeneralization: function () {
        if (!this.options.isGeneralized) {
            this.options.isGeneralized = true;
            if (this._gmx.dataManager) {
                this._clearAllSubscriptions();
                this._gmx.dataManager.enableGeneralization();
                this.redraw();
            }
        }
    },

    disableGeneralization: function () {
        if (this.options.isGeneralized) {
            this.options.isGeneralized = false;
            if (this._gmx.dataManager) {
                this._clearAllSubscriptions();
                this._gmx.dataManager.disableGeneralization();
                this.redraw();
            }
        }
    },

    setRasterOpacity: function (opacity) {
        var _this = this;
        if (this._gmx.rasterOpacity !== opacity) {
            this._gmx.rasterOpacity = opacity;
            this.initPromise.then(function() {
                _this.repaint();
            });
        }
        return this;
    },

    getStyles: function () {
        return this._gmx.styleManager.getStyles();
    },

    getIcons: function (callback) {
        this._gmx.styleManager.getIcons(callback);
        return this;
    },

    setStyles: function (styles) {
        var _this = this;

        this.initPromise.then(function() {
            _this._gmx.styleManager.clearStyles();
            if (styles) {
                styles.forEach(function(it, i) {
                    _this.setStyle(it, i, true);
                });
            } else {
                _this.fire('stylechange');
            }
        });
        return this;
    },

    getStyle: function (num) {
        return this.getStyles()[num];
    },

    setStyle: function (style, num, createFlag) {
        var _this = this,
            gmx = this._gmx;
        this.initPromise.then(function() {
            gmx.styleManager.setStyle(style, num, createFlag).then(function () {
                _this.fire('stylechange', {num: num || 0});
            });
        });
        return this;
    },

    setStyleHook: function (func) {
        this._gmx.styleHook = func;
        this.repaint();
        return this;
    },

    removeStyleHook: function () {
        this._gmx.styleHook = null;
        return this;
    },

    setRasterHook: function (func) {
        this._gmx.rasterProcessingHook = func;
        this.repaint();
        return this;
    },

    removeRasterHook: function () {
        this._gmx.rasterProcessingHook = null;
        this.repaint();
        return this;
    },

    setFilter: function (func) {
        var gmx = this._gmx;
        gmx.dataManager.addFilter('userFilter', function(item) {
            return gmx.layerID !== this._gmx.layerID || !func || func(item) ? item.properties : null;
        }.bind(this));
        return this;
    },

    removeFilter: function () {
        this._gmx.dataManager.removeFilter('userFilter');
        return this;
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;

        if (gmx.dateBegin && gmx.dateEnd) {
			beginDate = gmx.dateBegin;
			endDate = gmx.dateEnd;
		}

        //check that something changed
        if (!gmx.beginDate !== !beginDate ||
            !gmx.endDate !== !endDate ||
            beginDate && (gmx.beginDate.valueOf() !== beginDate.valueOf()) ||
            endDate && (gmx.endDate.valueOf() !== endDate.valueOf())
        ) {
            if (gmx.rawProperties.maxShownPeriod && beginDate) {
                var msecPeriod = gmx.rawProperties.maxShownPeriod * 24 * 3600 * 1000;
                beginDate = new Date(Math.max(beginDate.valueOf(), endDate.valueOf() - msecPeriod));
            }

            gmx.beginDate = beginDate;
            gmx.endDate = endDate;

            var observer = null;
            for (var key in gmx.tileSubscriptions) {
                observer = gmx.dataManager.getObserver(key);
                observer.setDateInterval(beginDate, endDate);
            }
            observer = gmx.dataManager.getObserver('_Labels');
            if (observer) {
                observer.setDateInterval(beginDate, endDate);
            }
			if (window.gmxSkipTiles === 'NotVisible' || gmx.properties.UseTiles === false) {
				gmx.properties.LayerVersion = -1;
				if (this._map) {
					L.gmx.layersVersion.now();
				}
			}
            this.fire('dateIntervalChanged');
        }

        return this;
    },

    getDateInterval: function() {
        return {
            beginDate: this._gmx.beginDate,
            endDate: this._gmx.endDate
        };
    },

    addObserver: function (options) {
        return this._gmx.dataManager.addObserver(options);
    },

    removeObserver: function(observer) {
        return this._gmx.dataManager.removeObserver(observer.id);
    },

    setPositionOffset: function(dx, dy) {
        var gmx = this._gmx;
        gmx.shiftXlayer = dx;
        gmx.shiftYlayer = dy;
        this._update();
        return this;
    },

    getPositionOffset: function() {
        var gmx = this._gmx;
        return {shiftX: gmx.shiftXlayer, shiftY: gmx.shiftYlayer};
    },

    setZIndexOffset: function (offset) {
        if (arguments.length) {
            this.options.zIndexOffset = offset;
        }
        this._updateZIndex();
        return this;
    },

    repaint: function (zKeys) {
        if (this._map) {
            if (!zKeys) {
                zKeys = {};
                for (var key in this._gmx.tileSubscriptions) { zKeys[key] = true; }
                L.extend(zKeys, this.repaintObservers);
            }
            this._gmx.dataManager._triggerObservers(zKeys);
        }
    },

    redrawItem: function (id) {
        if (this._map) {
            var item = this._gmx.dataManager.getItem(id),
                gmxTiles = this._getTilesByBounds(item.bounds);

            this.repaint(gmxTiles);
        }
    },

    gmxGetCanvasTile: function (tilePoint) {
        var zKey = this._tileCoordsToKey(tilePoint);

        if (zKey in this._tiles) {
            return this._tiles[zKey];
        }
        // save tile in cache
        var tile = this._getTile();
        this._tiles[zKey] = {
            el: tile,
            coords: tilePoint,
            current: true
        };

        // tile._zKey = zKey;
        tile._zoom = this._map._zoom;
        tile._tileComplete = true;
        tile._tilePoint = tilePoint;
        this.tileDrawn(tile);
        return this._tiles[zKey];
    },

    appendTileToContainer: function (tile) {
        this._tileContainer.appendChild(tile);
        var tilePos = this._getTilePos(tile._tilePoint);
        L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
    },

    addData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.addData(data, options);
            this.repaint();
        }
        return this;
    },

    removeData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.removeData(data, options);
            this.repaint();
        }
        return this;
    },

    getStylesByProperties: function(propArray, zoom) {
        return this._gmx.styleManager.getCurrentFilters(propArray, zoom);
    },

    getItemStyle: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id);
        return gmx.styleManager.getObjStyle(item);
    },

    getTileAttributeTypes: function() {
        return this._gmx.tileAttributeTypes;
    },

    getTileAttributeIndexes: function() {
        return this._gmx.tileAttributeIndexes;
    },

    getItemBalloon: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id),
            styles = this.getStyles(),
            out = '';

        if (item && styles[item.currentFilter]) {
            var propsArr = item.properties;
            out = L.gmxUtil.parseBalloonTemplate(styles[item.currentFilter].Balloon, {
                properties: this.getItemProperties(propsArr),
                geometries: [propsArr[propsArr.length - 1]],
                tileAttributeTypes: gmx.tileAttributeTypes,
                unitOptions: this._map ? this._map.options : {}
            });
        }
        return out;
    },

    getItemProperties: function(propArray) {
        var properties = {},
            indexes = this._gmx.tileAttributeIndexes;
        for (var key in indexes) {
            properties[key] = propArray[indexes[key]];
        }
        return properties;
    },

    addPreRenderHook: function(renderHook) {
        this._gmx.preRenderHooks.push(renderHook);
        this.repaint();
    },

    removePreRenderHook: function(hook) {
        var arr = this._gmx.preRenderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },

    addRenderHook: function(renderHook) {
        this._gmx.renderHooks.push(renderHook);
        this.repaint();
    },

    removeRenderHook: function(hook) {
        var arr = this._gmx.renderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },

    //get original properties from the server
    getGmxProperties: function() {
        return this._gmx.rawProperties;
    },

    //returns L.LatLngBounds
    getBounds: function() {
        var proj = L.Projection.Mercator,
            gmxBounds = this._gmx.layerID ? gmxAPIutils.geoItemBounds(this._gmx.geometry).bounds : this._gmx.dataManager.getItemsBounds();

        if (gmxBounds) {
            return L.latLngBounds([proj.unproject(gmxBounds.min), proj.unproject(gmxBounds.max)]);
        } else {
            return new L.LatLngBounds();
        }
    },

    getGeometry: function() {
        if (!this._gmx.latLngGeometry) {
            this._gmx.latLngGeometry = L.gmxUtil.geometryToGeoJSON(this._gmx.geometry, true);
        }

        return this._gmx.latLngGeometry;
    },

    // internal methods
    _clearTileSubscription: function(zKey) {
        var gmx = this._gmx;

        if (zKey in gmx.tileSubscriptions) {
            var subscription = gmx.tileSubscriptions[zKey];
            if (subscription.screenTile) {
                subscription.screenTile.destructor();
            }
			var observer = gmx.dataManager.getObserver(zKey);
            if (observer) { observer.deactivate(); }
            delete gmx.tileSubscriptions[zKey];
            this._removeTile(zKey);

            if (this._anyDrawings) {
                this._chkDrawingState();
            }
        }

        if (zKey in this._drawQueueHash) {
            this._drawQueueHash[zKey].cancel();
        }
    },

    _clearAllSubscriptions: function() {
        while (this._drawQueue.length) {
            this._drawQueue[0].def.cancel();
        }

        var gmx = this._gmx;

        for (var zKey in gmx.tileSubscriptions) {
            var subscription = gmx.tileSubscriptions[zKey];
            if (subscription.screenTile) {
                subscription.screenTile.destructor();
            }
			var observer = gmx.dataManager.getObserver(zKey);
            if (observer) { observer.deactivate(); }
            gmx.dataManager.removeObserver(zKey);
            delete gmx.tileSubscriptions[zKey];
            delete this._tiles[zKey];
        }

        if (this._anyDrawings) {
            this._chkDrawingState();
        }

        gmx._tilesToLoad = 0;
    },

    _zoomStart: function() {
        this._gmx.zoomstart = true;
    },

    _zoomEnd: function() {
        this._gmx.zoomstart = false;
        this.setCurrentZoom(this._map);
        this._zIndexOffsetCheck();
    },

    _moveEnd: function() {
        if ('dataManager' in this._gmx) {
            this._gmx.dataManager.fire('moveend');
        }
    },

    _onStyleChange: function() {
        var gmx = this._gmx;
        if (!gmx.balloonEnable && this._popup) {
            this.unbindPopup();
        } else if (gmx.balloonEnable && !this._popup) {
            this.bindPopup('');
        }
        if (this._map) {
            if (this.options.minZoom !== gmx.styleManager.minZoom || this.options.maxZoom !== gmx.styleManager.maxZoom) {
                this.options.minZoom = gmx.styleManager.minZoom;
                this.options.maxZoom = gmx.styleManager.maxZoom;
                this._map._updateZoomLevels();
            }
            if (gmx.labelsLayer) {
                this._map._labelsLayer.add(this);
            } else if (!gmx.labelsLayer) {
                this._map._labelsLayer.remove(this);
            }
            if (Object.keys(gmx.tileSubscriptions).length > 0) {
                for (var key in gmx.tileSubscriptions) {    // recheck bbox on screen observers
                    var observer = gmx.dataManager.getObserver(key),
                        parsedKey = gmx.tileSubscriptions[key],
                        gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(parsedKey, parsedKey.z),
                        bbox = gmx.styleManager.getStyleBounds(gmxTilePoint);
                    if (!observer.bbox.isEqual(bbox)) {
                        var proj = L.Projection.Mercator;
                        observer.setBounds(L.latLngBounds([proj.unproject(bbox.min), proj.unproject(bbox.max)]));
                    }
                }
            } else {
                this.redraw();
            }
        }
    },

    _removeInProgressDrawing: function(zKey) {
        delete this._drawInProgress[zKey];
        this._chkDrawingState();
    },

    _drawTileAsync: function (tilePoint, zoom, data) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            zKey = this._tileCoordsToKey(tilePoint, zoom),
            _this = this;

        if (this._drawQueueHash[zKey]) {
            this._drawQueueHash[zKey].cancel();
        }

        var drawNextTile = function() {
            _this._chkDrawingState();

            if (!queue.length) {
                return;
            }

            var queueItem = queue.shift();
            delete _this._drawQueueHash[queueItem.zKey];
            if (_this._map && queueItem.z === _this._map._zoom) {
                queueItem.drawDef = _this._gmxDrawTile(queueItem.tp, queueItem.z, queueItem.data);

                _this._drawInProgress[queueItem.zKey] = true;

                queueItem.drawDef.always(_this._removeInProgressDrawing.bind(_this, queueItem.zKey));

                queueItem.drawDef.then(
                    queueItem.def.resolve.bind(queueItem.def, queueItem.data),
                    queueItem.def.reject
                );
            } else {
                queueItem.def.reject();
            }
            setTimeout(drawNextTile, 0);
        };

        var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var queueItem = {gtp: gtp, tp: tilePoint, z: zoom, zKey: zKey, data: data};
        var def = queueItem.def = new L.gmx.Deferred(function() {
            queueItem.drawDef && queueItem.drawDef.cancel();

            _this._removeInProgressDrawing(zKey);

            delete _this._drawQueueHash[zKey];
            for (var i = queue.length - 1; i >= 0; i--) {
                var elem = queue[i];
                if (elem.zKey === zKey) {
                    queue.splice(i, 1);
                    break;
                }
            }
        });
        queue.push(queueItem);

        this._drawQueueHash[zKey] = def;

        if (isEmpty) {
            setTimeout(drawNextTile, 0);
        }

        return def;
    },

    _updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map,
            deltaY = 0;

        if (map) {
            var pos = map.getCenter();
            deltaY = map.options.crs.project(pos).y - L.Projection.Mercator.project(pos).y;
        }

        gmx.shiftX = Math.floor(gmx.mInPixel * (gmx.shiftXlayer || 0));
        gmx.shiftY = Math.floor(gmx.mInPixel * (deltaY + (gmx.shiftYlayer || 0)));
        gmx.shiftPoint = new L.Point(gmx.shiftX, -gmx.shiftY);     // Сдвиг слоя

        L.DomUtil.setPosition(this._tileContainer, gmx.shiftPoint);
    },

    _prpZoomData: function() {
        this.setCurrentZoom(this._map);
        // this.repaint();
    },

    setCurrentZoom: function(map) {
        var gmx = this._gmx;
        gmx.currentZoom = map._zoom;
        gmx.tileSize = gmxAPIutils.tileSizes[gmx.currentZoom];
        gmx.mInPixel = 256 / gmx.tileSize;
    },

    _zIndexOffsetCheck: function() {
        var gmx = this._gmx;
        if (gmx.properties.fromType !== 'Raster' && (gmx.IsRasterCatalog || gmx.Quicklook)) {
            var minZoom = gmx.IsRasterCatalog ? gmx.minZoomRasters : gmx.minZoomQuicklooks;
            var zIndexOffset = this._map._zoom < minZoom ? L.gmx.VectorLayer.prototype.options.zIndexOffset : 0;
            if (zIndexOffset !== this.options.zIndexOffset) {
                this.setZIndexOffset(zIndexOffset);
            }
        }
    },

    _setClearBgBuffer: function (zd) {
        if (this._clearBgBufferTimer) { clearTimeout(this._clearBgBufferTimer); }
        var _this = this;
        this._clearBgBufferTimer = setTimeout(function () {
            if (_this._bgBuffer) {
                _this._clearBgBuffer();
            }
        }, zd || 0);
    },

    _getNeedPopups: function () {
        var out = {},
            openPopups = this.options.openPopups;
        for (var i = 0, len = openPopups.length; i < len; i++) {
            out[openPopups[i]] = false;
        }
        return out;
    },

    __update: function () {
        var map = this._map;
        if (!map) { return; }
        var zoom = map.getZoom(),
            center = map.getCenter();

        if (this._gmx.applyShift) {
            this._updateShiftY();
        }
        this._tileZoom = zoom;
        if (this.options.openPopups.length) {
            this._gmx._needPopups = this._getNeedPopups();
            this.options.openPopups = [];
        }

        var pixelBounds = this._getTiledPixelBounds(center),
            tileRange = this._pxBoundsToTileRange(pixelBounds),
            limit = this._getWrapTileNum();

        if (tileRange.min.y < 0) { tileRange.min.y = 0; }
        if (tileRange.max.y >= limit.y) { tileRange.max.y = limit.y - 1; }

        this._chkTileSubscriptions(zoom, tileRange);

        if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
            this._setClearBgBuffer(500);
            return;
        }

        // create a queue of coordinates to load tiles from
        for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
            for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
                var coords = new L.Point(i, j);
                coords.z = this._tileZoom;

                if (!this._tiles[this._tileCoordsToKey(coords)]) {
                    this._addTile(coords);
                }
            }
        }
    },

    _chkTileSubscriptions: function (zoom, tileRange) {
        //L.TileVector will remove all tiles from other zooms.
        //But it will not remove subscriptions without tiles - we should do it ourself
        var gmx = this._gmx,
            min = tileRange.min,
            max = tileRange.max;

        for (var zKey in gmx.tileSubscriptions) {
            var subscription = gmx.tileSubscriptions[zKey];
            if (subscription.z !== zoom
                || subscription.x < min.x
                || subscription.x > max.x
                || subscription.y < min.y
                || subscription.y > max.y
            ) {
                this._clearTileSubscription(zKey);
            }
        }
    },

    _getScreenTile: function (tilePoint, zoom) {
        var gmx = this._gmx,
            zKey = this._tileCoordsToKey(tilePoint, zoom),
            subscription = gmx.tileSubscriptions[zKey],
            screenTile = null;
        if (subscription) {
            if (subscription.screenTile) {
                screenTile = subscription.screenTile;
            } else {
                subscription.screenTile = screenTile = new ScreenVectorTile(this, tilePoint, zoom);
            }
        }
        return screenTile;
    },

    _gmxDrawTile: function (tilePoint, zoom, data) {
        var gmx = this._gmx,
            cancelled = false,
            screenTileDrawPromise = null,
            def = new L.gmx.Deferred(function() {
                cancelled = true;
                screenTileDrawPromise && screenTileDrawPromise.cancel();
            });

        if (!this._map) {
            def.reject();
            return def;
        }
        var screenTile = this._getScreenTile(tilePoint, zoom || this._map._zoom);
        if (screenTile) {
            gmx.styleManager.deferred.then(function () {
                if (!cancelled) {
                    screenTileDrawPromise = screenTile.drawTile(data);
                    screenTileDrawPromise.then(def.resolve.bind(def, data), def.reject);
                }
            });
        }
       return def;
    },

    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            zoom = this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
            minLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.min.x, bounds.min.y)),
            maxLatLng = L.Projection.Mercator.unproject(new L.Point(bounds.max.x, bounds.max.y)),
            screenBounds = this._map.getBounds(),
            sw = screenBounds.getSouthWest(),
            ne = screenBounds.getNorthEast(),
            dx = 0;

        if (ne.lng - sw.lng < 360) {
            if (maxLatLng.lng < sw.lng) {
                dx = 360 * (1 + Math.floor((sw.lng - maxLatLng.lng) / 360));
            } else if (minLatLng.lng > ne.lng) {
                dx = 360 * Math.floor((ne.lng - minLatLng.lng) / 360);
            }
        }
        minLatLng.lng += dx;
        maxLatLng.lng += dx;

        var pixelBounds = this._map.getPixelBounds(),
            minPoint = this._map.project(minLatLng),
            maxPoint = this._map.project(maxLatLng);

        var minY, maxY, minX, maxX;
        if (pixelBounds) {
            minY = Math.floor((Math.max(maxPoint.y, pixelBounds.min.y) + shiftY) / 256);
            maxY = Math.floor((Math.min(minPoint.y, pixelBounds.max.y) + shiftY) / 256);
            minX = minLatLng.lng <= -180 ? pixelBounds.min.x : Math.max(minPoint.x, pixelBounds.min.x);
            minX = Math.floor((minX + shiftX) / 256);
            maxX = maxLatLng.lng >= 180 ? pixelBounds.max.x : Math.min(maxPoint.x, pixelBounds.max.x);
            maxX = Math.floor((maxX + shiftX) / 256);
        } else {
            minY = Math.floor((maxPoint.y + shiftY) / 256);
            maxY = Math.floor((minPoint.y + shiftY) / 256);
            minX = Math.floor((minPoint.x + shiftX) / 256);
            maxX = Math.floor((maxPoint.x + shiftX) / 256);
        }
        var gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var zKey = this._tileCoordsToKey({x: x, y: y}, zoom);
                gmxTiles[zKey] = true;
            }
        }
        return gmxTiles;
    },

    _updateProperties: function (prop) {
        var gmx = this._gmx,
            apikeyRequestHost = this.options.apikeyRequestHost || gmx.hostName;

        gmx.sessionKey = prop.sessionKey = this.options.sessionKey || gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received

        if (this.options.parentOptions) {
			prop = this.options.parentOptions;
		}

        gmx.identityField = prop.identityField; // ogc_fid
        gmx.GeometryType = (prop.GeometryType || '').toLowerCase();   // тип геометрий обьектов в слое
        gmx.minZoomRasters = prop.RCMinZoomForRasters || 1;// мин. zoom для растров
        gmx.minZoomQuicklooks = gmx.minZoomRasters; // по умолчанию minZoom для квиклуков и КР равны

        var type = prop.type || 'Vector';
        if (prop.Temporal) { type += 'Temporal'; }
        gmx.layerType = type;   // VectorTemporal Vector
        gmx.items = {};

        L.extend(gmx, L.gmxUtil.getTileAttributes(prop));
        if (gmx.dataManager) {
            gmx.dataManager.setOptions(prop);
        }
        if ('ZIndexField' in prop) {
            if (prop.ZIndexField in gmx.tileAttributeIndexes) {
                gmx.zIndexField = gmx.tileAttributeIndexes[prop.ZIndexField];   // sort field index
            }
        }
        if (this._objectsReorder) {
            this._objectsReorder.initialize();
        }

        // if ('clusters' in prop) {
            // gmx.clusters = prop.clusters;
        // }

        if ('MetaProperties' in gmx.rawProperties) {
            var meta = gmx.rawProperties.MetaProperties;
            if ('filter' in meta) {  // фильтр слоя
                gmx.filter = meta.filter.Value || '';
            }
            if ('dateBegin' in meta) {  // фильтр для мультивременного слоя
                gmx.dateBegin = L.gmxUtil.getDateFromStr(meta.dateBegin.Value || '01.01.1980');
            }
            if ('dateEnd' in meta) {  // фильтр для мультивременного слоя
                gmx.dateEnd = L.gmxUtil.getDateFromStr(meta.dateEnd.Value || '01.01.1980');
            }
            if ('shiftX' in meta || 'shiftY' in meta) {  // сдвиг всего слоя
                gmx.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                gmx.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            if ('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                if (meta.shiftXfield) { gmx.shiftXfield = meta.shiftXfield.Value; }
                if (meta.shiftYfield) { gmx.shiftYfield = meta.shiftYfield.Value; }
            }
            if ('quicklookPlatform' in meta) {    // тип спутника
                gmx.quicklookPlatform = meta.quicklookPlatform.Value;
                if (gmx.quicklookPlatform === 'image') { delete gmx.quicklookPlatform; }
            }
            if ('quicklookX1' in meta) { gmx.quicklookX1 = meta.quicklookX1.Value; }
            if ('quicklookY1' in meta) { gmx.quicklookY1 = meta.quicklookY1.Value; }
            if ('quicklookX2' in meta) { gmx.quicklookX2 = meta.quicklookX2.Value; }
            if ('quicklookY2' in meta) { gmx.quicklookY2 = meta.quicklookY2.Value; }
            if ('quicklookX3' in meta) { gmx.quicklookX3 = meta.quicklookX3.Value; }
            if ('quicklookY3' in meta) { gmx.quicklookY3 = meta.quicklookY3.Value; }
            if ('quicklookX4' in meta) { gmx.quicklookX4 = meta.quicklookX4.Value; }
            if ('quicklookY4' in meta) { gmx.quicklookY4 = meta.quicklookY4.Value; }

            if ('multiFilters' in meta) {    // проверка всех фильтров для обьектов слоя
                gmx.multiFilters = meta.multiFilters.Value === '1' ? true : false;
            }
            if ('isGeneralized' in meta) {    // Set generalization
                this.options.isGeneralized = meta.isGeneralized.Value !== 'false';
            }
            if ('isFlatten' in meta) {        // Set flatten geometry
                this.options.isFlatten = meta.isFlatten.Value !== 'false';
            }
        }
        if (prop.Temporal) {    // Clear generalization flag for Temporal layers
            this.options.isGeneralized = false;
        }

        if (prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            var layerLink = gmx.tileAttributeIndexes.GMX_RasterCatalogID;
            if (layerLink) {
                gmx.rasterBGfunc = function(x, y, z, item) {
                    var properties = item.properties;
                    return 'http://' + gmx.hostName
                        + '/TileSender.ashx?ModeKey=tile'
                        + '&x=' + x
                        + '&y=' + y
                        + '&z=' + z
                        + '&LayerName=' + properties[layerLink]
                        + '&key=' + encodeURIComponent(gmx.sessionKey);
                };
            }
        }
        if (prop.Quicklook) {
            var quicklookParams;

            //раньше это была просто строка с шаблоном квиклука, а теперь стало JSON'ом
            if (prop.Quicklook[0] === '{') {
                quicklookParams = JSON.parse(prop.Quicklook);
            } else {
                quicklookParams = {
                    minZoom: gmx.minZoomRasters,
                    template: prop.Quicklook
                };
            }

            if ('X1' in quicklookParams) { gmx.quicklookX1 = quicklookParams.X1; }
            if ('Y1' in quicklookParams) { gmx.quicklookY1 = quicklookParams.Y1; }
            if ('X2' in quicklookParams) { gmx.quicklookX2 = quicklookParams.X2; }
            if ('Y2' in quicklookParams) { gmx.quicklookY2 = quicklookParams.Y2; }
            if ('X3' in quicklookParams) { gmx.quicklookX3 = quicklookParams.X3; }
            if ('Y3' in quicklookParams) { gmx.quicklookY3 = quicklookParams.Y3; }
            if ('X4' in quicklookParams) { gmx.quicklookX4 = quicklookParams.X4; }
            if ('Y4' in quicklookParams) { gmx.quicklookY4 = quicklookParams.Y4; }

            var template = gmx.Quicklook = quicklookParams.template;
            if ('minZoom' in quicklookParams) { gmx.minZoomQuicklooks = quicklookParams.minZoom; }
            gmx.quicklookBGfunc = function(item) {
                var url = template,
                    reg = /\[([^\]]+)\]/,
                    matches = reg.exec(url);
                while (matches && matches.length > 1) {
                    url = url.replace(matches[0], item.properties[gmx.tileAttributeIndexes[matches[1]]]);
                    matches = reg.exec(url);
                }
                return url;
            };
            gmx.imageQuicklookProcessingHook = L.gmx.gmxImageTransform;
        }
        this.options.attribution = prop.Copyright || '';
    },

    _onVersionChange: function () {
        this._updateProperties(this._gmx.rawProperties);
    },

    getPropItem: function (key, propArr) {
        return gmxAPIutils.getPropItem(key, propArr, this._gmx.tileAttributeIndexes);
    }
});
