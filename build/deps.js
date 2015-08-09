var depsJS = [
    "Parsers.js",
    "Deferred.js",
    "ImageLoader.js",
    "ProjectiveImage.js",
    "StyleManager.js",
    "ScreenVectorTile.js",
    "VectorTile.js",
    "TilesTree.js",
    "DataManager.js",
    "Observer.js",
    "LabelsLayer.js",
    "Utils.js",
    "DrawCanvas.js", 
    "ImageTransform.js",
    "SessionManager.js",
    "MapManager.js",
    "EventsManager.js",
    "VectorTileLoader.js",
    "VectorLayer.js",
    "VectorLayer.Popup.js",
    "VectorLayer.Hover.js",
    "RasterLayer.js",
    "LayerFactory.js",
    "LayersVersion.js",
    "ObjectsReorder.js",
    "Locale.js",
    "lang_ru.js",
    "lang_en.js",
    "MarkerCluster.js",
    "ClipPolygon.js"
];

if (typeof exports !== 'undefined') {
	exports.depsJS = depsJS;
}

if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(depsJS);
} else if (typeof gmxAPI !== 'undefined' && typeof gmxAPI.gmxLayerDevLoader === 'function') {
	gmxAPI.gmxLayerDevLoader(depsJS);
}