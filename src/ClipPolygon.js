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
var isPointInClipPolygon = function (pcoords, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key],
            i, len, j, len1;
        for (i = 0, len = arr.length; i < len; i++) {
            var geometry = arr[i].geometry,
                type = geometry.type;
            if (type !== 'Polygon' && type !== 'MultiPolygon') { return true; }
            var coords = geometry.coordinates;
            if (type === 'Polygon') { coords = [coords]; }
            for (j = 0, len1 = coords.length; j < len1; j++) {
                if (gmxAPIutils.isPointInPolygonWithHoles(pcoords, coords[j])) {
                    return true;
                }
            }
        }
    }
    return false;
};
var isBoundsIntersectsClipPolygon = function (bounds, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            if (bounds.clipPolygon(arr[i].geometry.coordinates[0]).length) {
                return true;
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
            var id = L.stamp(polygon);
            this._clipPolygons[id] = item;
            var dataManager = this._gmx.dataManager,
                _this = this;
            dataManager.setTileFilteringHook(function (tile) {
                return isBoundsIntersects(tile.bounds, _this._clipPolygons);
            });

            dataManager.addFilter('clipFilter', function (item, tile, observer, geom, dataOption) {
                if (!isBoundsIntersects(item.bounds, _this._clipPolygons)) {
                    return false;
                }
                var type = geom.type,
                    coords = geom.coordinates;
                if (type === 'POINT' || type === 'MULTIPOINT') {
                    return isPointInClipPolygon(coords, _this._clipPolygons);
                } else if (type === 'POLYGON') {
                    return isBoundsIntersectsClipPolygon(dataOption.bounds, _this._clipPolygons);
                } else if (type === 'MULTIPOLYGON') {
                    for (i = 0, len = dataOption.boundsArr.length; i < len; i++) {
                        if (isBoundsIntersectsClipPolygon(dataOption.boundsArr[i][0], _this._clipPolygons)) {
                            return true;
                        }
                    }
                    return false;
                }
                return true;
            });
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
