/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */
(function() {

var MAX = 1000000;

L.gmx.VectorLayer.include({
    _objectsReorder: {
        all: {},
        sortFunc: null,
        count: 0,
        addToReorder: function (id, bottomFlag) {
            ++this.count;
            this.all[id] = bottomFlag ? -this.count : this.count;
        },
        clickFunc: function (ev) {
            var reorder = this._objectsReorder;
            if (!reorder.disabled) {
                var id = ev.gmx.id;
                reorder.addToReorder(id, ev.originalEvent.ctrlKey);
                this.redrawItem(id);
            }
        },
        resetSortFunc: function (layer) {
            var zIndexField = layer._gmx.zIndexField;
            layer.setSortFunc(
                zIndexField ?
                function(a, b) {
                    var res = Number(a.properties[zIndexField]) - Number(b.properties[zIndexField]);
                    return res ? res : a.id - b.id;
                }
                :
                function(a, b) {
                    return a.id - b.id;
                }
            );
        },
        onAdd: function (layer) {
            var gmx = layer._gmx;
            if (!gmx.sortItems && (gmx.GeometryType === 'polygon' || gmx.GeometryType === 'linestring')) {
                layer._objectsReorder.resetSortFunc(layer);
            }
            layer.on('click', this.clickFunc, layer);
        },
        onRemove: function (layer) {
            layer.off('click', this.clickFunc, layer);
        },
        disabled: false
    },

    getReorderArrays: function () {
        var reorder = this._objectsReorder,
            bottom = [],
            top = [],
            arr = Object.keys(reorder.all).sort(function(a, b) {
                return reorder.all[a] - reorder.all[b];
            });

        for (var i = 0, len = arr.length; i < len; i++) {
            var id = arr[i];
            if (reorder.all[id] > 0) {
                top.push(id);
            } else {
                bottom.push(id);
            }
        }
        return {top: top, bottom: bottom};
    },

    bringToTopItem: function (id) {
        this._objectsReorder.addToReorder(id);
        this.redrawItem(id);
    },

    bringToBottomItem: function (id) {
        this._objectsReorder.addToReorder(id, true);
        this.redrawItem(id);
    },

    clearReorderArrays: function () {
        var reorder = this._objectsReorder;
        reorder.all = {};
        reorder.count = 0;
        this.repaint();
    },

    setReorderArrays: function (top, bottom) {
        var reorder = this._objectsReorder;
        reorder.all = {};
        reorder.count = 0;
        bottom.forEach(function (id) { reorder.addToReorder(id, true); });
        top.map(function (id) { reorder.addToReorder(id); });
        this.repaint();
    },

    getSortedItems: function (arr) {
        var reorder = this._objectsReorder;
        return arr.sort(reorder.count > 0 ? this._gmx.sortItems : reorder.sortFunc);
    },

    resetSortFunc: function () {
        this._objectsReorder.resetSortFunc(this);
    },

    setSortFunc: function (func) {
        var reorder = this._objectsReorder;
        reorder.sortFunc = func;
        this._gmx.sortItems = function(a, b) {
            if (reorder.count > 0) {
                var ap = reorder.all[a.id],
                    bp = reorder.all[b.id];

                if (ap || bp) {
                    ap = ap ? ap + (ap > 0 ? MAX : -MAX) : 0;
                    bp = bp ? bp + (bp > 0 ? MAX : -MAX) : 0;
                    return ap - bp;
                }
            }
            return reorder.sortFunc ? reorder.sortFunc(a, b) : 0;
        };
        this.repaint();
    },
    disableFlip: function() { this._objectsReorder.disabled = true; },
    enableFlip: function() { this._objectsReorder.disabled = false; }
});
})();
