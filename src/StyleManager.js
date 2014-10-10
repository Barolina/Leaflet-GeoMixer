var gmxStyleManager = function(gmx) {
    var MAX_STYLE_SIZE = 256,
        DEFAULT_STYLE = { outline: { color: 255, thickness: 1}},
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

    var parseItem = function(style) {			// Style Scanex->leaflet
        var pt = {
			common: true					// true, false (true - if style without object property keys)
			,MinZoom: style.MinZoom || 0
			,MaxZoom: style.MaxZoom || 50
			,Filter: style.Filter || null
			,onMouseOver: !style.DisableBalloonOnMouseMove
			,onMouseClick: !style.DisableBalloonOnClick
			,Balloon: style.Balloon || ''
			,BalloonEnable: style.BalloonEnable || false
			,RenderStyle: (style.RenderStyle ? parseStyle(style, 'RenderStyle') : null)
			,HoverStyle: (style.HoverStyle ? parseStyle(style, 'HoverStyle') : null)
		};
		if('Filter' in style) {
            var ph = gmxParsers.parseSQL(style.Filter);
            if(ph) pt.FilterFunction = ph;
        }
        return pt;
    }

    var chkStyleKey = function(pt, st, keys) { // Scanex Style type -> leaflet
        for(var i = 0, len = keys.length; i < len; i++) {
            var key = keys[i];
            if(key in st) pt[key] = st[key];
        }
    }

    var parseStyle = function(style, type) {   // Style Scanex->leaflet
        var st = style[type] || {},
            pt = {
			common: true					// true, false (true - depends from object properties)
			,sx: 0
			,sy: 0
			,label: false
			,marker: false
			,fill: false
			,stroke: false
			,MinZoom: style.MinZoom || 0
			,MaxZoom: style.MaxZoom || 50
		};
        if(typeof(st.label) === 'object') {     //  label style
            pt.label = {};
            chkStyleKey(pt.label, st.label, ['color', 'haloColor', 'size', 'spacing', 'align', 'dx', 'dy', 'field']);
            pt.common = false;
        }

        var isMarker = (typeof(st.marker) === 'object' ? true : false);
        if(isMarker) {				            //  marker Style
            chkStyleKey(pt, st.marker, ['circle', 'size', 'center', 'scale']);
        }
        if(isMarker && 'image' in st.marker) {				//	image in marker style
            var ph = st.marker;
            pt.marker = true;
            chkStyleKey(pt, ph, ['color', 'opacity', 'size', 'scale', 'minScale', 'maxScale', 'dx', 'dy', 'center']);
            pt.opacity = ('opacity' in pt ? pt.opacity/100 : 1);
            if('angle' in ph) pt.rotate = ph.angle;
            if('image' in ph) {
                pt.iconUrl = ph.image;
                getImageSize(pt, true);
            }
        } else {
            if(typeof(st.fill) === 'object') {					//	fill style
                pt.fill = true;
                var ph = st.fill;
                if('color' in ph) pt.fillColor = ph.color;
                pt.fillOpacity = ('opacity' in ph ? ph.opacity/100 : 1);
                if('pattern' in ph) {
                    var pattern = ph.pattern;
                    delete pattern._res;
                    pt.pattern = pattern;
                    if('step' in pattern && typeof(pattern.step) === 'string') {
                        pattern.patternStepFunction = gmxParsers.parseExpression(pattern.step);
                        pt.common = false;
                    }
                    if('width' in pattern && typeof(pattern.width) === 'string') {
                        pattern.patternWidthFunction = gmxParsers.parseExpression(pattern.width);
                        pt.common = false;
                    }
                    if('colors' in pattern) {
                        var arr = [];
                        for (var i = 0, len = pattern.colors.length; i < len; i++)
                        {
                            var rt = pattern.colors[i];
                            if(typeof(rt) === 'string') {
                                arr.push(gmxParsers.parseExpression(rt));
                                pt.common = false;
                            } else {
                                arr.push(null);
                            }
                        }
                        pattern.patternColorsFunction = arr;
                    }
                    if(pt.common) pt.canvasPattern = gmxAPIutils.getPatternIcon(null, pt);
                } else if(typeof(ph.radialGradient) === 'object') {
                    pt.radialGradient = ph.radialGradient;
                    //	x1,y1,r1 — координаты центра и радиус первой окружности;
                    //	x2,y2,r2 — координаты центра и радиус второй окружности.
                    //	addColorStop - стоп цвета объекта градиента [[position, color]...]
                    //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
                    //		color — код цвета или формула.
                    //		opacity — прозрачность
                    //		canvasStyleColor — результрующий цвет в формате canvas
                    var arr = ['r1', 'x1', 'y1', 'r2', 'x2', 'y2'];
                    for (var i = 0, len = arr.length; i < len; i++)
                    {
                        var it = arr[i];
                        pt.radialGradient[it] = (it in ph.radialGradient ? ph.radialGradient[it] : 0);
                        if(typeof(pt.radialGradient[it]) === 'string') {
                            pt.radialGradient[it+'Function'] = gmxParsers.parseExpression(pt.radialGradient[it]);
                            pt.common = false;
                        }
                    }
                    
                    pt.radialGradient.addColorStop = ph.radialGradient.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
                    pt.radialGradient.addColorStopFunctions = [];
                    for (var i = 0, len = pt.radialGradient.addColorStop.length; i < len; i++)
                    {
                        var arr = pt.radialGradient.addColorStop[i];
                            resFunc = [
                                (typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
                                ,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
                                ,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
                            ];
                        pt.radialGradient.addColorStopFunctions.push(resFunc);
                        if (resFunc[1] === null && resFunc[2] === null) {
                            arr.push(gmxAPIutils.dec2color(arr[1], arr[2]/100));
                        }
                    }
                    if (pt.common) {
                        pt.size = pt.circle = Math.max(pt.radialGradient.r1, pt.radialGradient.r2);
                    }
                } else if(typeof(ph.linearGradient) === 'object') {
                    pt.linearGradient = ph.linearGradient;
                    //	x1,y1 — координаты начальной точки
                    //	x2,y2 — координаты конечной точки
                    //	addColorStop - стоп цвета объекта градиента [[position, color]...]
                    //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
                    //		color — код цвета или формула.
                    //		opacity — прозрачность
                    var arr = ['x1', 'y1', 'x2', 'y2'];
                    for (var i = 0, len = arr.length; i < len; i++)
                    {
                        var it = arr[i];
                        pt.linearGradient[it] = (it in ph.linearGradient ? ph.linearGradient[it] : 0);
                        if(typeof(pt.linearGradient[it]) === 'string') {
                            pt.linearGradient[it+'Function'] = gmxParsers.parseExpression(pt.linearGradient[it]);
                            pt.common = false;
                        }
                    }
                    
                    pt.linearGradient.addColorStop = ph.linearGradient.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
                    pt.linearGradient.addColorStopFunctions = [];
                    for (var i = 0, len = pt.linearGradient.addColorStop.length; i < len; i++)
                    {
                        var arr = pt.linearGradient.addColorStop[i];
                        pt.linearGradient.addColorStopFunctions.push([
                            (typeof(arr[0]) === 'string' ? gmxParsers.parseExpression(arr[0]) : null)
                            ,(typeof(arr[1]) === 'string' ? gmxParsers.parseExpression(arr[1]) : null)
                            ,(typeof(arr[2]) === 'string' ? gmxParsers.parseExpression(arr[2]) : null)
                        ]);
                    }
                }
                if('fillColor' in pt) {
                    pt.fillStyle = gmxAPIutils.dec2color(pt.fillColor, pt.fillOpacity);
                }
            }

            if(typeof(st.outline) === 'object') {				//	Есть стиль контура
                pt.stroke = true;
                var ph = st.outline;
                pt.lineWidth = pt.sx = pt.sy = ph.thickness || 0;
                if('dashes' in ph) pt.dashes = ph.dashes;
                if('opacity' in ph && typeof(ph.opacity) === 'string') {
                    pt.opacityFunction = gmxParsers.parseExpression(ph.opacity);
                    pt.common = false;
                } else {
                    var opacity = ('opacity' in ph ? ph.opacity/100 : 1);
                    pt.strokeStyle = gmxAPIutils.dec2color(ph.color || 255, opacity);
                }
            }
        }
        ['rotate', 'scale', 'color', 'fillColor', 'size'].map(function(it) {
            if (it in pt) {
                var zn = pt[it];
                if (typeof(zn) === 'string') {
                    if (zn.match(/[^\d\.]/) === null) pt[it] = Number(zn);
                    else {
                        pt[it+'Function'] = gmxParsers.parseExpression(zn);
                        pt.common = false;
                    }
                }
            }
        });
        if (!pt.sizeFunction) {
            pt.sx = pt.sy = pt.size || 4;
        }
        return pt;
    }
	var getImageSize = function(pt, flag)	{				// определение размеров image
		var url = pt.iconUrl;

		needLoadIcons++;
		gmxImageLoader.unshift(url, {
            crossOrigin: 'anonymous'
        }).then(
            function(it) {
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
        var out = {},
            indexes = gmx.tileAttributeIndexes,
            prop = item.properties,
            color = 255, opacity = 1;

        out.sx = pt.sx;
        out.sy = pt.sy;
        if(pt.marker) {
            out.marker = pt.marker;
            if (pt.image) out.image = pt.image;
            if (pt.rotate) {
                var rotateRes = pt.rotate || 0;
                if(rotateRes && typeof(rotateRes) == 'string') {
                    rotateRes = (pt.rotateFunction ? pt.rotateFunction(prop, indexes) : 0);
                }
                out.rotate = rotateRes || 0;
            }
        }

        if(pt.scale) {
            out.scale = ('scaleFunction' in pt ? pt.scaleFunction(prop, indexes) : pt.scale);
        }

        if(pt.stroke) {
            if(pt.size) {
                out.size = ('sizeFunction' in pt ? pt.sizeFunction(prop, indexes) : pt.size);
                out.sx = out.size;
                out.sy = out.size;
            }
            out.stroke = pt.stroke;
            out.strokeStyle = pt.strokeStyle;
            if('colorFunction' in pt || 'opacityFunction' in pt) {
                color = 'colorFunction' in pt ? pt.colorFunction(prop, indexes) : 'color' in pt ? pt.color : 255;
                opacity = 'opacityFunction' in pt ? pt.opacityFunction(prop, indexes)/100 : 'opacity' in pt ? pt.opacity : 1;
                out.strokeStyle = gmxAPIutils.dec2color(color, opacity);
            }
            out.lineWidth = 'lineWidth' in pt ? pt.lineWidth : 1;
        }

        if(pt.fill) {
            out.fill = pt.fill;
            if(pt.pattern) {
                out.canvasPattern = (pt.canvasPattern ? pt.canvasPattern : gmxAPIutils.getPatternIcon(item, pt));
            } else if(pt.radialGradient) {
                var rgr = pt.radialGradient,
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
            } else {
                out.fillStyle = pt.fillStyle;
                if('fillColorFunction' in pt || 'fillOpacityFunction' in pt) {
                    color = ('fillColorFunction' in pt ? pt.fillColorFunction(prop, indexes) : pt.fillColor || 255);
                    opacity = ('fillOpacityFunction' in pt ? pt.fillOpacityFunction(prop, indexes)/100 : pt.fillOpacity || 1);
                    out.fillStyle = gmxAPIutils.dec2color(color, opacity);
                }
            }
        }
        /*
        if(pt.label) {
            out.label = pt.label;
            color = pt.label.color || 0;
            out.label.strokeStyle = gmxAPIutils.dec2rgba(color, 1);
            color = pt.label.haloColor || 0;
            out.label.fillStyle = gmxAPIutils.dec2rgba(color, 1);
            out.label.size = pt.label.size || 12;
            out.label.extentLabel = gmxAPIutils.getLabelSize(prop[out.label.field], out.label);
            out.sx = out.label.extentLabel[0];
            out.sy = out.label.extentLabel[1];
        }
        */
        item.parsedStyleKeys = out;
        return out;
    }

    var chkStyleFilter = function(item) {
        if (item.parsedStyleKeys && item.parsedStyleKeys.size) {
            item.options.size = item.parsedStyleKeys.size;
        }
        if (item._lastZoom !== gmx.currentZoom || !('currentFilter' in item)) {
            item._lastZoom = gmx.currentZoom;
            var indexes = gmx.tileAttributeIndexes;
            for (var i = 0, len = styles.length; i < len; i++) {
                var st = styles[i];
                if (gmx.currentZoom > st.MaxZoom || gmx.currentZoom < st.MinZoom) continue;
                if ('FilterFunction' in st && !st.FilterFunction(item.properties, indexes)) continue;
                if (item.currentFilter !== i) {
                    itemStyleParser(item, st.RenderStyle);
                    if (st.HoverStyle) itemStyleParser(item, st.HoverStyle);
                }

                item.currentFilter = i;
                return true;
            }
        } else if (styles[item.currentFilter]) {
            return true;
        }
        item.currentFilter = -1;
        return false;
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
            itemStyleParser(item, style.HoverStyle);
            return style.HoverStyle;
        }
        itemStyleParser(item, style.RenderStyle);
        return style.RenderStyle;
    }

    // estimete style size for arbitrary object
    this.getMaxStyleSize = function(zoom) {
		if (!zoom) zoom = gmx.currentZoom;
		var maxSize = 0;
		for (var i = 0, len = styles.length; i < len; i++) {
			var style = styles[i];
			if (zoom > style.MaxZoom || zoom < style.MinZoom) continue;
			var RenderStyle = style.RenderStyle;
			if (!RenderStyle.common || needLoadIcons) {
				maxSize = MAX_STYLE_SIZE;
				break;
			}
			maxSize = Math.max(maxSize, 2 * RenderStyle.sx, 2 * RenderStyle.sy);
		}
		return maxSize;
    }
    
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