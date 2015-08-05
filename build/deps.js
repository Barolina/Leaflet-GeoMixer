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
    "gmxObserver.js",
    "LabelsLayer.js",
    "gmxAPIutils.js",
    "gmxDrawCanvas.js", 
    "gmxImageTransform.js",
    "SessionManager.js",
    "MapManager.js",
    "gmxEventsManager.js",
    "VectorTileLoader.js",
    "gmxVectorLayer.js",
    "gmxVectorLayer.Popup.js",
    "gmxVectorLayer.Hover.js",
    "gmxRasterLayer.js",
    "gmxLayerFactory.js",
    "gmxLayersVersion.js",
    "ObjectsReorder.js",
    "L.gmxLocale.js",
    "lang_ru.js",
    "lang_en.js",
    "gmxMarkerCluster.js"
];

if (typeof exports !== 'undefined') {
	exports.depsJS = depsJS;
}

if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(depsJS);
} else if (typeof gmxAPI !== 'undefined' && typeof gmxAPI.gmxLayerDevLoader === 'function') {
	gmxAPI.gmxLayerDevLoader(depsJS);
}