var StyleManager = function(gmx) {
    var MAX_STYLE_SIZE = 256,
        DEFAULT_STYLE = {outline: {color: 255, thickness: 1}, marker: {size: 8}},
        DEFAULTKEYS = ['MinZoom', 'MaxZoom', 'Balloon', 'BalloonEnable', 'DisableBalloonOnMouseMove', 'DisableBalloonOnClick'],
        maxVersion = 0,
        needLoadIcons = 0,
        deferredIcons = [],
        styles = [],
        parsers = L.gmx.Parsers,
        utils = gmxAPIutils,
        _this = this;

    this.deferred = new L.gmx.Deferred();

    var parsePattern = function(pattern) {
        var common = true;
        if ('step' in pattern && typeof (pattern.step) === 'string') {
            pattern.patternStepFunction = parsers.parseExpression(pattern.step);
            common = false;
        }
        if ('width' in pattern && typeof (pattern.width) === 'string') {
            pattern.patternWidthFunction = parsers.parseExpression(pattern.width);
            common = false;
        }
        if ('colors' in pattern) {
            var arr = [];
            for (var i = 0, len = pattern.colors.length; i < len; i++) {
                var rt = pattern.colors[i];
                if (typeof (rt) === 'string') {
                    arr.push(parsers.parseExpression(rt));
                    common = false;
                } else {
                    arr.push(null);
                }
            }
            pattern.patternColorsFunction = arr;
        }
        return common;
    };

    var getImageSize = function(pt) {     // check image size
        var url = pt.iconUrl || pt.fillIconUrl,
            opt = pt.iconAngle || pt.iconAngle ? {crossOrigin: 'anonymous'} : {};

        opt.layerID = gmx.layerID;
        needLoadIcons++;
        gmxImageLoader.unshift(url, opt).then(
            function(it) {
                pt.version = ++maxVersion;
                if (pt.fillIconUrl) {
                    pt.imagePattern = it;
                } else {
                    pt.sx = it.width;
                    pt.sy = it.height;
                    pt.image = it;
                    var maxSize = pt.iconAngle ? Math.sqrt(pt.sx * pt.sx + pt.sy * pt.sy) : Math.max(pt.sx, pt.sy);
                    if (!pt.scaleFunction) {
                        if (pt.iconScale || pt.iconScale === 1) { maxSize *= pt.iconScale; }
                        pt.common = true;
                    }
                    pt.maxSize = Number(maxSize.toFixed());
                }
                needLoadIcons--;
                _this._chkReady();
            },
            function() {
                pt.version = ++maxVersion;
                pt.sx = 1;
                pt.sy = 0;
                pt.image = null;
                needLoadIcons--;
                _this._chkReady();
                console.log({url: url, func: 'getImageSize', Error: 'image not found'});
            }
        );
    };

    var parseRadialGradient = function(rg) {
        //	x1,y1,r1 — координаты центра и радиус первой окружности;
        //	x2,y2,r2 — координаты центра и радиус второй окружности.
        //	addColorStop - стоп цвета объекта градиента [[position, color]...]
        //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
        //		color — код цвета или формула.
        //		opacity — прозрачность
        //		canvasStyleColor — результрующий цвет в формате canvas
        var common = true,
            i = 0,
            arr = ['r1', 'x1', 'y1', 'r2', 'x2', 'y2'],
            len = arr.length;
        for (i = 0; i < len; i++) {
            var it = arr[i];
            if (!rg[it]) { rg[it] = 0; }
            if (typeof (rg[it]) === 'string') {
                rg[it + 'Function'] = parsers.parseExpression(rg[it]);
                common = false;
            }
        }

        rg.addColorStop = rg.addColorStop || [[0, 0xFF0000, 0.5], [1, 0xFFFFFF, 0.5]];
        rg.addColorStopFunctions = [];
        for (i = 0, len = rg.addColorStop.length; i < len; i++) {
            arr = rg.addColorStop[i];
            var resFunc = [
                    (typeof (arr[0]) === 'string' ? parsers.parseExpression(arr[0]) : null),
                    (typeof (arr[1]) === 'string' ? parsers.parseExpression(arr[1]) : null),
                    (typeof (arr[2]) === 'string' ? parsers.parseExpression(arr[2]) : null)
                ];
            rg.addColorStopFunctions.push(resFunc);
            if (resFunc[1] === null && resFunc[2] === null) {
                arr[3] = utils.dec2color(arr[1], arr[2] > 1 ? arr[2] / 100 : arr[2]);
            } else {
                common = false;
            }
        }
        if ('r2Function' in rg) { common = false; }
        return common ? Math.max(rg.r1, rg.r2) : null;
    };

    var parseLinearGradient = function(lg) {
        var common = true;
        //	x1,y1 — координаты начальной точки
        //	x2,y2 — координаты конечной точки
        //	addColorStop - стоп цвета объекта градиента [[position, color]...]
        //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
        //		color — код цвета или формула.
        //		opacity — прозрачность
        var i = 0,
            arr = ['x1', 'y1', 'x2', 'y2'],
            def = [0, 0, 0, 256],
            len = arr.length;
        for (i = 0; i < len; i++) {
            var it = arr[i];
            if (it in lg) {
                if (typeof (lg[it]) === 'string') {
                    lg[it + 'Function'] = parsers.parseExpression(lg[it]);
                    common = false;
                }
            } else {
                lg[it] = def[i];
            }
        }

        lg.addColorStop = lg.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
        lg.addColorStopFunctions = [];
        for (i = 0, len = lg.addColorStop.length; i < len; i++) {
            arr = lg.addColorStop[i];
            lg.addColorStopFunctions.push([
                (typeof (arr[0]) === 'string' ? parsers.parseExpression(arr[0]) : null),
                (typeof (arr[1]) === 'string' ? parsers.parseExpression(arr[1]) : null),
                (typeof (arr[2]) === 'string' ? parsers.parseExpression(arr[2]) : null)
            ]);
        }
        return common;
    };

    var parseStyle = function(st, renderStyle) {
        if (st) {
            st.common = true;
            for (var key in st) {
                if (gmxAPIutils.styleFuncKeys[key]) {
                    var fkey = gmxAPIutils.styleFuncKeys[key],
                        val = st[key];
                    if (typeof (val) === 'string') {
                        st.common = false;
                        if (renderStyle && renderStyle[key] === val) {
                            st[fkey] = renderStyle[fkey];
                        } else {
                            st[fkey] = parsers.parseExpression(val);
                        }
                    } else if (typeof (val) === 'function') {
                        st.common = false;
                        st[fkey] = val;
                    }
                }
            }

            var type = '';
            if ('iconUrl' in st) {
                type = 'image';
                if (st.iconUrl) {
                    st.maxSize = 256;
                    deferredIcons.push(st);
                }
            } else if (st.fillIconUrl) {
                type = 'square';
                deferredIcons.push(st);
            } else if (st.fillPattern) {
                type = 'square';
                st.common = parsePattern(st.fillPattern);
                st.canvasPattern = utils.getPatternIcon(null, st);
            } else if (st.iconCircle) {
                type = 'circle';
                if (!('iconSize' in st)) { st.iconSize = 4; }
            } else if (st.fillRadialGradient) {
                type = 'circle';
                var size = parseRadialGradient(st.fillRadialGradient);
                if (size === null) {
                    st.common = false;
                } else {
                    st.iconSize = size;
                }
            } else if (st.fillLinearGradient) {
                type = 'square';
                st.common = parseLinearGradient(st.fillLinearGradient);
            } else if (st.iconSize) {
                type = 'square';
            }
            st.type = type;
            if (st.common && !st.maxSize) {
                st.maxSize = st.iconSize || 0;
                st.maxSize += st.weight ? st.weight : 0;
                if ('iconScale' in st) { st.maxSize *= st.iconScale; }
            }
        }
        return st;
    };

    var itemStyleParser = function(item, pt) {
        pt = pt || {};
        var out = {}, arr, i, len,
            indexes = gmx.tileAttributeIndexes,
            prop = item.properties || {},
            itemType = item.type,
            type = pt.type,
            color = pt.color || 255,
            opacity = 'opacity' in pt ? pt.opacity : 1;

        out.sx = pt.sx;
        out.sy = pt.sy;
        if (pt.maxSize) {
            out.maxSize = pt.maxSize;
        }
        if (type === 'image') {
            out.type = type;
            if (pt.iconUrl) { out.iconUrl = pt.iconUrl; }
            if (pt.image) { out.image = pt.image; }
            if (pt.iconAngle) {
                var rotateRes = pt.iconAngle || 0;
                if (rotateRes && typeof (rotateRes) === 'string') {
                    rotateRes = (pt.rotateFunction ? pt.rotateFunction(prop, indexes) : 0);
                }
                out.rotate = rotateRes || 0;
            }
            if ('iconColor' in pt) {
                out.iconColor = 'iconColorFunction' in pt ? pt.iconColorFunction(prop, indexes) : pt.iconColor;
            }
            if ('iconScale' in pt) {
                out.iconScale = 'scaleFunction' in pt ? (pt.scaleFunction ? pt.scaleFunction(prop, indexes) : 1) : pt.iconScale;
            }
        } else if (pt.fillRadialGradient) {
            var rgr = pt.fillRadialGradient,
                r1 = (rgr.r1Function ? rgr.r1Function(prop, indexes) : rgr.r1),
                r2 = (rgr.r2Function ? rgr.r2Function(prop, indexes) : rgr.r2),
                x1 = (rgr.x1Function ? rgr.x1Function(prop, indexes) : rgr.x1),
                y1 = (rgr.y1Function ? rgr.y1Function(prop, indexes) : rgr.y1),
                x2 = (rgr.x2Function ? rgr.x2Function(prop, indexes) : rgr.x2),
                y2 = (rgr.y2Function ? rgr.y2Function(prop, indexes) : rgr.y2);
            if (rgr.r2max) {
                r2 = Math.min(r2, rgr.r2max);
            }
            var colorStop = [];
            len = rgr.addColorStop.length;
            if (!rgr.addColorStopFunctions) {
                rgr.addColorStopFunctions = new Array(len);
            }
            for (i = 0; i < len; i++) {
                arr = rgr.addColorStop[i];
                var arrFunc = rgr.addColorStopFunctions[i] || [],
                    p0 = (arrFunc[0] ? arrFunc[0](prop, indexes) : arr[0]),
                    p3 = arr[3];
                if (arr.length < 4) {
                    var op = arr.length < 3 ? 1 : arrFunc[2] ? arrFunc[2](prop, indexes) : arr[2];
                    p3 = utils.dec2color(arrFunc[1] ? arrFunc[1](prop, indexes) : arr[1], op);
                 }
                colorStop.push([p0, p3]);
            }
            out.maxSize = out.sx = out.sy = out.iconSize = r2;
            out.fillRadialGradient = {
                x1:x1, y1:y1, r1:r1, x2:x2, y2:y2, r2:r2,
                addColorStop: colorStop
            };
            out._radialGradientParsed = {
                create: [x1, y1, r1, x2, y2, r2],
                colorStop: colorStop
            };
        } else if (pt.fillLinearGradient) {
            out.fillLinearGradient = pt.fillLinearGradient;
        } else {
            if (pt.fillPattern) {
                out.canvasPattern = (pt.canvasPattern ? pt.canvasPattern : utils.getPatternIcon(item, pt, indexes));
            }
            if (itemType === 'POLYGON' || itemType === 'MULTIPOLYGON' || gmx.GeometryType === 'polygon') {
                type = 'polygon';
            }
            if (pt.iconSize) {
                var iconSize = ('sizeFunction' in pt ? pt.sizeFunction(prop, indexes) : pt.iconSize);
                out.sx = out.sy = iconSize;
                iconSize += pt.weight ? pt.weight : 0;
                out.iconSize = iconSize;
                if ('iconScale' in pt) {
                    out.iconSize *= pt.iconScale;
                }
                out.maxSize = iconSize;
            }
            out.stroke = true;
            if ('colorFunction' in pt || 'opacityFunction' in pt) {
                color = 'colorFunction' in pt ? pt.colorFunction(prop, indexes) : color;
                opacity = 'opacityFunction' in pt ? pt.opacityFunction(prop, indexes) : opacity;
            }
            out.strokeStyle = utils.dec2color(color, opacity);
            out.lineWidth = 'weight' in pt ? pt.weight : 1;
        }

        if ('iconScale' in pt) {
            out.iconScale = 'scaleFunction' in pt ? (pt.scaleFunction ? pt.scaleFunction(prop, indexes) : 1) : pt.iconScale;
        }

        if (type === 'square' || type === 'polygon' || type === 'circle') {
            out.type = type;
            var fop = pt.fillOpacity,
                fc = pt.fillColor,
                fcDec = typeof (fc) === 'string' ? parseInt(fc.replace(/#/, ''), 16) : fc;

            if ('fillColor' in pt) {
                out.fillStyle = utils.dec2color(fcDec, 1);
            }
            if ('fillColorFunction' in pt || 'fillOpacityFunction' in pt) {
                color = ('fillColorFunction' in pt ? pt.fillColorFunction(prop, indexes) : fc || 255);
                opacity = ('fillOpacityFunction' in pt ? pt.fillOpacityFunction(prop, indexes) : fop || 1);
                out.fillStyle = utils.dec2color(color, opacity);
            } else if ('fillOpacity' in pt && 'fillColor' in pt) {
                out.fillStyle = utils.dec2color(fcDec, fop);
            }
        }

        if ('dashArray' in pt) { out.dashArray = pt.dashArray; }
        if ('dashOffset' in pt) { out.dashOffset = pt.dashOffset; }

        if (gmx.labelsLayer) {
            arr = utils.styleKeys.label.client;
            for (i = 0, len = arr.length; i < len; i++) {
                var it = arr[i];
                if (it in pt) {
                    if (it === 'labelField') {
                        if (!indexes[pt[it]]) {
                            continue;
                        }
                    } else if (it === 'labelTemplate') {
                        var properties = gmxAPIutils.getPropertiesHash(prop, indexes);
                        out.labelText = utils.parseTemplate(pt[it], properties);
                    }
                    out[it] = pt[it];
                }
            }
        }
        return out;
    };

    var prepareItem = function(style) {			// Style Scanex->leaflet
        var pt = {
            MinZoom: style.MinZoom || 0,
            MaxZoom: style.MaxZoom || 50,
            Filter: style.Filter || null,
            Balloon: style.Balloon || '',
            RenderStyle: (style.RenderStyle ? parseStyle(L.gmxUtil.fromServerStyle(style.RenderStyle)) : {}),
            version: ++maxVersion
        };
        pt.DisableBalloonOnMouseMove = style.DisableBalloonOnMouseMove === false ? false : true;
        pt.DisableBalloonOnClick = style.DisableBalloonOnClick || false;
        if (style.HoverStyle) {
            pt.HoverStyle = parseStyle(L.gmxUtil.fromServerStyle(style.HoverStyle), pt.RenderStyle);
        }

        if ('Filter' in style) {
            var ph = parsers.parseSQL(style.Filter.replace(/[\[\]]/g, '"'));
            if (ph) { pt.filterFunction = ph; }
        }
        return pt;
    };

    var isLabel = function(st) {
        var indexes = gmx.tileAttributeIndexes;
        return (st && (st.labelTemplate || (st.labelField && st.labelField in indexes)));
    };

    var checkDiff = function(st, st1) {
        for (var key in st) {
            if (st[key] !== st1[key]) {
                return key;
            }
        }
        return null;
    };

    var checkStyles = function() {
        var balloonEnable = false,
            labelsLayer = false;

        for (var i = 0, len = styles.length; i < len; i++) {
            var st = styles[i];

            st.DisableBalloonOnMouseMove = st.DisableBalloonOnMouseMove === false ? false : true;
            st.DisableBalloonOnClick = st.DisableBalloonOnClick || false;
            if (st.DisableBalloonOnMouseMove === false || st.DisableBalloonOnClick === false) {
                balloonEnable = true;
                st.BalloonEnable = true;
            }
            st.hoverDiff = null;
            st.common = {};
            if (st.RenderStyle) {
                if (!labelsLayer) {
                    if (isLabel(st.RenderStyle)) {
                        labelsLayer = true;
                    }
                }
                if (st.RenderStyle.common) {
                    st.common.RenderStyle = itemStyleParser({}, st.RenderStyle);
                }
                if (st.HoverStyle) {
                    st.hoverDiff = checkDiff(st.RenderStyle, st.HoverStyle);
                }
            }
            if (st.HoverStyle && st.HoverStyle.common) {
                st.common.HoverStyle = itemStyleParser({}, st.HoverStyle);
            }
        }
        gmx.balloonEnable = balloonEnable;
        gmx.labelsLayer = labelsLayer;
    };

    var parseServerStyles = function() {
        var props = gmx.properties,
            arr = props.styles || [{RenderStyle: DEFAULT_STYLE}],
            len = Math.max(arr.length, gmx.styles.length);

        for (var i = 0; i < len; i++) {
            var gmxStyle = gmx.styles[i] || arr[i];
            if (!gmxStyle.RenderStyle) { gmxStyle.RenderStyle = DEFAULT_STYLE; }
            if (gmxStyle.HoverStyle === undefined) {
                var hoveredStyle = JSON.parse(JSON.stringify(gmxStyle.RenderStyle));
                if (hoveredStyle.marker && hoveredStyle.marker.size) { hoveredStyle.marker.size += 1; }
                if (hoveredStyle.outline) { hoveredStyle.outline.thickness += 1; }
                //if (hoveredStyle.outline) hoveredStyle.outline.color = 0xff0000;
                gmxStyle.HoverStyle = hoveredStyle;
            } else if (gmxStyle.HoverStyle === null) {
                delete gmxStyle.HoverStyle;
            }
            var pt = prepareItem(gmxStyle);
            styles.push(pt);
            if (isLabel(pt.RenderStyle)) { gmx.labelsLayer = true; }
        }
        checkStyles();
    };
    parseServerStyles();

    var getStyleKeys = function(style) {
        var out = {};
        for (var key in gmxAPIutils.styleKeys) {
            var keys = gmxAPIutils.styleKeys[key];
            for (var i = 0, len = keys.client.length; i < len; i++) {
                var key1 = keys.client[i];
                if (key1 in style) {
                    out[key1] = JSON.parse(JSON.stringify(style[key1]));
                    if (key1 === 'fillPattern') { delete out[key1].patternColorsFunction; }
                    if (key1 === 'fillLinearGradient') { delete out[key1].addColorStopFunctions; }
                }
            }
        }
        return out;
    };

    this.getStyles = function () {
        var out = [];
        for (var i = 0, len = styles.length; i < len; i++) {
            var style = L.extend({}, styles[i]);
            style.RenderStyle = getStyleKeys(style.RenderStyle);
            if (style.HoverStyle) {
                style.HoverStyle = getStyleKeys(style.HoverStyle);
            }
            delete style.filterFunction;
            delete style.version;
            delete style.common;
            delete style.type;
            out.push(style);
        }
        return out;
    };

    this.clearStyles = function () {
        styles = [];
        gmx.balloonEnable = false;
        gmx.labelsLayer = false;
    };

    this.changeStylesVersion = function () {
        styles.map(function(it) {
            it.version = ++maxVersion;
        });
    };

    var chkStyleFilter = function(item) {
        var zoom = gmx.currentZoom,
            fnum = gmx.multiFilters ? -1 : item.currentFilter,
            curr = styles[fnum],
            needParse = !curr || curr.version !== item.styleVersion;

        if (needParse || item._lastZoom !== zoom) {
            var properties = item.properties,
                indexes = gmx.tileAttributeIndexes;
            item.currentFilter = -1;
            item.multiFilters = [];
            for (var i = 0, len = styles.length; i < len; i++) {
                var st = styles[i];
                if (zoom > st.MaxZoom || zoom < st.MinZoom
                    || (st.filterFunction && !st.filterFunction(properties, indexes))) {
                    continue;
                }
                item.hoverDiff = st.hoverDiff;
                item.currentFilter = i;
                if (needParse || fnum !== i) {
                    var parsed = st.common && st.common.RenderStyle || itemStyleParser(item, st.RenderStyle),
                        parsedHover = null;

                    item.parsedStyleKeys = parsed;
                    if (st.HoverStyle) {
                        parsedHover = st.common && st.common.HoverStyle || itemStyleParser(item, st.HoverStyle);
                        item.parsedStyleHover = parsedHover;
                    }
                    if (gmx.multiFilters) {
                        item.multiFilters.push({
                            style: st.RenderStyle,
                            styleHover: st.HoverStyle,
                            parsedStyle: parsed,
                            parsedStyleHover: parsedHover
                        });
                    }
                }
                item.styleVersion = st.version;
                if (!gmx.multiFilters) {
                    break;      // Один обьект в один фильтр
                }
            }
            item._lastZoom = zoom;
        }
        if (styles[item.currentFilter]) {
            return true;
        } else {
            item.currentFilter = -1;
            return false;
        }
    };

    gmx.dataManager.addFilter('styleFilter', chkStyleFilter);

    this.setStyle = function(st, num, createFlag) {
        num = num || 0;
        if (num < styles.length || createFlag) {
            var style = styles[num];
            if (!style) {
                style = prepareItem({});
                styles[num] = style;
            }
            this.deferred = new L.gmx.Deferred();
            style.version = ++maxVersion;
            if ('Filter' in st) {
                style.Filter = st.Filter;
                var type = typeof (st.Filter);
                style.filterFunction = type === 'string' ? parsers.parseSQL(style.Filter.replace(/[\[\]]/g, '"'))
                    : type === 'function' ? style.Filter : null;

                this.changeStylesVersion();
                gmx.dataManager.addFilter('styleFilter', chkStyleFilter); // reset 'styleFilter'
            }
            for (var i = 0, len = DEFAULTKEYS.length; i < len; i++) {
                var key = DEFAULTKEYS[i];
                if (key in st) { style[key] = st[key]; }
            }
            // DEFAULTKEYS.forEach(function(key) {
                // if (key in st) { style[key] = st[key]; }
            // });
            if (st.RenderStyle) { style.RenderStyle = parseStyle(st.RenderStyle); }
            if (st.HoverStyle) { style.HoverStyle = parseStyle(st.HoverStyle, style.RenderStyle); }
            checkStyles();
            this.initStyles();
        }
    };

    this.getItemBalloon = function(id) {
        var item = gmx.dataManager.getItem(id),
            style = styles[item.currentFilter];
        return style ? {
                DisableBalloonOnMouseMove: style.DisableBalloonOnMouseMove || false,
                DisableBalloonOnClick: style.DisableBalloonOnClick || false,
                templateBalloon: style.Balloon || null
            }
            : null
        ;
    };

    // apply styleHook func
    this.applyStyleHook = function(item, hoverFlag) {
        return itemStyleParser(item, gmx.styleHook(item, hoverFlag));
    };

    // только для item прошедших через chkStyleFilter
    this.getObjStyle = function(item) {
        chkStyleFilter(item);
        var style = styles[item.currentFilter],
            version;
        if (!style) {
            return null;
        }
        if (style.hoverDiff && gmx.lastHover && item.id === gmx.lastHover.id) {
            if (style.HoverStyle) {
                version = style.HoverStyle.version || -1;
                if (version !== item.styleVersion) {
                    item.parsedStyleHover = itemStyleParser(item, style.HoverStyle);
                }
                return style.HoverStyle;
            } else {
                delete item.parsedStyleHover;
            }
            return null;
        }
        version = style.version || -1;
        if (version !== item.styleVersion) {
            item.parsedStyleKeys = itemStyleParser(item, style.RenderStyle);
        }
        return style.RenderStyle;
    };

    // estimete style size for arbitrary object
    var getMaxStyleSize = function(zoom) {
        if (!zoom) {
            zoom = gmx.currentZoom;
        }
        var maxSize = 0;
        for (var i = 0, len = styles.length; i < len; i++) {
            var style = styles[i];
            if (zoom > style.MaxZoom || zoom < style.MinZoom) { continue; }
            var RenderStyle = style.RenderStyle;
            if (needLoadIcons || !RenderStyle || !RenderStyle.common || !RenderStyle.maxSize) {
                maxSize = MAX_STYLE_SIZE;
                break;
            }
            maxSize = Math.max(RenderStyle.maxSize, maxSize);
        }
        return maxSize || 256;
    };

    this._maxStyleSize = 0;
    this.getStyleBounds = function(gmxTilePoint) {
        if (!gmxTilePoint) {
            return utils.bounds();
        }

        this._maxStyleSize = getMaxStyleSize();

        var mercSize = 2 * this._maxStyleSize * utils.tileSizes[gmxTilePoint.z] / 256; //TODO: check formula
        return utils.getTileBounds(gmxTilePoint.x, gmxTilePoint.y, gmxTilePoint.z).addBuffer(mercSize);
    };

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
    this.getIcons = function(callback) {
        this.deferred.then(function() {
            var out = [];
            for (var i = 0, len = styles.length; i < len; i++) {
                var style = styles[i],
                    pt = {};
                if (style.RenderStyle) {
                    pt.RenderStyle = {image: style.RenderStyle.image};
                }
                if (style.HoverStyle) {
                    pt.HoverStyle = {image: style.HoverStyle.image};
                }
                out.push(pt);
            }
            if (callback) {
                callback(out);
            }
        });
        this.initStyles();
    };

    this._chkReady = function() {
        if (needLoadIcons < 1) {
            this.deferred.resolve();
        }
    };
    this.initStyles = function() {
        for (var i = 0, len = deferredIcons.length; i < len; i++) {
            getImageSize(deferredIcons[i]);
        }
        // deferredIcons.forEach(function(it) {
            // getImageSize(it);
        // });
        deferredIcons = [];
        this._chkReady();
        return this.deferred;
    };
};
