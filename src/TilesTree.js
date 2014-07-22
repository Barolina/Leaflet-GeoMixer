//tree for fast tiles selection inside temporal interval
var gmxTilesTree = function(periods, dateZero) {
    var _rootNodes = [];
    this.initFromTiles = function(tiles) {
        var addTile = function (node, tile, key) {
            var d = node.d;
            if (tile.d === periods[d]) {
                node.count++;
                node.tiles[key] = true;
                return;
            }

            var childrenCount = periods[d] / periods[d-1];

            if (!('children' in node)) {
                node.children = new Array(childrenCount);
            }

            var sChild = Math.floor(tile.s * tile.d / periods[d-1]);
            var ds = sChild - node.s*childrenCount;

            if (!node.children[ds]) {
                node.children[ds] = {
                    d: d-1,
                    s: sChild,
                    t1: sChild * periods[d-1] * gmxAPIutils.oneDay + dateZero,
                    t2: (sChild + 1) * periods[d-1] * gmxAPIutils.oneDay + dateZero,
                    count: 0,
                    tiles: {}
                }
            }

            addTile(node.children[ds], tile, key);
        }

        var smin = Number.MAX_VALUE,
            dmax = periods.length - 1;

        for (var key in tiles) {
            var t = tiles[key].tile;
            if (t.d === periods[dmax]) {
                smin = Math.min(smin, t.s);
            }
        }

        _rootNodes = [];

        for (var key in tiles) {
            var t = tiles[key].tile,
                ds = Math.floor(t.s * t.d / periods[dmax]) - smin,
                cs = ds + smin;
                
            _rootNodes[ds] = _rootNodes[ds] || {
                d: dmax,
                s: cs,
                t1: cs * periods[dmax] * gmxAPIutils.oneDay + dateZero,
                t2: (cs + 1) * periods[dmax] * gmxAPIutils.oneDay + dateZero,
                count: 0,
                tiles: {}
            }

            addTile(_rootNodes[ds], t, key);
        }
    }

    this.selectTiles = function(t1, t2) {
        var t1Val = t1.valueOf() / 1000,
            t2Val = t2.valueOf() / 1000;

        // --------------------
        var selectTilesForNode = function(node, t1, t2) {
            if (t1 >= node.t2 || t2 <= node.t1) {
                return {count: 0, tiles: {}, nodes: []};
            }

            if (node.d === 0) {
                return {
                    tiles: node.tiles,
                    count: node.count,
                    nodes: [node]
                }
            }

            var childrenCount = 0; //number of tiles if we use shorter intervals
            var childrenRes = [];
            for (var ds = 0; ds < node.children.length; ds++) {
                if (node.children[ds]) {
                    childrenRes[ds] = selectTilesForNode(node.children[ds], Math.max(t1, node.t1), Math.min(t2, node.t2));
                } else {
                    childrenRes[ds] = {count: 0, tiles: {}, nodes: []};
                }
                childrenCount += childrenRes[ds].count;
            }

            if (childrenCount < node.count) {
                var resTiles = {},
                    resNodesArr = [];
                for (var ds = 0; ds < childrenRes.length; ds++) {
                    for (var key in childrenRes[ds].tiles) {
                        resTiles[key] = childrenRes[ds].tiles[key];
                        resNodesArr.push(resNodesArr);
                    }
                }

                return {
                    tiles: resTiles,
                    count: childrenCount,
                    nodes: [].concat.apply([], resNodesArr)
                }
            } else {
                return {
                    tiles: node.tiles,
                    count: node.count,
                    nodes: [node]
                } 
            }
        }

        var resTiles = {};
        var resNodes = [];
        for (var ds = 0; ds < _rootNodes.length; ds++) {
            if (_rootNodes[ds]) {
                var nodeSelection = selectTilesForNode(_rootNodes[ds], t1Val, t2Val),
                    selectedTiles = nodeSelection.tiles;
                for (var key in selectedTiles) {
                    resTiles[key] = selectedTiles[key];
                }
                
                resNodes = resNodes.concat(nodeSelection.nodes);
            }
        }

        return {tiles: resTiles, nodes: resNodes};
    };

    this.getNode = function(d, s) {
        if (d < 0 || s < 0) {
            return null;
        }

        var findNode = function(node, d, s) {
            if (!node) return null;

            if (periods[node.d] === d) {
                return node.s === s ? node : null;
            }

            var childrenCount = periods[node.d] / periods[node.d-1];
            var sChild = Math.floor(s * d / periods[node.d-1]);
            var ds = sChild - node.s*childrenCount;

            return node.children[ds] ? findNode(node.children[ds], d, s) : null;
        }

        for (var ds = 0; ds < _rootNodes.length; ds++) {
            var node = findNode(_rootNodes[ds], d, s);
            if (node) {
                return node;
            }
        }

        return null;
    }
}