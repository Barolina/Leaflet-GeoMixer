//tree for fast tiles selection inside temporal interval
var TilesTree = function(periods, dateZero) {
    var _rootNodes = [];
    this.initFromTiles = function(tiles) {
        var addTile = function (node, tile, key) {
            var d = node.d;
            if (tile.d === periods[d]) {
                node.count++;
                node.tiles.push(key);
                node.tileBounds.push(tile.bounds);
                return;
            }

            var childrenCount = periods[d] / periods[d - 1];

            if (!('children' in node)) {
                node.children = new Array(childrenCount);
            }

            var sChild = Math.floor(tile.s * tile.d / periods[d - 1]);
            var ds = sChild - node.s * childrenCount;

            if (!node.children[ds]) {
                node.children[ds] = {
                    d: d - 1,
                    s: sChild,
                    t1: sChild * periods[d - 1] * gmxAPIutils.oneDay + dateZero,
                    t2: (sChild + 1) * periods[d - 1] * gmxAPIutils.oneDay + dateZero,
                    count: 0,
                    tiles: [],
                    tileBounds: []
                };
            }

            addTile(node.children[ds], tile, key);
        };

        var smin = Number.MAX_VALUE,
            dmax = periods.length - 1,
            key,
            t;

        for (key in tiles) {
            t = tiles[key].tile;
            if (t.d === periods[dmax]) {
                smin = Math.min(smin, t.s);
            }
        }

        _rootNodes = [];

        for (key in tiles) {
            t = tiles[key].tile;

            if (t.d < 0) {
                continue;
            }

            var ds = Math.floor(t.s * t.d / periods[dmax]) - smin,
                cs = ds + smin;

            _rootNodes[ds] = _rootNodes[ds] || {
                d: dmax,
                s: cs,
                t1: cs * periods[dmax] * gmxAPIutils.oneDay + dateZero,
                t2: (cs + 1) * periods[dmax] * gmxAPIutils.oneDay + dateZero,
                count: 0,
                tiles: [],
                tileBounds: []
            };

            addTile(_rootNodes[ds], t, key);
        }
    };

    //options: bounds (in mercator projection)
    this.selectTiles = function(t1, t2, options) {
        
        options = options || {};
        //options.minLevel = isNaN(options.minLevel) ? 0   : options.minLevel;
        //options.maxLevel = isNaN(options.maxLevel) ? 1e5 : options.maxLevel;
        
        var t1Val = t1.valueOf() / 1000,
            t2Val = t2.valueOf() / 1000;
        
        // We will restrict tile levels by the nearest two levels to target date interval length
        // For example, if date interval length is 3 days, we wll search tiles among 1-day and 4-day tiles
        var minLevel = 0,
            dateIntervalLength = (t2Val - t1Val)/3600/24;
            
        for (var i = 0; i < periods.length; i++) {
            if (periods[i] > dateIntervalLength) {
                minLevel = Math.max(0, i-1);
                break;
            }
        }
        
        
        if (periods[periods.length-1] <= dateIntervalLength) {
            minLevel = periods.length-1;
        }
        
        var maxLevel = Math.min(periods.length-1, minLevel + Number(dateIntervalLength > periods[minLevel]));
        
        // console.log(minLevel, maxLevel);
            
        var getCountOfIntersected = function(tileBounds, bounds) {
            var count = 0;
            for (var t = 0; t < tileBounds.length; t++) {
                if (tileBounds[t].intersects(bounds)) {
                    count++;
                }
            }
            
            return count;
        }

        // --------------------
        var selectTilesForNode = function(node, t1, t2) {
            if (t1 >= node.t2 || t2 <= node.t1) {
                // console.log(node, 'out');
                return {count: 0, tiles: [], nodes: []};
            }

            if (node.d === minLevel) {
                var count = options.bounds ? getCountOfIntersected(node.tileBounds, options.bounds) : node.count;
                
                // console.log(node, 'minLevel', count);
                
                return {
                    tiles: node.tiles,
                    count: count,
                    nodes: [node]
                };
            }

            var childrenCount = 0, //number of tiles if we use shorter intervals
                childrenRes = [],
                ds;
                
            // console.log(node, 'traversing children');
            for (ds = 0; ds < node.children.length; ds++) {
                if (node.children[ds]) {
                    childrenRes[ds] = selectTilesForNode(node.children[ds], Math.max(t1, node.t1), Math.min(t2, node.t2));
                } else {
                    childrenRes[ds] = {count: 0, tiles: [], nodes: []};
                }
                childrenCount += childrenRes[ds].count;
            }
            
            var intersectCount = options.bounds ? getCountOfIntersected(node.tileBounds, options.bounds) : node.count;
            
            // console.log(node, childrenCount, intersectCount);
            
            if (node.d > maxLevel || childrenCount < intersectCount) {
                var resTilesArr = [],
                    resNodesArr = [];
                for (ds = 0; ds < childrenRes.length; ds++) {
                    resNodesArr.push(childrenRes[ds].nodes);
                    resTilesArr.push(childrenRes[ds].tiles);
                }

                return {
                    tiles: [].concat.apply([], resTilesArr),
                    count: childrenCount,
                    nodes: [].concat.apply([], resNodesArr)
                };
            } else {
                return {
                    tiles: node.tiles,
                    count: intersectCount,
                    nodes: [node]
                };
            }
        };

        var resTiles = [];
        var resNodes = [];
        for (var ds = 0; ds < _rootNodes.length; ds++) {
            if (_rootNodes[ds]) {
                var nodeSelection = selectTilesForNode(_rootNodes[ds], t1Val, t2Val);
                resTiles = resTiles.concat(nodeSelection.tiles);
                resNodes = resNodes.concat(nodeSelection.nodes);
            }
        }

        var resTilesHash = {};
        for (var t = 0; t < resTiles.length; t++) {
            resTilesHash[resTiles[t]] = true;
        }

        return {tiles: resTilesHash, nodes: resNodes};
    };

    this.getNode = function(d, s) {
        if (d < 0 || s < 0) {
            return null;
        }

        var findNode = function(node, d, s) {
            if (!node) { return null; }

            if (periods[node.d] === d) {
                return node.s === s ? node : null;
            }

            var childrenCount = periods[node.d] / periods[node.d - 1];
            var sChild = Math.floor(s * d / periods[node.d - 1]);
            var ds = sChild - node.s * childrenCount;

            return node.children[ds] ? findNode(node.children[ds], d, s) : null;
        };

        for (var ds = 0; ds < _rootNodes.length; ds++) {
            var node = findNode(_rootNodes[ds], d, s);
            if (node) {
                return node;
            }
        }

        return null;
    };
};
