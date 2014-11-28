var gmx = require('./dist/leaflet-geomixer-src.js');

gmx.mapManager.getMap('maps.kosmosnimki.ru', null, 'A47AD').then(function(mapInfo) {
    console.log(mapInfo);
})