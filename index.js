var gmx = require('./dist/node-geomixer-src.js');

var getAttrIndexes = function(props) {
    var tileAttributeIndexes = {};
    if (props.attributes) {
        var attrs = props.attributes;
        if (props.identityField) tileAttributeIndexes[props.identityField] = 0;
        for (var a = 0; a < attrs.length; a++) {
            tileAttributeIndexes[attrs[a]] = a + 1;
        }
    }
    return tileAttributeIndexes;
}

var getZeroUT = function(props) {
    var ZeroDateString = props.ZeroDate || '01.01.2008';
    var arr = ZeroDateString.split('.');
    var zn = new Date(
        (arr.length > 2 ? arr[2] : 2008),
        (arr.length > 1 ? arr[1] - 1 : 0),
        (arr.length > 0 ? arr[0] : 1)
        );
    var ZeroDate = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);
    return ZeroDate.getTime() / 1000;
}

gmx.mapManager.getMap('maps.kosmosnimki.ru', null, 'IZNGU').then(function(mapInfo) {
    //console.log(mapInfo);
    var layerInfo = gmx.mapManager.findLayerInfo('maps.kosmosnimki.ru', 'IZNGU', '2E34F88EE5664E21918F08196B046A04');
    var sk = gmx.sessionManager.getSessionKey('maps.kosmosnimki.ru');
    var options = {
        properties: layerInfo.properties,
        tileSenderPrefix: "http://" + 'maps.kosmosnimki.ru' + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk),
        layerID: '2E34F88EE5664E21918F08196B046A04',
        tileAttributeIndexes: getAttrIndexes(mapInfo.properties),
        TemporalPeriods: mapInfo.properties.TemporalPeriods,
        getZeroUT: getZeroUT(mapInfo.properties)
    }
    
    var dataManager = new gmx.DataManager(options);
    dataManager.addObserver({
        type: 'resend',
        callback: function(data) {
            console.log('data received', data);
        }
    });
})