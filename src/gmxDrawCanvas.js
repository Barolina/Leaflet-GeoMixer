var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth'],
    styleCanvasKeysLen = styleCanvasKeys.length,
    utils = gmxAPIutils;

var setCanvasStyle = function(item, ctx, style) {
    for (var i = 0; i < styleCanvasKeysLen; i++) {
        var key = styleCanvasKeys[i],
            valKey = style[key];
        if (valKey !== ctx[key]) {
            ctx[key] = valKey;
        }
    }
    if (style.dashArray) {
        var dashes = style.dashArray,
            dashOffset = style.dashOffset || 0;
        if ('setLineDash' in ctx) {     //Chrome
            ctx.setLineDash(dashes);
            //ctx.lineDashOffset(dashOffset);
        } else {                        //Firefox
            ctx.mozDash = dashes;
            ctx.mozDashOffset = dashOffset;
        }
        if (ctx.lineCap !== 'round') { ctx.lineCap = 'round'; }
        if (ctx.lineJoin !== 'round') { ctx.lineJoin = 'round'; }
    }

    if (style.canvasPattern) {
        ctx.fillStyle = ctx.createPattern(style.canvasPattern.canvas, 'repeat');
    } else if (style.fillLinearGradient) {
        var prop = item.properties,
            rgr = style.fillLinearGradient,
            x1 = rgr.x1Function ? rgr.x1Function(prop) : rgr.x1,
            y1 = rgr.y1Function ? rgr.y1Function(prop) : rgr.y1,
            x2 = rgr.x2Function ? rgr.x2Function(prop) : rgr.x2,
            y2 = rgr.y2Function ? rgr.y2Function(prop) : rgr.y2,
            lineargrad = ctx.createLinearGradient(x1, y1, x2, y2);
        for (var j = 0, len = rgr.addColorStop.length; j < len; j++) {
            var arr1 = rgr.addColorStop[j],
                arrFunc = rgr.addColorStopFunctions[j],
                p0 = (arrFunc[0] ? arrFunc[0](prop) : arr1[0]),
                p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr1[2])),
                p1 = utils.dec2color(arrFunc[1] ? arrFunc[1](prop) : arr1[1], p2 > 1 ? p2 / 100 : p2);
            lineargrad.addColorStop(p0, p1);
        }
        ctx.fillStyle = style.fillStyle = lineargrad;
    }
};

