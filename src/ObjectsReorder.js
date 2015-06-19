/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */
!function() {

var MAX = 1000000;

var ObjectsReorder = function (layer) {
    this.all = {};
    this.layer = layer;
    this.gmx = layer._gmx;
    this.sortFunc = null;
    layer.on('click', this.clickFunc, this);
    this.count = 0;
    this.disabled = false;
};

ObjectsReorder.prototype = {
    clickFunc: function (ev) {
        if (this.disabled) {
            return;
        }
        var id = ev.gmx.id;
        this.addToReorder(id, ev.originalEvent.ctrlKey);
        this.layer.redrawItem(id);
    },

    addToReorder: function (id, bottomFlag) {
        ++this.count;
        this.all[id] = bottomFlag ? -this.count : this.count;
    },

    getReorderArrays: function () {
        var bottom = [],
            top = [],
            arr = Object.keys(this.all).sort(function(a, b) {
                return this.all[a] - this.all[b];
            });

        for (var i = 0, len = arr.length; i < len; i++) {
            var id = arr[i];
            if (this.all[id] > 0) {
                top.push(id);
            } else {
                bottom.push(id);
            }
        }
        return {top: top, bottom: bottom};
    },

    setReorderArrays: function (top, bottom) {
        this.all = {};
        this.count = 0;
        bottom.forEach(function (id) { this.addToReorder(id, true); });
        top.map(function (id) { this.addToReorder(id); });
        this.layer.repaint();
    },

    getSortedItems: function (arr) {
        return arr.sort(this.count > 0 ? this.gmx.sortItems : this.sortFunc);
    },

    setSortFunc: function (func) {
        this.sortFunc = func;
        var _this = this;
        this.gmx.sortItems = function(a, b) {
            if (_this.count > 0) {
                var ap = _this.all[a.id],
                    bp = _this.all[b.id];

                if (ap || bp) {
                    ap = ap ? ap + (ap > 0 ? MAX : -MAX) : 0;
                    bp = bp ? bp + (bp > 0 ? MAX : -MAX) : 0;
                    return ap - bp;
                }
            }
            return _this.sortFunc ? _this.sortFunc(a, b) : 0;
        };
        this.layer.repaint();
    },

    disableFlip: function() { this.disabled = true; },
    enableFlip: function() { this.disabled = false; }
};

L.gmx.VectorLayer.addInitHook(function () {
    if (!this._gmx.objectsReorder) {
        var reorder = new ObjectsReorder(this);
        this._gmx.objectsReorder = reorder;
        L.extend(this, {
            bringToTopItem: function (id) {
                reorder.addToReorder(id);
                this.redrawItem(id);
            },

            bringToBottomItem: function (id) {
                reorder.addToReorder(id, true);
                this.redrawItem(id);
            },

            getReorderArrays: reorder.getReorderArrays.bind(reorder),
            setReorderArrays: reorder.setReorderArrays.bind(reorder),
            setSortFunc: reorder.setSortFunc.bind(reorder),
            disableFlip: reorder.disableFlip.bind(reorder),
            enableFlip: reorder.enableFlip.bind(reorder)
        });
    }
});

 }();
