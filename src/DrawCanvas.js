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
        if ('setLineDash' in ctx) {
            ctx.setLineDash(dashes);
            if (ctx.lineDashOffset !== dashOffset) {
                ctx.lineDashOffset = dashOffset;
            }
        }
    }
    if (ctx.lineCap !== 'round') { ctx.lineCap = 'round'; }
    if (ctx.lineJoin !== 'round') { ctx.lineJoin = 'round'; }

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
        };
    if (geoType === 'POINT') {
        dattr.pointAttr = utils.getPixelPoint(dattr, geom.coordinates);
        if (!dattr.pointAttr) { return false; }   // point not in canvas tile
    }
    if (geoType === 'POINT' || geoType === 'MULTIPOINT') {	// Отрисовка геометрии точек
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
            dattr.flagPixels = false;
            if (!dataOption.pixels) { dataOption.pixels = {}; }
            coords = geom.coordinates;
            var hiddenLines = dataOption.hiddenLines || [],
                pixelsMap = {},
                flagPixels = false;

            if (geoType === 'POLYGON') { coords = [coords]; }
            var coordsToCanvas = function(func, flagFill) {
                var out = null;
                if (flagPixels) {
                    coords = pixelsMap.coords;
                    hiddenLines = pixelsMap.hidden;
                    dattr.flagPixels = flagPixels;
                } else {
                    out = {coords: [], hidden: []};
                    var pixels = [], hidden = [];
                }
                for (j = 0, len = coords.length; j < len; j++) {
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
                    if (flagFill) { ctx.fill(); }
                    if (out) {
                        pixels.push(pixels1);
                        hidden.push(hidden1);
                    }
                }
                if (out) {
                    out.coords = pixels;
                    out.hidden = hidden;
                }
                return out;
            };
            var strokeStyle = item.currentStyle.strokeStyle || style.strokeStyle,
                lineWidth = item.currentStyle.lineWidth || style.lineWidth;
            if (strokeStyle && lineWidth) {
                var pixels = coordsToCanvas(utils.polygonToCanvas);
                if (pixels) {
                    pixelsMap = pixels;
                    pixelsMap.z = gmx.currentZoom;
                    dataOption.pixels = pixelsMap;
                    flagPixels = true;
                }
            }
            if (options.bgImage) {
                dattr.bgImage = options.bgImage;
            } else if (rasters[idr]) {
                dattr.bgImage = rasters[idr];
            }
            if (dattr.styleExtend.skipRasters || item.skipRasters) {
                delete dattr.bgImage;
            }
            if (flagPixels) {
                coords = pixelsMap.coords;
                hiddenLines = pixelsMap.hidden;
            }
            if (style.imagePattern) {
                item.currentStyle.fillStyle = ctx.createPattern(style.imagePattern, 'repeat');
            } else if (dattr.bgImage && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                if (utils.isPatternNode(dattr.bgImage)) {
                    if ('rasterOpacity' in gmx) { ctx.globalAlpha = gmx.rasterOpacity; }
                    ctx.fillStyle = ctx.createPattern(dattr.bgImage, 'no-repeat');
                    style.bgImage = true;
                }
                coordsToCanvas(utils.polygonToCanvasFill, true);
                ctx.globalAlpha = 1;
            }
            if (item.currentStyle.fillStyle || item.currentStyle.canvasPattern) {
                ctx.fillStyle = item.currentStyle.canvasPattern || item.currentStyle.fillStyle;
                coordsToCanvas(utils.polygonToCanvasFill, true);
            }
        }
    } else if (geoType === 'LINESTRING' || geoType === 'MULTILINESTRING') {
        coords = geom.coordinates;
        if (geoType === 'MULTILINESTRING') {
            for (j = 0, len = coords.length; j < len; j++) {
                dattr.coords = coords[j];
                utils.lineToCanvas(dattr);
            }
        } else {
            dattr.coords = coords;
            utils.lineToCanvas(dattr);
        }
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
