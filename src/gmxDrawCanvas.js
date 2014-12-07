var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth'],
    styleCanvasKeysLen = styleCanvasKeys.length;

var setCanvasStyle = function(item, ctx, style) {
    var currentStyle = item.currentStyle || item.parsedStyleKeys || {};

    for (var i = 0; i < styleCanvasKeysLen; i++) {
        var key = styleCanvasKeys[i],
            valKey = currentStyle[key] || style[key];
        if (valKey !== ctx[key]) {
            ctx[key] = valKey;
        }
    }
    if(style.dashArray) {
        var dashes = style.dashArray,
            dashOffset = style.dashOffset || 0;
        if ('setLineDash' in ctx) {     //Chrome
            ctx.setLineDash(dashes);
            //ctx.lineDashOffset(dashOffset);
        } else {                        //Firefox
            ctx.mozDash = dashes;
            ctx.mozDashOffset = dashOffset;
        }            
    }

    if(currentStyle.canvasPattern) {
        ctx.fillStyle = ctx.createPattern(currentStyle.canvasPattern.canvas, "repeat");
    } else if(style.fillLinearGradient) {
        var rgr = style.fillLinearGradient,
            x1 = rgr.x1Function ? rgr.x1Function(prop) : rgr.x1,
            y1 = rgr.y1Function ? rgr.y1Function(prop) : rgr.y1,
            x2 = rgr.x2Function ? rgr.x2Function(prop) : rgr.x2,
            y2 = rgr.y2Function ? rgr.y2Function(prop) : rgr.y2,
            lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
        for (var i = 0, len = rgr.addColorStop.length; i < len; i++) {
            var arr1 = rgr.addColorStop[i],
                arrFunc = rgr.addColorStopFunctions[i],
                p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]),
                p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2])),
                p1 = gmxAPIutils.dec2color(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2/100);
            lineargrad.addColorStop(p0, p1);
        }
        ctx.fillStyle = lastStyles.fillStyle = lineargrad; 
    }
}

