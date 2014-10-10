//Single vector tile, received from GeoMixer server
//"dataProvider" has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with data of loaded tile
var gmxVectorTile = function(dataProvider, x, y, z, v, s, d) {
    var loadDef = null,
        _this = this;

    this.addData = function(data, keys) {
    
        this.removeData(keys, true);
        
        var len = data.length;
        var dataOptions = new Array(len);
        for (var i = 0; i < len; i++) {
            var it = data[i];
            dataOptions[i] = gmxAPIutils.geoItemBounds(it[it.length - 1]);
        }
        
        this.data = this.data.concat(data);
        this.dataOptions = this.dataOptions.concat(dataOptions);

        this.state = 'loaded';
        if (loadDef)
            loadDef.resolve(this.data);
    }

    this.removeData = function(keys, flag) {
        for (var arr = this.data || [], i = arr.length - 1; i >= 0; i--) {
            if (keys[arr[i][0]]) {
                arr.splice(i, 1);
                this.dataOptions.splice(i, 1);
            }
        }
    }

    this.load = function() {
        if (!loadDef) {
            loadDef = new gmxDeferred();
            this.state = 'loading';
            dataProvider.load(x, y, z, v, s, d, function(data) {
                _this.addData(data);
            })
        }

        return loadDef;
    }

    this.clear = function() {
        this.state = 'notLoaded';
        this.data = [];
        this.dataOptions = [];
        
        loadDef = null;
    }

    this.isIntersects = function(gmxTilePoint) {
        return gmxAPIutils.isTileKeysIntersects(this.gmxTilePoint, gmxTilePoint);
    }

    var chkOnEdge = function(p1, p2, ext) { // отрезок на границе
        if ((p1[0] < ext.min.x && p2[0] < ext.min.x) || (p1[0] > ext.max.x && p2[0] > ext.max.x)) return true;
        if ((p1[1] < ext.min.y && p2[1] < ext.min.y) || (p1[1] > ext.max.y && p2[1] > ext.max.y)) return true;
        return false;
    }
    var getHidden = function(coords, tb) {  // массив точек на границах тайлов
        var hiddenLines = [],
            prev = null;
        for (var i = 0, len = coords.length; i < len; i++) {
            var p = coords[i];
            if(prev && chkOnEdge(p, prev, tb)) {
                hiddenLines.push(i);
            }
            prev = p;
        }
        return hiddenLines;
    }
    this.calcEdgeLines = function(num) {
        if (!this.data[num]) return null;
        if (!this.dataOptions[num]) this.dataOptions[num] = {};
        var hiddenLines = this.dataOptions[num].hiddenLines || null;
        if (!hiddenLines) {
            var it = this.data[num],
                geomIndex = it.length - 1, //geometry is always the last attribute
                geom = it[geomIndex];

            if(geom.type.indexOf('POLYGON') !== -1) {
                var coords = geom.coordinates;
                if(geom.type === 'POLYGON') {
                    coords = [coords];
                }
                for (var j = 0, len = coords.length; j < len; j++) {
                    var coords1 = coords[j],
                        hiddenLines1 = [];
                    for (var j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                        hiddenLines1.push(getHidden(coords1[j1], this.edgeBounds));
                    }
                    if (hiddenLines1.length) {
                        if (!hiddenLines) hiddenLines = [];
                        hiddenLines.push(hiddenLines1);
                    }
                }
                if (hiddenLines) {
                    if (!this.dataOptions[num]) this.dataOptions[num] = {};
                    this.dataOptions[num].hiddenLines = hiddenLines;
                }
            }
        }
        return hiddenLines;
    }

    var bounds = gmxAPIutils.getTileBounds(x, y, z),
        edgeBounds = gmxAPIutils.bounds().extendBounds(bounds);
    this.bounds = bounds;
    this.edgeBounds = edgeBounds.addBuffer((bounds.min.x - bounds.max.x)/10000);
    this.data = [];
    this.dataOptions = [];
    this.x = x;
    this.y = y;
    this.z = z;
    this.s = s;
    this.d = d;
    this.gmxTilePoint = {x: x, y: y, z: z, s: s, d: d};
    this.gmxTileKey = gmxVectorTile.makeTileKey(x, y, z, v, s, d);
    this.state = 'notLoaded'; //notLoaded, loading, loaded
}

gmxVectorTile.makeTileKey = function(x, y, z, v, s, d) {
    return z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
}

gmxVectorTile.parseTileKey = function(gmxTileKey) {
    var p = gmxTileKey.split('_');
    return {z: p[0], x: p[1], y: p[2], v: p[3], s: p[4], d: p[5]};
}

gmxVectorTile.boundsFromTileKey = function(gmxTileKey) {
    var p = gmxVectorTile.parseTileKey(gmxTileKey);
    return gmxAPIutils.getTileBounds(p.x, p.y, p.z);
}