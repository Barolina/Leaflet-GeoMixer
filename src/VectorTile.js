//Single vector tile, received from GeoMixer server
//"dataProvider" has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with data of loaded tile
var VectorTile = function(dataProvider, x, y, z, v, s, d) {
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
        if (loadDef) {
            loadDef.resolve(this.data);
        }
    };

    this.removeData = function(keys) {
        for (var arr = this.data || [], i = arr.length - 1; i >= 0; i--) {
            if (keys[arr[i][0]]) {
                arr.splice(i, 1);
                this.dataOptions.splice(i, 1);
            }
        }
    };

    this.load = function() {
        if (!loadDef) {
            loadDef = new L.gmx.Deferred();
            this.state = 'loading';
            dataProvider.load(x, y, z, v, s, d, function(data) {
                _this.addData(data);
            });
        }

        return loadDef;
    };

    this.clear = function() {
        this.state = 'notLoaded';
        this.data = [];
        this.dataOptions = [];

        loadDef = null;
    };

    this.calcEdgeLines = function(num) {
        if (!this.data[num]) { return null; }
        if (!this.dataOptions[num]) { this.dataOptions[num] = {}; }
        if (!this.dataOptions[num].path) {
            var it = this.data[num],
                geomIndex = it.length - 1, //geometry is always the last attribute
                geom = it[geomIndex],
                type = geom.type,
                path = new Path2D(),
                i, j1, p, len1, len2, coords1, coords2;

            if (type === 'LINESTRING' || type === 'MULTILINESTRING') {
                coords1 = geom.coordinates;
                if (type === 'LINESTRING') {
                    coords1 = [coords1];
                }
                for (j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                    coords2 = coords1[j1];
                    for (i = 0, len2 = coords2.length; i < len2; i++) {
                        p = coords2[i];
                        path[i === 0 ? 'moveTo' : 'lineTo'](p[0], -p[1]);
                    }
                }
            } else if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                var coords = geom.coordinates,
                    pathFill = new Path2D();
                if (type === 'POLYGON') {
                    coords = [coords];
                }
                var edgeBounds = gmxAPIutils.bounds().extendBounds(this.bounds).addBuffer(-0.05);
                for (var j = 0, len = coords.length; j < len; j++) {
                    coords1 = coords[j];
                    for (j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                        coords2 = coords1[j1];
                        var prev = null;
                        for (i = 0, len2 = coords2.length; i < len2; i++) {
                            p = coords2[i];
                            var lineHide = false;
                            if (prev && gmxAPIutils.chkOnEdge(p, prev, edgeBounds)) {
                                lineHide = true;
                            }
                            path[(lineHide || i === 0 ? 'moveTo' : 'lineTo')](p[0], -p[1]);
                            pathFill[(i === 0 ? 'moveTo' : 'lineTo')](p[0], -p[1]);
                            prev = p;
                        }
                    }
                }
                this.dataOptions[num].pathFill = pathFill;
            }
            this.dataOptions[num].path = path;
        }
    };

    this.bounds = gmxAPIutils.getTileBounds(x, y, z);
    this.data = [];
    this.dataOptions = [];
    this.x = x;
    this.y = y;
    this.z = z;
    this.s = s;
    this.d = d;
    this.gmxTilePoint = {x: x, y: y, z: z, s: s, d: d};
    this.vectorTileKey = z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
    this.state = 'notLoaded'; //notLoaded, loading, loaded
};

VectorTile.makeTileKey = function(x, y, z, v, s, d) {
    return z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
};

VectorTile.parseTileKey = function(gmxTileKey) {
    var p = gmxTileKey.split('_');
    return {z: p[0], x: p[1], y: p[2], v: p[3], s: p[4], d: p[5]};
};

VectorTile.boundsFromTileKey = function(gmxTileKey) {
    var p = VectorTile.parseTileKey(gmxTileKey);
    return gmxAPIutils.getTileBounds(p.x, p.y, p.z);
};