L.gmxUtil.drawGeoItem = function(geoItem, options) {
// geoItem
//      properties: объект (в формате векторного тайла)
//      dataOption: дополнительные свойства объекта
// options
//      ctx: canvas context
//      tbounds: tile bounds
//      tpx: X смещение тайла
//      tpy: Y смещение тайла
//      gmx: ссылка на layer._gmx
//          gmx.dataManager
//          gmx.styleManager
//          gmx.currentZoom 
//      style: стиль в новом формате
//          style.image - для type='image' (`<HTMLCanvasElement || HTMLImageElement>`)
    var propsArr = geoItem.properties,
        idr = propsArr[0],
        geom = propsArr[propsArr.length-1],
        dataOption = geoItem.dataOption,
        ctx = options.ctx,
        gmx = options.gmx,
        rasters = options.rasters,
        tbounds = options.tbounds,
        item = gmx.dataManager.getItem(idr);

    if (!item) return;
    if (gmx.styleHook && !geoItem.styleExtend) {
        geoItem.styleExtend = gmx.styleHook(item, gmx.lastHover && idr === gmx.lastHover.id);
    }

    var geoType = geom.type,
        style = gmx.styleManager.getObjStyle(item), //call each time because of possible style can depends from item properties
        currentStyle = (gmx.lastHover && gmx.lastHover.id === idr ? item.parsedStyleHover : item.parsedStyleKeys);

    item.currentStyle = currentStyle;
    setCanvasStyle(item, ctx, style);

    var dattr = {
        gmx: gmx
        ,item: item
        ,style: style
        ,styleExtend: geoItem.styleExtend || {}
        ,ctx: ctx
        ,tpx: options.tpx
        ,tpy: options.tpy
    };
    if (geoType === 'POINT') {
        dattr.pointAttr = gmxAPIutils.getPixelPoint(dattr, geom.coordinates);
        if (!dattr.pointAttr) return false;   // point not in canvas tile
    }
    if (geoType === 'POINT' || geoType === 'MULTIPOINT') {	// Отрисовка геометрии точек
        var coords = geom.coordinates;
        if(geoType === 'MULTIPOINT') {
            for (var j = 0, len1 = coords.length; j < len1; j++) {
                dattr.coords = coords[j];
                gmxAPIutils.pointToCanvas(dattr);
            }
        } else {
            dattr.coords = coords;
            gmxAPIutils.pointToCanvas(dattr);
        }
    } else if (geoType === 'POLYGON' || geoType === 'MULTIPOLYGON') {
        if(style.image) { // set MULTIPOLYGON as marker
            dattr.coords = [(dataOption.bounds.min.x + dataOption.bounds.max.x)/2, (dataOption.bounds.min.y + dataOption.bounds.max.y)/2];
            gmxAPIutils.pointToCanvas(dattr);
        } else {
            dattr.flagPixels = false;
            if (!dataOption.pixels) dataOption.pixels = {};
            var hiddenLines = dataOption.hiddenLines || [],
                coords = geom.coordinates,
                pixels_map = {},
                flagPixels = false;

            if(geoType === 'POLYGON') coords = [coords];
            var coordsToCanvas = function(func, flagFill) {
                var out = null;
                if(flagPixels) {
                    coords = pixels_map.coords;
                    hiddenLines = pixels_map.hidden;
                    dattr.flagPixels = flagPixels;
                } else {
                    out = { coords: [], hidden: [] };
                    var pixels = [], hidden = [];
                }
                for (var j = 0, len1 = coords.length; j < len1; j++) {
                    var coords1 = coords[j];
                    var hiddenLines1 = hiddenLines[j] || [];
                    if (out) {
                        var pixels1 = [], hidden1 = [];
                    }
                    ctx.beginPath();
                    for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                        dattr.coords = coords1[j1];
                        dattr.hiddenLines = hiddenLines1[j1] || [];
                        var res = func(dattr);
                        if (out && res) {
                            pixels1.push(res.coords);
                            hidden1.push(res.hidden);
                        }
                    }
                    ctx.closePath();
                    if (flagFill) ctx.fill();
                    if (out) {
                        pixels.push(pixels1);
                        hidden.push(hidden1);
                    }
                }
                if(out) {
                    out.coords = pixels;
                    out.hidden = hidden;
                }
                return out;
            }
            var strokeStyle = currentStyle.strokeStyle || style.strokeStyle,
                lineWidth = currentStyle.lineWidth || style.lineWidth;
            if(strokeStyle && lineWidth) {
                var pixels = coordsToCanvas(gmxAPIutils.polygonToCanvas);
                if(pixels) {
                    pixels_map = pixels;
                    pixels_map.z = gmx.currentZoom;
                    dataOption.pixels = pixels_map;
                    flagPixels = true;
                }
            }
            if (rasters[idr]) {
                dattr.bgImage = rasters[idr];
            }
            if (dattr.styleExtend.skipRasters || item.skipRasters) {
                delete dattr.bgImage;
            }
            if ((currentStyle.fillStyle || dattr.bgImage) &&
                tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                if(flagPixels) {
                    coords = pixels_map.coords;
                    hiddenLines = pixels_map.hidden;
                }

                if(gmxAPIutils.isPatternNode(dattr.bgImage)) {
                    var pattern = ctx.createPattern(dattr.bgImage, "no-repeat");
                    ctx.fillStyle = pattern;
                    style.bgImage = true;
                }
                coordsToCanvas(gmxAPIutils.polygonToCanvasFill, true);
            }
        }
    } else if (geoType === 'LINESTRING' || geoType === 'MULTILINESTRING') {
        var coords = geom.coordinates;
        if(geoType === 'MULTILINESTRING') {
            for (var j = 0, len1 = coords.length; j < len1; j++) {
                dattr.coords = coords[j];
                gmxAPIutils.lineToCanvas(dattr);
            }
        } else {
            dattr.coords = coords;
            gmxAPIutils.lineToCanvas(dattr);
        }
    }
    return true;
}
