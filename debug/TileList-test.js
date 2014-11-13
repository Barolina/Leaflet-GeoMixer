"use strict";
var TileListManager = function () {
    this._layers = {};
    this._url = 'http://maps.kosmosnimki.ru/VectorLayer/TileList.ashx';
};

TileListManager.prototype = {
    addLayer: function(id, props) {
        this._layers[id] = props;
        this._layers[id].needUpdate = true;
        if (props.dateBegin || props.dateEnd) {
            this.setDateInterval(props.dateBegin, props.dateEnd, [id]);
        }
        return this;
    },

    setDateInterval: function(dateBegin, dateEnd, ids) {    // dateBegin<Date>, dateEnd<Date>, ids<Array>
        var _this = this;
        ids.map(function(id) {
            if (!_this._layers[id]) {
                _this.addLayer(id, {
                    dateBegin: dateBegin,
                    dateEnd: dateEnd
                });
            }
            var item = _this._layers[id];
            item.dateBegin = dateBegin;
            item.dateEnd = dateEnd;
            item.needUpdate = true;
        });
        return this;
    },

    getTileList: function(ids) {
        var out = {};
        ids.map(function(id) {
            var item = this._layers[id];
            out[id] = {
                TemporalTiles: item.TemporalTiles,
                TemporalVers: item.TemporalVers,
                tiles: item.tiles,
                tilesVers: item.tilesVers
            };
        });
        return out;
    },

    update: function(func) {
        var def = new gmxDeferred(),
            _this = this,
            arr = [];
        for (var id in this._layers) {
            var item = this._layers[id];
            if (item.needUpdate) {
                var pt = {
                    Name: id,
                    skipTiles: false
                };
                if (item.dateBegin) {
                    pt.dateBegin = Math.floor(item.dateBegin.valueOf()/1000);
                }
                if (item.dateEnd) {
                    pt.dateEnd = Math.floor(item.dateEnd.valueOf()/1000);
                }
                if (item.levels) {
                    pt.levels = item.levels;
                }
                arr.push(pt);
            }
        }
        gmxAPIutils.requestJSONP(this._url, {layers: JSON.stringify(arr)}).then(function(arg) {
                var res = arg.Result,
                    out = {};
                if (arg.Status !== 'ok' || !res) {
                    def.reject();
                } else {
                    res.map(function(it) {
                        var id = it.Name;
                        if (_this._layers[id]) {
                            var pt = {
                                TemporalTiles: it.TemporalTiles,
                                TemporalVers: it.TemporalVers,
                                tiles: it.tiles,
                                tilesVers: it.tilesVers,
                                needUpdate: false
                            };
                            out[id] = pt;
                            L.extend(_this._layers[id], pt);
                        }
                    });
                    def.resolve(out);
                }
            }, function() {
                def.reject();
            }
        );            
        return def;
    }
    
};
