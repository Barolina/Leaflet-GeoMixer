(function() {
var isBoundsIntersects = function (bounds, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var type = arr[i].geometry.type;
            for (var j = 0, len1 = arr[i].boundsArr.length; j < len1; j++) {
                var bbox = arr[i].boundsArr[j];
                if (type === 'MultiPolygon') { bbox = bbox[0]; }
                if (bbox.intersects(bounds)) {
                    return true;
                }
            }
        }
    }
    return false;
};
var isObserverIntersects = function (observer, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var boundsArr = arr[i].boundsArr;
            for (var j = 0, len1 = boundsArr.length; j < len1; j++) {
                var bbox = arr[i].boundsArr[j];
                if (observer.intersects(bbox)) {
                    return true;
                }
            }
        }
    }
    return false;
};

var getClipPolygonItem = function (geo) {
    var geometry = gmxAPIutils.convertGeometry(geo),
        bboxArr = gmxAPIutils.geoItemBounds(geometry);
    bboxArr.geometry = geometry;
    return bboxArr;
};

var clipTileByPolygon = function (dattr) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    var ctx = canvas.getContext('2d'),
        clipPolygons = dattr.clipPolygons;

    dattr.ctx = ctx;
    ctx.fillStyle = ctx.createPattern(dattr.tile, 'no-repeat');

    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var geo = arr[i].geometry,
                coords = geo.coordinates;
            if (geo.type === 'Polygon') { coords = [coords]; }
            for (var i1 = 0, len1 = coords.length; i1 < len1; i1++) {
                var coords1 = coords[i1];
                ctx.beginPath();
                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                    dattr.coords = coords1[j1];
                    gmxAPIutils.polygonToCanvasFill(dattr);
                }
                ctx.closePath();
                ctx.fill();
            }
        }
    }
    ctx = dattr.tile.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(canvas, 0, 0);
};

L.gmx.VectorLayer.include({
    _clipPolygons: {},
    addClipPolygon: function (polygon) { // (L.Polygon) or (L.GeoJSON with Polygons)
        var item = [],
            i, len;

        if ('coordinates' in polygon && 'type' in polygon) {
            item.push(getClipPolygonItem(polygon));
        } else if (polygon instanceof L.Polygon) {
            item.push(getClipPolygonItem(polygon.toGeoJSON().geometry));
        } else if (polygon instanceof L.GeoJSON) {
            var layers = polygon.getLayers();
            for (i = 0, len = layers.length; i < len; i++) {
                var layer = layers[i];
                if (layer instanceof L.Polygon && layer.feature) {
                    item.push(getClipPolygonItem(layer.feature.geometry));
                } else if (layer instanceof L.MultiPolygon && layer.feature) {
                    item.push(getClipPolygonItem(layer.feature.geometry));
                }
            }
        }
        if (item.length) {
            var gmx = this._gmx,
                dataManager = gmx.dataManager,
                _this = this,
                id = L.stamp(polygon);

            this._clipPolygons[id] = item;
            dataManager.setTileFilteringHook(function (tile) {
                return isBoundsIntersects(tile.bounds, _this._clipPolygons);
            });

            dataManager.addFilter('clipFilter', function (item, tile, observer) {
                return isObserverIntersects(observer, _this._clipPolygons);
            });
            if (Object.keys(this._clipPolygons).length === 1) {
                gmx.renderHooks.unshift(function (tile, hookInfo) {
                    if (tile && Object.keys(_this._clipPolygons).length > 0) {
                        clipTileByPolygon({
                            tile: tile,
                            tpx: hookInfo.tpx,
                            tpy: hookInfo.tpy,
                            gmx: {mInPixel: gmx.mInPixel},
                            clipPolygons: _this._clipPolygons
                        });
                    }
                });
            }
        }
        return this;
    },

    removeClipPolygon: function (polygon) {
        var id = L.stamp(polygon);
        delete this._clipPolygons[id];
        if (Object.keys(this._clipPolygons).length === 0) {
            this._gmx.dataManager.removeTileFilteringHook();
            this._gmx.dataManager.removeFilter('clipFilter');
        }
        return this;
    }
});
})();
