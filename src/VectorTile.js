//Single vector tile, received from GeoMixer server
//"dataProvider" has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with data of loaded tile
var gmxVectorTile = function(dataProvider, x, y, z, v, s, d) {
    var loadDef = null,
        isCalcHiddenPoints = false,
        _this = this;

    this.load = function() {
        if (!loadDef) {
            loadDef = new gmxDeferred();
            this.state = 'loading';
            dataProvider.load(x, y, z, v, s, d, function(data) {
            
                //clone data to avoid conflicts between multiple maps
                //TODO: fixme!
                // _this.data = new Array(data.length);
                // for (var i = 0; i < data.length; i++) {
                    // _this.data[i] = data[i].slice();
                // }
                
                _this.data = data;
                _this.dataOptions = new Array(data.length);
                
                _this.state = 'loaded';
                loadDef.resolve(_this.data);
            })
        }

        return loadDef;
    }

    this.clear = function() {
        this.state = 'notLoaded';
        this.data = this.dataOptions = null;
        
        isCalcHiddenPoints = false;
        loadDef = null;
    }

    this.isIntersects = function(gmxTilePoint) {
        return gmxAPIutils.isTileKeysIntersects(this.gmxTilePoint, gmxTilePoint);
    }

    this.calcHiddenPoints = function() {
        if (!this.data || isCalcHiddenPoints) {
            return;
        }

        isCalcHiddenPoints = true;

        var bounds = this.bounds,
            d = (bounds.max.x - bounds.min.x)/10000,
            tbDelta = { // границы тайла для определения onEdge отрезков
                minX: bounds.min.x + d
                ,maxX: bounds.max.x - d
                ,minY: bounds.min.y + d
                ,maxY: bounds.max.y - d
            };
        var chkOnEdge = function(p1, p2, ext) { // отрезок на границе
            if ((p1[0] < ext.minX && p2[0] < ext.minX) || (p1[0] > ext.maxX && p2[0] > ext.maxX)) return true;
            if ((p1[1] < ext.minY && p2[1] < ext.minY) || (p1[1] > ext.maxY && p2[1] > ext.maxY)) return true;
            return false;
        }
        var getHidden = function(coords, tb) {  // массив точек на границах тайлов
            var hideLines = [],
                prev = null;
            for (var i = 0, len = coords.length; i < len; i++) {
                var p = coords[i];
                if(prev && chkOnEdge(p, prev, tb)) {
                    hideLines.push(i);
                }
                prev = p;
            }
            return hideLines;
        }
        
        var geomIndex = this.data[0] && (this.data[0].length - 1); //geometry is always the last attribute
        for (var i = 0, len = this.data.length; i < len; i++) {
            var geom = this.data[i][geomIndex],
                id = this.data[i][0];
            if(geom.type.indexOf('POLYGON') !== -1) {
                var hideLines = null, // индексы точек лежащих на границе тайла
                    coords = geom.coordinates;
                if(geom.type === 'POLYGON') {
                    coords = [coords];
                }
                for (var j = 0, len1 = coords.length; j < len1; j++) {
                    var coords1 = coords[j],
                        hideLines1 = [];
                    for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                        hideLines1.push(getHidden(coords1[j1], tbDelta));
                    }
                    if (hideLines1.length) {
                        if (!hideLines) hideLines = [];
                        hideLines.push(hideLines1);
                    }
                }
                if (hideLines) {
                    if (!this.dataOptions[i]) this.dataOptions[i] = {};
                    this.dataOptions[i].hiddenLines = hideLines;
                }
            }
        }
    }

    this.bounds = gmxAPIutils.getTileBounds(x, y, z);
    this.data = null;
    this.dataOptions = null;
    this.x = x;
    this.y = y;
    this.z = z;
    this.s = s;
    this.d = d;
    this.gmxTilePoint = {x: x, y: y, z: z, s: s, d: d};
    this.gmxTileKey = z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
    this.state = 'notLoaded'; //notLoaded, loading, loaded
}