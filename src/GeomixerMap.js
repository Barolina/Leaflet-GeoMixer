//Helper class, that represents layers of single Geomixer's map
//Creates layers from given map description
var gmxMap = function(mapInfo, commonLayerOptions) {
    this.layers = [];
    this.layersByTitle = {};
    this.layersByID = {};

    var _this = this;

    this.properties = L.extend({}, mapInfo.properties);
    this.properties.BaseLayers = this.properties.BaseLayers ? JSON.parse(this.properties.BaseLayers) : [];
    this.rawTree = mapInfo;

    gmxMapManager.iterateLayers(mapInfo, function(layerInfo) {
        var props = layerInfo.properties,
            layerOptions = L.extend({
                mapID: mapInfo.properties.name,
                layerID: props.name
            }, commonLayerOptions);

        layerInfo.properties.hostName = mapInfo.properties.hostName;

        _this.addLayer(L.gmx.createLayer(layerInfo, layerOptions));
    });
};

gmxMap.prototype.addLayer = function(layer) {
    var props = layer.getGmxProperties();

    this.layers.push(layer);
    this.layersByTitle[props.title] = layer;
    this.layersByID[props.name] = layer;

    return this;
};

gmxMap.prototype.removeLayer = function(layer) {
    var props = layer.getGmxProperties();

    for (var i = 0; i < this.layers.length; i++) {
        if (this.layers[i].getGmxProperties().name === props.name) {
            this.layers.splice(i, 1);
            break;
        }
    }

    delete this.layersByTitle[props.title];
    delete this.layersByID[props.name];

    return this;
};

gmxMap.prototype.addLayersToMap = function(leafletMap) {
    for (var l = this.layers.length - 1; l >= 0; l--) {
        var layer = this.layers[l];
        if (layer.getGmxProperties().visible) {
            leafletMap.addLayer(layer);
        }
    }

    return this;
};