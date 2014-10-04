/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */

 L.gmx.VectorLayer.addInitHook(function () {
    var objectsReorder = function (layer) {
        var count = 0, max = 1000000,
            all = {},
            gmx = layer._gmx,
            sortFunc = gmx.sortItems,
            getTopItem = gmx.getTopItem;

        gmx.getTopItem = function(arr) {
            var top = null, bottom = null, center = null,
                topIndex = -max, bottomIndex = -max;
            for (var i = 0, len = arr.length; i < len; i++) {
                var it = arr[i], id = it.id, ind = all[id];
                if (ind) {
                    if (ind < 0) {  // on bottom
                        if (ind > bottomIndex) {
                            bottom = it;
                            bottomIndex = ind;
                        }
                    } else if (ind > topIndex) {  // on top
                        topIndex = ind;
                        top = it;
                    }
                } else if (!center) {  // first on center
                    center = it;
                }
            }
            return top || center || bottom;
        };
        gmx.sortItems = function(a, b) {
            var ap = all[a.arr[0]],
                bp = all[b.arr[0]];

            if (ap || bp) {
                ap = ap ? ap + (ap > 0 ? max : -max) : 0;
                bp = bp ? bp + (bp > 0 ? max : -max) : 0;
                return ap - bp;
            }
            return sortFunc(a, b);
        };

        var addToReorder = function (id, botoomFlag) {
            count++;
            all[id] = botoomFlag ? -count : count;
        };

        var clickFunc = function (ev) {
            var id = ev.gmx.id;
            addToReorder(ev.gmx.id, ev.originalEvent.ctrlKey);
            layer.redrawItem(id);
        };
        layer.on('click', clickFunc, this);
        L.extend(layer, {
            bringToTopItem: function (id) {
                addToReorder(id);
                layer.redrawItem(id);
            },

            bringToBottomItem: function (id) {
                addToReorder(id, true);
                layer.redrawItem(id);
            },

            getReorderArrays: function () {
                var bottom = [],
                    top = [],
                    arr = Object.keys(all).sort(function(a, b){
                        return all[a] - all[b];
                    });
                    
                for (var i = 0, len = arr.length; i < len; i++) {
                    var id = arr[i];
                    if (all[id] > 0) top.push(id);
                    else bottom.push(id);
                }
                return { top: top, bottom: bottom };
            },

            setReorderArrays: function (top, bottom) {
                all = {};
                count = 0;
                bottom.map(function (id) { addToReorder(id, true); });
                top.map(function (id) { addToReorder(id); });
                layer.redrawAll();
            }
        });
        return {
            destructor: function () {
                layer.off('click', clickFunc, this);
                gmx.sortItems = sortFunc;
                gmx.getTopItem = getTopItem;

                delete layer.setReorderArrays;
                delete layer.bringToTopItem;
                delete layer.bringToBottomItem;
            }
        };
    };
    this.on('add', function () {
        if (this._gmx.sortItems && !this._gmx.objectsReorder) {
            this._gmx.objectsReorder = new objectsReorder(this);
        }
    });
    this.on('remove', function () {
        if (this._gmx.objectsReorder) {
            this._gmx.objectsReorder.destructor();
            delete this._gmx.objectsReorder;
        }
    });
});
