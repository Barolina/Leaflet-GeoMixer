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
    "gmxImageTransform.js",
    "SessionManager.js",
    "MapManager.js",
    "gmxEventsManager.js",
    "VectorTileLoader.js",
    "gmxVectorLayer.js",
    "gmxRasterLayer.js",
    "gmxLayerFactory.js",
    "translations.js",
    "lang_ru.js",
    "lang_en.js"
];

if (typeof exports !== 'undefined') {
	exports.deps = deps;
}

if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(deps);
}