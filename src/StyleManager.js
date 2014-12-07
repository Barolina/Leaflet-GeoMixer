var gmxStyleManager = function(gmx) {
    var MAX_STYLE_SIZE = 256,
        DEFAULT_STYLE = { outline: { color: 255, thickness: 1, size: 4}},
        needLoadIcons = 0,
        styles = [],
        imagesSize = {},
        _this = this;

    this.deferred = new gmxDeferred()
    var initStyles = function() {
        var props = gmx.properties,
            balloonEnable = false,
            arr = props.styles || [{RenderStyle: DEFAULT_STYLE}],
            len = Math.max(arr.length, gmx.styles.length);

        for (var i = 0; i < len; i++) {
            var gmxStyle = gmx.styles[i] || arr[i];
            if (!gmxStyle.RenderStyle) gmxStyle.RenderStyle = DEFAULT_STYLE;
            
            if (gmxStyle.HoverStyle === undefined && gmxStyle.RenderStyle) {
                var hoveredStyle = JSON.parse(JSON.stringify(gmxStyle.RenderStyle));
                if (hoveredStyle.marker && hoveredStyle.marker.size) hoveredStyle.marker.size += 1;
                if (hoveredStyle.outline) hoveredStyle.outline.thickness += 1;
                //if (hoveredStyle.outline) hoveredStyle.outline.color = 0xff0000;
                gmxStyle.HoverStyle = hoveredStyle;
            } else if (gmxStyle.HoverStyle === null) {
                delete gmxStyle.HoverStyle;
            }

            var pt = parseItem(gmxStyle);
            if (!balloonEnable && pt.BalloonEnable) balloonEnable = true;
            styles.push(pt);
            if (gmxStyle.RenderStyle.label) gmx.labelsLayer = true;
        }
        gmx.balloonEnable = balloonEnable;
    }

    this.setStyle = function(st, num) {
        var style = parseItem(st);
        var i = Number(num) || 0;
        if(i > styles.length - 1) styles.push(style);
        else styles[i] = style;
        // TIDO: need redraw all visible tiles
    }

    var getType = function(st) {     // type for object
        var type = '';
        if (st.iconUrl) {
            type = 'image';
            getImageSize(st, true);
        } else {
            if (st.fillRadialGradient) type = 'circle';
            else if (st.iconGeomSize) type = 'square';
        }
        return type;
    }

    var parseRadialGradient = function(rg) {
        //	x1,y1,r1 — координаты центра и радиус первой окружности;
        //	x2,y2,r2 — координаты центра и радиус второй окружности.
        //	addColorStop - стоп цвета объекта градиента [[position, color]...]
        //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
        //		color — код цвета или формула.
        //		opacity — прозрачность
        //		canvasStyleColor — результрующий цвет в формате canvas
        var common = true;
        var arr = ['r1', 'x1', 'y1', 'r2', 'x2', 'y2'];
        for (var i = 0, len = arr.length; i < len; i++) {
            var it = arr[i];
            if (!rg[it]) rg[it] = 0;
            if(typeof(rg[it]) === 'string') {
                rg[it+'Function'] = gmxParsers.parseExpression(rg[it]);
                common = false;
            }
        }
        
        rg.addColorStop = rg.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
        rg.addColorStopFunctions = [];
        for (var i = 0, len = rg.addColorStop.length; i < len; i++) {
            var arr = rg.addColorStop[i],
                resFunc = [
                    (typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
                    ,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
                    ,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
                ];
            rg.addColorStopFunctions.push(resFunc);
            if (resFunc[1] === null && resFunc[2] === null) {
                arr.push(gmxAPIutils.dec2color(arr[1], arr[2]/100));
            } else {
                common = false;
            }
        }
        return common ? Math.max(rg.r1, rg.r2) : null;
    }

    var parseLinearGradient = function(lg) {
        var common = true;
        //	x1,y1 — координаты начальной точки
        //	x2,y2 — координаты конечной точки
        //	addColorStop - стоп цвета объекта градиента [[position, color]...]
        //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
        //		color — код цвета или формула.
        //		opacity — прозрачность
        var arr = ['x1', 'y1', 'x2', 'y2'];
        for (var i = 0, len = arr.length; i < len; i++) {
            var it = arr[i];
            if(typeof(lg[it]) === 'string') {
                lg[it+'Function'] = gmxParsers.parseExpression(lg[it]);
                common = false;
            }
        }
        
        lg.addColorStop = lg.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
        lg.addColorStopFunctions = [];
        for (var i = 0, len = lg.addColorStop.length; i < len; i++) {
            var arr = lg.addColorStop[i];
            lg.addColorStopFunctions.push([
                (typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
                ,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
                ,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
            ]);
        }
        return common;
    }

    var parsePattern = function(pattern) {
        var common = true;
        if('step' in pattern && typeof(pattern.step) === 'string') {
            pattern.patternStepFunction = gmxParsers.parseExpression(pattern.step);
            common = false;
        }
        if('width' in pattern && typeof(pattern.width) === 'string') {
            pattern.patternWidthFunction = gmxParsers.parseExpression(pattern.width);
            common = false;
        }
        if('colors' in pattern) {
            var arr = [];
            for (var i = 0, len = pattern.colors.length; i < len; i++) {
                var rt = pattern.colors[i];
                if(typeof(rt) === 'string') {
                    arr.push(gmxParsers.parseExpression(rt));
                    common = false;
                } else {
                    arr.push(null);
                }
            }
            pattern.patternColorsFunction = arr;
        }
        return common;
    }

    var parseStyle = function(st) {
        if (st) {
            var type = '';
            if (st.iconUrl) {
                type = 'image';
                getImageSize(st, true);
            } else {
                if (st.fillPattern) {
                    type = 'square';
                    if (parsePattern(st.fillPattern)) {
                        st.canvasPattern = gmxAPIutils.getPatternIcon(null, st);
                    }
                } else if (st.fillRadialGradient) {
                    type = 'circle';
                    var size = parseRadialGradient(st.fillRadialGradient);
                    if (size !== null) st.iconGeomSize = size;
                } else if (st.fillLinearGradient) {
                    type = 'square';
                    parseLinearGradient(st.fillLinearGradient);
                } else if (st.iconGeomSize) type = 'square';
            }
            st.type = type;
        }
        return st;
    }

    var parseItem = function(style) {			// Style Scanex->leaflet
        var pt = {
            MinZoom: style.MinZoom || 0
            ,MaxZoom: style.MaxZoom || 50
            ,Filter: style.Filter || null
            ,onMouseOver: !style.DisableBalloonOnMouseMove
            ,onMouseClick: !style.DisableBalloonOnClick
            ,Balloon: style.Balloon || ''
            ,BalloonEnable: style.BalloonEnable || false
            ,RenderStyle: (style.RenderStyle ? parseStyle(L.gmxUtil.fromServerStyle(style.RenderStyle)) : {})
            ,HoverStyle: (style.HoverStyle ? parseStyle(L.gmxUtil.fromServerStyle(style.HoverStyle)) : {})
        };

        if('Filter' in style) {
            var ph = gmxParsers.parseSQL(style.Filter);
            if(ph) pt.FilterFunction = ph;
        }
        return pt;
    }

    var getImageSize = function(pt, flag) {     // check image size
        var url = pt.iconUrl;

        needLoadIcons++;
        gmxImageLoader.unshift(url, {
            crossOrigin: 'anonymous'
        }).then(
            function(it) {
                pt.maxSize = Math.max(it.width, it.height);
                pt.sx = it.width / 2;
                pt.sy = it.height / 2;
                if(flag) pt.image = it;
                imagesSize[url] = pt;
                needLoadIcons--;
                _this._chkReady();
            },
            function(){
                pt.sx = 1;
                pt.sy = 0;
                pt.image = null;
                imagesSize[url] = pt;
                needLoadIcons--;
                _this._chkReady();
                console.log({url: url, func: 'getImageSize', Error: 'image not found'});
            }
        );
    }

    var itemStyleParser = function(item, pt) {
        if (!pt) pt = {};
        var out = {},
            indexes = gmx.tileAttributeIndexes,
            prop = item.properties,
            itemType = item.type,
            type = pt.type,
            color = pt.color || 255,
            opacity = 'opacity' in pt ? pt.opacity : 1;

        out.sx = pt.sx;
        out.sy = pt.sy;
        if(type === 'image') {
            out.type = pt.type;
            if (pt.image) out.image = pt.image;
            if (pt.iconAngle) {
                var rotateRes = pt.iconAngle || 0;
                if(rotateRes && typeof(rotateRes) == 'string') {
                    rotateRes = (pt.rotateFunction ? pt.rotateFunction(prop, indexes) : 0);
                }
                out.rotate = rotateRes || 0;
            }
        } else {
            if(itemType === 'POLYGON' || itemType === 'MULTIPOLYGON') {
                type = 'polygon';
            }
            if(pt.iconGeomSize) {
                out.size = ('sizeFunction' in pt ? pt.sizeFunction(prop, indexes) : pt.iconGeomSize);
                out.sx = out.size;
                out.sy = out.size;
            }
            out.stroke = true;
            if('colorFunction' in pt || 'opacityFunction' in pt) {
                color = 'colorFunction' in pt ? pt.colorFunction(prop, indexes) : color;
                opacity = 'opacityFunction' in pt ? pt.opacityFunction(prop, indexes) : opacity;
            }
            out.strokeStyle = gmxAPIutils.dec2color(color, opacity);
            out.lineWidth = 'weight' in pt ? pt.weight : 1;
        }

        if(pt.iconScale) {
            out.scale = ('scaleFunction' in pt ? pt.scaleFunction(prop, indexes) : pt.iconScale);
        }

        if(pt.fillPattern) {
            out.canvasPattern = (pt.canvasPattern ? pt.canvasPattern : gmxAPIutils.getPatternIcon(item, pt, indexes));
        } else if(pt.fillRadialGradient) {
            var rgr = pt.fillRadialGradient,
                r1 = (rgr.r1Function ? rgr.r1Function(prop, indexes) : rgr.r1),
                r2 = (rgr.r2Function ? rgr.r2Function(prop, indexes) : rgr.r2),
                x1 = (rgr.x1Function ? rgr.x1Function(prop, indexes) : rgr.x1),
                y1 = (rgr.y1Function ? rgr.y1Function(prop, indexes) : rgr.y1),
                x2 = (rgr.x2Function ? rgr.x2Function(prop, indexes) : rgr.x2),
                y2 = (rgr.y2Function ? rgr.y2Function(prop, indexes) : rgr.y2);
            var colorStop = [];
            for (var i = 0, len = rgr.addColorStop.length; i < len; i++) {
                var arr = rgr.addColorStop[i],
                    arrFunc = rgr.addColorStopFunctions[i],
                    p0 = (arrFunc[0] ? arrFunc[0](prop, indexes) : arr[0]),
                    p3 = arr.length < 4
                        ? gmxAPIutils.dec2color(arrFunc[1] ? arrFunc[1](prop, indexes) : arr[1],
                            (arr.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop, indexes) : arr[2]))/100)
                        : arr[3]
                    ;
                colorStop.push([p0, p3]);
            }
            out.sx = out.sy = out.size = r2;
            out._radialGradientParsed = {
                create: [x1, y1, r1, x2, y2, r2]
                ,colorStop: colorStop
            };
        }

        if(type === 'polygon') {
            out.type = type;
            out.fillStyle = pt.fillColor;
            if('fillColorFunction' in pt || 'fillOpacityFunction' in pt) {
                color = ('fillColorFunction' in pt ? pt.fillColorFunction(prop, indexes) : pt.fillColor || 255);
                opacity = ('fillOpacityFunction' in pt ? pt.fillOpacityFunction(prop, indexes)/100 : pt.fillOpacity || 1);
                out.fillStyle = gmxAPIutils.dec2color(color, opacity);
            } else if (pt.fillOpacity) {
                out.fillStyle = gmxAPIutils.dec2color(pt.fillColor, pt.fillOpacity);
            }
        }

        //item.parsedStyleKeys = out;
        return out;
    }

    var chkStyleFilter = function(item, tile, observer, geom) {
        var zoom = gmx.currentZoom;
        if (item._lastZoom !== zoom || !('currentFilter' in item)) {
            var fnum = item.currentFilter,
                properties = item.properties,
                indexes = gmx.tileAttributeIndexes;
            item.currentFilter = -1;
            for (var i = 0, len = styles.length; i < len; i++) {
                var st = styles[i];
                if (zoom > st.MaxZoom || zoom < st.MinZoom) continue;
                if ('FilterFunction' in st && !st.FilterFunction(properties, indexes)) continue;
                if (fnum !== i) {
                    item.parsedStyleKeys = itemStyleParser(item, st.RenderStyle);
                    if (st.HoverStyle) item.parsedStyleHover = itemStyleParser(item, st.HoverStyle);
                }

                // if (item.parsedStyleKeys && item.parsedStyleKeys.size) {
                    // item.options.size = item.parsedStyleKeys.size;
                // }
                item.currentFilter = i;
                break;
            }
            item._lastZoom = zoom;
        }
        if (styles[item.currentFilter]) {
            return true;
        } else {
            item.currentFilter = -1;
            return false;
        }
    }

    gmx.dataManager.addFilter('styleFilter', chkStyleFilter);
 
    this.getItemBalloon = function(id) {
        var item = gmx.dataManager.getItem(id),
            style = styles[item.currentFilter];
        return style ? style.Balloon : null;
    }
    
    // только для item прошедших через chkStyleFilter
    this.getObjStyle = function(item) {
        var style = styles[item.currentFilter];

        if (!style) {
            chkStyleFilter(item);
            style = styles[item.currentFilter];
            if (!style) return null;
        }
        if (gmx.lastHover && item.id === gmx.lastHover.id && style.HoverStyle) {
            item.parsedStyleHover = itemStyleParser(item, style.HoverStyle);
            return style.HoverStyle;
        }
        return style.RenderStyle;
    }

    // estimete style size for arbitrary object
    var getMaxStyleSize = function(zoom) {
        if (!zoom) zoom = gmx.currentZoom;
        var maxSize = 0;
        for (var i = 0, len = styles.length; i < len; i++) {
            var style = styles[i];
            if (zoom > style.MaxZoom || zoom < style.MinZoom) continue;
            var RenderStyle = style.RenderStyle;
            if (!RenderStyle || !RenderStyle.common || needLoadIcons) {
                maxSize = MAX_STYLE_SIZE;
                break;
            }
            maxSize = RenderStyle.maxSize;
        }
        return maxSize;
    }

    this._maxStyleSize = 0;
    this.getStyleBounds = function(gmxTilePoint) {
        if (!gmxTilePoint) return gmxAPIutils.bounds();

        this._maxStyleSize = getMaxStyleSize();

        var mercSize = 2 * this._maxStyleSize * gmxAPIutils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return gmxAPIutils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize);
    },

    //is any style is visible at given zoom?
    this.isVisibleAtZoom = function(zoom) {
        for (var i = 0, len = styles.length; i < len; i++) {
            var style = styles[i];
            if (zoom >= style.MinZoom && zoom <= style.MaxZoom) {
                return true;
            }
        }
        
        return false;
    };
    
    this._chkReady = function() {
        if(needLoadIcons < 1) {
            this.deferred.resolve();
        }
    }
    this.initStyles = function() {
        if (initStyles) initStyles();
        initStyles = null;
        this._chkReady();
    }

    // initStyles();
    // this.chkReady();
}