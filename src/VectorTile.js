//Single vector tile, received from GeoMixer server
//"dataProvider" has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with the following parameters:
//  - {Object[]} data - information about vector objects in tile
//  - {Number[4]} [bbox] - optional bbox of objects in tile
var VectorTile = function(dataProvider, x, y, z, v, s, d, zeroDate) {
    this.dataProvider = dataProvider;
    this.loadDef = new L.gmx.Deferred();
    this.bounds = gmxAPIutils.getTileBounds(x, y, z);
    this.data = null;
    this.dataOptions = null;
    this.x = x;
    this.y = y;
    this.z = z;
    this.s = s;
    this.v = v;
    this.d = d;
    this.gmxTilePoint = {x: x, y: y, z: z, s: s, d: d};
    this.vectorTileKey = VectorTile.makeTileKey(x, y, z, v, s, d);

    if (this.s >= 0 && zeroDate) {
        this.beginDate = new Date(zeroDate.valueOf() + this.s * this.d * gmxAPIutils.oneDay * 1000);
        this.endDate = new Date(zeroDate.valueOf() + (this.s + 1) * this.d * gmxAPIutils.oneDay * 1000);
    }

    this.state = 'notLoaded'; //notLoaded, loading, loaded
};

VectorTile.prototype = {
    addData: function(data, keys) {

        if (keys) {
            this.removeData(keys, true);
        }

        var len = data.length,
            dataOptions = new Array(len),
            dataBounds = gmxAPIutils.bounds();
        for (var i = 0; i < len; i++) {
            var it = data[i],
                itBounds = gmxAPIutils.geoItemBounds(it[it.length - 1]);
            dataOptions[i] = itBounds;
            dataBounds.extendBounds(itBounds.bounds);
        }

        if (!this.data) {
            this.data = data;
            this.dataOptions = dataOptions;
        } else {
            this.data = this.data.concat(data);
            this.dataOptions = this.dataOptions.concat(dataOptions);
        }

        this.state = 'loaded';

        this.loadDef.resolve(this.data);
        return dataBounds;
    },

    removeData: function(keys) {
        for (var arr = this.data || [], i = arr.length - 1; i >= 0; i--) {
            if (keys[arr[i][0]]) {
                arr.splice(i, 1);
                if (this.dataOptions) { this.dataOptions.splice(i, 1); }
            }
        }
    },

    load: function() {
        if (this.state === 'notLoaded') {
            this.state = 'loading';
            var _this = this;
            this.dataProvider.load(_this.x, _this.y, _this.z, _this.v, _this.s, _this.d, function(data, bbox) {
                _this.bbox = bbox;
                _this.addData(data);
            });
        }

        return this.loadDef;
    },

    clear: function() {
        this.state = 'notLoaded';
        this.data = null;
        this.dataOptions = null;

        this.loadDef = new L.gmx.Deferred();
    },

    calcEdgeLines: function(num) {
        if (!this.data || !this.data[num]) { return null; }
        if (!this.dataOptions[num]) { this.dataOptions[num] = {}; }
        var hiddenLines = this.dataOptions[num].hiddenLines || null;
        if (!hiddenLines) {
            var it = this.data[num],
                geomIndex = it.length - 1, //geometry is always the last attribute
                geom = it[geomIndex];

            if (geom.type.indexOf('POLYGON') !== -1) {
                var coords = geom.coordinates;
                if (geom.type === 'POLYGON') {
                    coords = [coords];
                }
                var edgeBounds = gmxAPIutils.bounds().extendBounds(this.bounds).addBuffer(-0.05);
                    //.addBuffer((this.bounds.min.x - this.bounds.max.x) / 10000);
                for (var j = 0, len = coords.length; j < len; j++) {
                    var coords1 = coords[j],
                        hiddenLines1 = [];
                    for (var j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                        hiddenLines1.push(gmxAPIutils.getHidden(coords1[j1], edgeBounds));
                    }
                    if (hiddenLines1.length) {
                        if (!hiddenLines) { hiddenLines = []; }
                        hiddenLines.push(hiddenLines1);
                    }
                }
                if (hiddenLines) {
                    if (!this.dataOptions[num]) { this.dataOptions[num] = {}; }
                    this.dataOptions[num].hiddenLines = hiddenLines;
                }
            }
        }
    }
};
//class methods

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
