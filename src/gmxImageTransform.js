// трансформация снимка
var gmxImageTransform = function(hash) {
    var item = hash.item,
        gmx = hash.gmx,
        gmxTilePoint = hash.gmxTilePoint,
        mInPixel = gmx.mInPixel,
        begx = mInPixel * item.bounds.min.x,
        begy = mInPixel * item.bounds.max.y,
        geoItem = hash.geoItem,
        coord = geoItem[geoItem.length-1].coordinates,
        properties = item.properties,
        quicklookPlatform = properties[gmx.quicklookPlatform] || '',
        img = hash.image;
//Алгоритм натяжения:
//- вычислить 4 угла (текущий алгоритм)
//- посчитать длины сторон
//- если соотношение самой длинной и самой короткой больше, чем 2, тогда северный отрезок из двух коротких - это верхний край квиклука
//- если соотношение меньше, чем 2, то самая северная вершина - это левый верхний угол изображения
    if (gmx.pointsFields) {
        var keys = gmx.pointsFields;
        coord = [];
        for (var i=0, prev=null, len=keys.length; i<len; i++) {
            var key = keys[i];
            var type = (key.indexOf('y') === -1 ? 'x' : 'y');
            var zn = item.properties[key];
            if(type === 'y') coord.push([prev, zn]);
            prev = zn;
        }
        //coord = [[points.x1, points.y1], [points.x1, points.y1], [points.x1, points.y1], [points.x4, points.y4]];
        var sat_name = item.properties.sat_name;
        if ((sat_name == "WV01") || (sat_name == "WV02") || (sat_name == "QB02")) {
            var MinX = Math.min(coord[0][0], coord[1][0], coord[2][0], coord[3][0]);
            var MaxX = Math.max(coord[0][0], coord[1][0], coord[2][0], coord[3][0]);
            var MinY = Math.min(coord[0][1], coord[1][1], coord[2][1], coord[3][1]);
            var MaxY = Math.max(coord[0][1], coord[1][1], coord[2][1], coord[3][1]);
            
            var sw = Math.max((MaxX - MinX), (MaxY - MinY))/2;
            var cx = (MaxX + MinX)/2;
            var cy = (MaxY + MinY)/2;
            
            var merc = L.Projection.Mercator.project(new L.LatLng(cy + sw, cx - sw));
            coord[0][0] = coord[3][0] = merc.x, coord[0][1] = coord[1][1] = merc.y;
            merc = L.Projection.Mercator.project(new L.LatLng(cy - sw, cx + sw));
            coord[1][0] = coord[2][0] = merc.x, coord[2][1] = coord[3][1] = merc.y;
            begx = mInPixel * coord[0][0];
            begy = mInPixel * coord[0][1];
       }
        else if ((sat_name == "GE-1") || (sat_name == "IK-2") || (sat_name == "EROS-A1") || sat_name == "LANDSAT_8"){
            var merc = L.Projection.Mercator.project(new L.LatLng(Math.min(coord[0][1], coord[1][1], coord[2][1], coord[3][1]), Math.min(coord[0][0], coord[1][0], coord[2][0], coord[3][0])));
            coord[0][0] = coord[3][0] = merc.x, coord[2][1] = coord[3][1] = merc.y;
            merc = L.Projection.Mercator.project(new L.LatLng(Math.max(coord[0][1], coord[1][1], coord[2][1], coord[3][1]), Math.max(coord[0][0], coord[1][0], coord[2][0], coord[3][0])));
            coord[1][0] = coord[2][0] = merc.x, coord[0][1] = coord[1][1] = merc.y;
        }
    }
    
    var points = {};
    if (quicklookPlatform === 'LANDSAT8') {
        points.x1 = item.bounds.min.x, points.y1 = item.bounds.max.y;
        points.x2 = item.bounds.max.x, points.y2 = item.bounds.max.y;
        points.x3 = item.bounds.max.x, points.y3 = item.bounds.min.y;
        points.x4 = item.bounds.min.x, points.y4 = item.bounds.min.y;
    } else {
        points = gmxAPIutils.getQuicklookPoints(coord);
    }
    var dx = begx - 256 * gmxTilePoint.x,
        dy = 256 - begy + 256 * gmxTilePoint.y,
        x1 = mInPixel * points.x1, y1 = mInPixel * points.y1,
        x2 = mInPixel * points.x2, y2 = mInPixel * points.y2,
        x3 = mInPixel * points.x3, y3 = mInPixel * points.y3,
        x4 = mInPixel * points.x4, y4 = mInPixel * points.y4,
        boundsP = gmxAPIutils.bounds([[x1, y1], [x2, y2], [x3, y3], [x4, y4]]),
        ww = Math.round(boundsP.max.x - boundsP.min.x),
        hh = Math.round(boundsP.max.y - boundsP.min.y);

    x1 -= boundsP.min.x; y1 = boundsP.max.y - y1;
    x2 -= boundsP.min.x; y2 = boundsP.max.y - y2;
    x3 -= boundsP.min.x; y3 = boundsP.max.y - y3;
    x4 -= boundsP.min.x; y4 = boundsP.max.y - y4;
    var chPoints = function(arr) {
        var out = [], dist = [],
            px = arr[3][0], py = arr[3][1],
            maxYnum = 0,
            maxY = -Number.MAX_VALUE;
        for (var i=0, len=arr.length; i<len; i++) {
            var px1 = arr[i][0], py1 = arr[i][1];
            if(px1 > maxY) maxYnum = i;
            var sx = px1 - px, sy = py1 - py;
            dist.push({'d2': Math.sqrt(sx * sx + sy * sy), 'i': i});
            px = px1, py = py1;
        }
        dist = dist.sort(function(a, b) {
            return a.d2 - b.d2;
        });
        var min = Math.min(dist[0], dist[1], dist[2], dist[3]);
        var mn = dist[3].d2 / dist[0].d2;
        out = arr;
        if(mn > 2) {
            var inum = dist[1]['i'];
            if(arr[dist[0]['i']][1] > arr[dist[1]['i']][1]) {
                out = [arr[0], arr[1], arr[2], arr[3]];
            } else {
                out = [];
                out.push(arr[maxYnum++]);
                if(maxYnum > 3) maxYnum = 0;
                out.push(arr[maxYnum++]);
                if(maxYnum > 3) maxYnum = 0;
                out.push(arr[maxYnum++]);
                if(maxYnum > 3) maxYnum = 0;
                out.push(arr[maxYnum]);
            }
        }
        return out;
    }
    var shiftPoints = [[x1, y1], [x2, y2], [x3, y3], [x4, y4]];
    if(!gmx.pointsFields) shiftPoints = chPoints(shiftPoints);
    
    var pt = gmx.ProjectiveImage.getCanvas({
        imageObj: img
        ,points: shiftPoints
        ,wView: ww
        ,hView: hh
        ,deltaX: dx
        ,deltaY: dy
        //,patchSize: 64
        //,limit: 4
    });
    return pt.canvas;
};
