var deps = [
    "Parsers.js", 
    "Deferred.js",
    "ImageLoader.js",
    "ProjectiveImage.js",
    "StyleManager.js",
    "ScreenVectorTile.js",
    "VectorTile.js",
    "VectorTilesManager.js",
    "gmxAPIutils.js",
    "SessionManager.js",
    "MapManager.js",
    "gmxVectorLayer.js",
    "gmxRasterLayer.js",
    "gmxLayerFactory.js"
];

if (typeof exports !== 'undefined') {
	exports.deps = deps;
}

if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(deps);
}