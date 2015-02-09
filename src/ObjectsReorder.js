/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */

L.gmx.VectorLayer.addInitHook(function () {
    var ObjectsReorder = function (layer) {
        var count = 0, max = 1000000,
            all = {},
            gmx = layer._gmx,
            sortFunc = null;

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

        return {
            addToReorder: addToReorder,

            bringToBottomItem: function (id) {
                addToReorder(id, true);
            },

            getReorderArrays: function () {
                var bottom = [],
                    top = [],
                    arr = Object.keys(all).sort(function(a, b) {
                        return all[a] - all[b];
                    });

                for (var i = 0, len = arr.length; i < len; i++) {
                    var id = arr[i];
                    if (all[id] > 0) {
                        top.push(id); 
                    } else {
                        bottom.push(id);
                    }
                }
                return {top: top, bottom: bottom};
            },

            setReorderArrays: function (top, bottom) {
                all = {};
                count = 0;
                bottom.map(function (id) { addToReorder(id, true); });
                top.map(function (id) { addToReorder(id); });
            },

            setSortFunc: function (func) {
                sortFunc = func;
                gmx.sortItems = function(a, b) {
                    var ap = all[a.properties[0]],
                        bp = all[b.properties[0]];

                    if (ap || bp) {
                        ap = ap ? ap + (ap > 0 ? max : -max) : 0;
                        bp = bp ? bp + (bp > 0 ? max : -max) : 0;
                        return ap - bp;
                    }
                    return sortFunc ? sortFunc(a, b) : 0;
                };
            }
        };
    };
    if (!this._gmx.objectsReorder) {
        this._gmx.objectsReorder = new ObjectsReorder(this);
        L.extend(this, {
            bringToTopItem: function (id) {
                if (this._gmx.objectsReorder) { this._gmx.objectsReorder.addToReorder(id); }
                if (this._map) { this.redrawItem(id); }
            },

            bringToBottomItem: function (id) {
                if (this._gmx.objectsReorder) { this._gmx.objectsReorder.addToReorder(id, true); }
                if (this._map) { this.redrawItem(id); }
            },

            getReorderArrays: function () {
                return this._gmx.objectsReorder ? this._gmx.objectsReorder.getReorderArrays() : null;
            },

            setReorderArrays: function (top, bottom) {
                if (this._gmx.objectsReorder) { this._gmx.objectsReorder.setReorderArrays(top, bottom); }
                if (this._map) { this.repaint(); }
            },

            setSortFunc: function (func) {
                if (this._gmx.objectsReorder) { this._gmx.objectsReorder.setSortFunc(func); }
                if (this._map) { this.repaint(); }
            }
        });
    }
});