var drawGeoItem = function(geoItem, options, currentStyle, style) {
    var propsArr = geoItem.properties,
        idr = propsArr[0],
        j = 0,
        len = 0,
        gmx = options.gmx,
        ctx = options.ctx,
        matrix = options.matrix,
        item = gmx.dataManager.getItem(idr),
        geom = propsArr[propsArr.length - 1],
        coords = null,
        dataOption = geoItem.dataOption,
        rasters = options.rasters,
        tbounds = options.tbounds;

    style = style || {};
    item.currentStyle = L.extend({}, currentStyle);
    if (gmx.styleHook && !geoItem.styleExtend) {
        geoItem.styleExtend = gmx.styleManager.applyStyleHook(item, gmx.lastHover && idr === gmx.lastHover.id);
    }
    if (geoItem.styleExtend) {
        item.currentStyle = L.extend(item.currentStyle, geoItem.styleExtend);
    }
    setCanvasStyle(item, ctx, item.currentStyle);

    var geoType = geom.type,
        dattr = {
            gmx: gmx,
            item: item,
            style: style,
            styleExtend: geoItem.styleExtend || {},
            ctx: ctx,
            tpx: options.tpx,
            tpy: options.tpy
        },
        path;

    if (geoType === 'POINT' || geoType === 'MULTIPOINT') { // Отрисовка геометрии точек
        coords = geom.coordinates;
        if ('iconColor' in style && style.image) {
            if (style.lastImage !== style.image) {
                style.lastImage = style.image;
                style.lastImageData = utils.getImageData(style.image);
            }
            dattr.imageData = style.lastImageData;
        }

        if (geoType === 'MULTIPOINT') {
            for (j = 0, len = coords.length; j < len; j++) {
                dattr.coords = coords[j];
                utils.pointToCanvas(dattr);
            }
        } else {
            dattr.pointAttr = utils.getPixelPoint(dattr, coords);
            if (!dattr.pointAttr) { return false; }   // point not in canvas tile
            dattr.coords = coords;
            utils.pointToCanvas(dattr);
        }
    } else if (geoType === 'POLYGON' || geoType === 'MULTIPOLYGON') {
        if (style.image) { // set MULTIPOLYGON as marker
            dattr.coords = [(dataOption.bounds.min.x + dataOption.bounds.max.x) / 2, (dataOption.bounds.min.y + dataOption.bounds.max.y) / 2];
            dattr.pointAttr = utils.getPixelPoint(dattr, dattr.coords);
            if (dattr.pointAttr) {
                utils.pointToCanvas(dattr);
            }
        } else {
            var strokeStyle = item.currentStyle.strokeStyle || style.strokeStyle,
                lineWidth = item.currentStyle.lineWidth || style.lineWidth;
            if (strokeStyle && lineWidth) {
                path = new Path2D();
                path.addPath(dataOption.path, matrix);
                ctx.stroke(path);
            }
            if (rasters[idr]) {
                dattr.bgImage = rasters[idr];
            }
            if (dattr.styleExtend.skipRasters || item.skipRasters) {
                delete dattr.bgImage;
            }
            if (style.imagePattern) {
                item.currentStyle.fillStyle = ctx.createPattern(style.imagePattern, 'repeat');
            } else if (dattr.bgImage && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                if (utils.isPatternNode(dattr.bgImage)) {
                    if ('rasterOpacity' in gmx) { ctx.globalAlpha = gmx.rasterOpacity; }
                    ctx.fillStyle = ctx.createPattern(dattr.bgImage, 'no-repeat');
                    style.bgImage = true;
                }
                path = new Path2D();
                path.addPath(dataOption.pathFill, matrix);
                ctx.fill(path);
                ctx.globalAlpha = 1;
            }
            if (item.currentStyle.fillStyle || item.currentStyle.canvasPattern) {
                ctx.fillStyle = item.currentStyle.canvasPattern || item.currentStyle.fillStyle;
                path = new Path2D();
                path.addPath(dataOption.pathFill, matrix);
                ctx.fill(path);
            }
        }
    } else if (geoType === 'LINESTRING' || geoType === 'MULTILINESTRING') {
        path = new Path2D();
        path.addPath(dataOption.path, matrix);
        ctx.stroke(path);
    }
    return true;
};

L.gmxUtil.drawGeoItem = function(geoItem, options) {
/*
geoItem
     properties: объект (в формате векторного тайла)
     dataOption: дополнительные свойства объекта
options
     ctx: canvas context
     tbounds: tile bounds
     tpx: X смещение тайла
     tpy: Y смещение тайла
     gmx: ссылка на layer._gmx
        gmx.dataManager
        gmx.styleManager
        gmx.currentZoom
     style: стиль в новом формате
         style.image - для type='image' (`<HTMLCanvasElement || HTMLImageElement>`)
*/
    var gmx = options.gmx,
        item = gmx.dataManager.getItem(geoItem.id);

    if (item) {
        var style = gmx.styleManager.getObjStyle(item),
            hover = gmx.lastHover && gmx.lastHover.id === geoItem.id && style;
        if (gmx.multiFilters) {
            item.multiFilters.forEach(function(it) {
                drawGeoItem(geoItem, options, hover ? it.parsedStyleHover : it.parsedStyle, style);
            });
        } else {
            drawGeoItem(geoItem, options, hover ? item.parsedStyleHover : item.parsedStyleKeys, style);
        }
        return true;
    }
    return false;
};
