"use strict";
var gmxAPIutils = {
	lastMapId: 0,
    
	newId: function()
	{
		gmxAPIutils.lastMapId += 1;
		return '_' + gmxAPIutils.lastMapId;
	},
    
	uniqueGlobalName: function(thing)
	{
		var id = gmxAPIutils.newId();
		window[id] = thing;
		return id;
	},

    isPageHidden: function()	{		// Видимость окна браузера
        return document.hidden || document.msHidden || document.webkitHidden || document.mozHidden || false;
    },
   
    /** Sends JSONP requests 
     * @param {String} url - request URL
     * @param {Object} params - request params
     * @param {Object} [options] - additional request options
     * @param {String} [options.callbackParamName=CallbackName] - Name of param, that will be used for callback id. 
       If callbackParamName is set to null, no params will be added (StaticJSONP)
     * @return {gmxDeferred} Promise with server JSON response or with error status
    */
	requestJSONP: function(url, params, options) {
        options = options || {};
        var def = new gmxDeferred();
        
        var script = document.createElement("script");
        script.setAttribute("charset", "UTF-8");
        var callbackParamName = 'callbackParamName' in options ? options.callbackParamName : 'CallbackName';
        var urlParams = L.extend({}, params);
        
        if (callbackParamName) {
            var callbackName = gmxAPIutils.uniqueGlobalName(function(obj)
            {
                delete window[callbackName];
                document.getElementsByTagName("head").item(0).removeChild(script);
                def.resolve(obj);
            });
        
            urlParams[callbackParamName] = callbackName;
        }
        
        var paramsStringItems = [];
        
        for (var p in urlParams) {
            paramsStringItems.push(p + '=' + encodeURIComponent(urlParams[p]));
        }
        
        var sepSym = url.indexOf('?') == -1 ? '?' : '&';
        
        script.onerror = function(e) {
            def.reject(e);
        };
        
        script.setAttribute("src", url + sepSym + paramsStringItems.join('&'));
        document.getElementsByTagName("head").item(0).appendChild(script);
        return def;
    },
    getXmlHttp: function() {
        var xmlhttp;
        if (typeof XMLHttpRequest != 'undefined') {
            xmlhttp = new XMLHttpRequest();
        } else {
          try {
            xmlhttp = new ActiveXObject("Msxml2.XMLHTTP");
          } catch (e) {
            try {
              xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
            } catch (E) {
              xmlhttp = false;
            }
          }
        }
        return xmlhttp;
    },
    request: function(ph) { // {'type': 'GET|POST', 'url': 'string', 'callback': 'func'}
      try {
        var xhr = gmxAPIutils.getXmlHttp();
        xhr.open((ph.type ? ph.type : 'GET'), ph.url, ph.async || false);
        xhr.send((ph.params ? ph.params : null));
        if (ph.async) {
            xhr.withCredentials = true;
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    //self.log('xhr.status ' + xhr.status);
                    if(xhr.status == 200) {
                        ph.callback(xhr.responseText);
                        xhr = null;
                    }
                }
            };
        } else {
            if(xhr.status == 200) {
                ph.callback(xhr.responseText);
            }
        }
        return xhr.status;
      } catch (e) {
        if(ph.onError) ph.onError(xhr.responseText);
        return e.description; // turn all errors into empty results
      }
    }
    ,

    tileSizes: [] // Размеры тайла по zoom
    ,
    
    getTileNumFromLeaflet: function (tilePoint, zoom) {
        var pz = Math.pow(2, zoom),
            tx = tilePoint.x % pz + (tilePoint.x < 0 ? pz : 0),
            ty = tilePoint.y % pz + (tilePoint.y < 0 ? pz : 0);
        return {
            z: zoom
            ,x: tx % pz - pz/2
            ,y: pz/2 - 1 - ty % pz
        };
    },

	getTilePosZoomDelta: function(tilePoint, zoomFrom, zoomTo) {		// получить смещение тайла на меньшем zoom
        var dz = Math.pow(2, zoomFrom - zoomTo),
            size = 256 / dz,
            dx = tilePoint.x % dz,
            dy = tilePoint.y % dz;
		return {
			size: size
			,zDelta: dz
			,x: size * (dx < 0 ? dz + dx : dx)
			,y: size * (dy < 0 ? 1 + dy : dz - 1 - dy)
		};
    },

    geoItemBounds: function(geo) {  // get bounds by geometry
        var type = geo.type,
            coords = geo.coordinates,
            bounds = null,
            boundsArr = [];
        if (type === 'MULTIPOLYGON') {
            bounds = gmxAPIutils.bounds();
            for (var i = 0, len = coords.length; i < len; i++) {
                var arr1 = [];
                for (var j = 0, len1 = coords[i].length; j < len1; j++) {
                    var b = gmxAPIutils.bounds(coords[i][j]);
                    arr1.push(b);
                    if (j === 0) bounds.extendBounds(b);
                }
                boundsArr.push(arr1);
            }
        } else if (type === 'POLYGON') {
            bounds = gmxAPIutils.bounds();
            for (var i = 0, len = coords.length; i < len; i++) {
                var b = gmxAPIutils.bounds(coords[i]);
                boundsArr.push(b);
                if (i === 0) bounds.extendBounds(b);
            }
        } else if (type === 'POINT') {
            bounds = gmxAPIutils.bounds([coords]);
        } else if (type === 'MULTIPOINT') {
            bounds = gmxAPIutils.bounds();
            for (var i = 0, len = coords.length; i < len; i++) {
                var b = gmxAPIutils.bounds([coords[i]]);
                bounds.extendBounds(b);
            }
        } else if (type === 'LINESTRING') {
            bounds = gmxAPIutils.bounds(coords);
            //boundsArr.push(bounds);
        } else if (type === 'MULTILINESTRING') {
            bounds = gmxAPIutils.bounds();
            for (var i = 0, len = coords.length; i < len; i++) {
                var b = gmxAPIutils.bounds([coords[i]]);
                bounds.extendBounds(b);
                //boundsArr.push(b);
            }
        }
        return {
            bounds: bounds,
            boundsArr: boundsArr
        };
    },

    getMarkerPolygon: function(bounds, dx, dy) {
        var x = (bounds.min.x + bounds.max.x) / 2,
            y = (bounds.min.y + bounds.max.y) / 2;
        return [
            [x - dx, y - dy]
            ,[x - dx, y + dy]
            ,[x + dx, y + dy]
            ,[x + dx, y - dy]
            ,[x - dx, y - dy]
        ];
    },

    getPropertiesHash: function(arr, indexes) {
        var properties = {};
        for (var key in indexes) {
            properties[key] = arr[indexes[key]];
        };
        return properties;
    },

    dec2rgba: function(i, a)	{				// convert decimal to rgb
        var r = (i >> 16) & 255,
            g = (i >> 8) & 255,
            b = i & 255;
		return 'rgba('+r+', '+g+', '+b+', '+a+')';
	},

    dec2hex: function(i)	{					// convert decimal to hex
        return (i+0x1000000).toString(16).substr(-6).toUpperCase();
    },

    dec2color: function(i, a)   {   // convert decimal to canvas color
        return a < 1 ? this.dec2rgba(i, a) : '#' + this.dec2hex(i);
    },

    oneDay: 60*60*24			// один день
	,
    isTileKeysIntersects: function(tk1, tk2) { // пересечение по номерам двух тайлов
        if (tk1.z < tk2.z) {
            var t = tk1; tk1 = tk2; tk2 = t;
        }
        
        var dz = tk1.z - tk2.z
        return tk1.x >> dz === tk2.x && tk1.y >> dz === tk2.y;
	},

    rotatePoints: function(arr, angle, scale, center) {			// rotate - массива точек
        var out = [];
        angle *= Math.PI / 180.0
        var sin = Math.sin(angle);
        var cos = Math.cos(angle);
        if(!scale) scale = 1;
        for (var i = 0; i < arr.length; i++)
        {
            var x = scale * arr[i].x - center.x;
            var y = scale * arr[i].y - center.y;
            out.push({
                'x': cos * x - sin * y + center.x
                ,'y': sin * x + cos * y + center.y
            });
        }
        return out;
    }
    , 
    getPatternIcon: function(item, style, indexes) { // получить bitmap стиля pattern
        if (!style.fillPattern) return null;

        var notFunc = true,
            pattern = style.fillPattern,
            prop = (item ? item.properties : {}),
            step = (pattern.step > 0 ? pattern.step : 0),		// шаг между линиями
            patternDefaults = {					// настройки для pattern стилей
                 minWidth: 1
                ,maxWidth: 1000
                ,minStep: 0
                ,maxStep: 1000
            };
        if (pattern.patternStepFunction != null && prop != null) {
            step = pattern.patternStepFunction(prop, indexes);
            notFunc = false;
        }
        if (step > patternDefaults.maxStep) {
            step = patternDefaults.maxStep;
        }
        else if (step < patternDefaults.minStep) {
            step = patternDefaults.minStep;
        }
        
        var size = (pattern.width > 0 ? pattern.width : 8);		// толщина линий
        if (pattern.patternWidthFunction != null && prop != null) {
            size = pattern.patternWidthFunction(prop, indexes);
            notFunc = false;
        }
        if (size > patternDefaults.maxWidth) {
            size = patternDefaults.maxWidth;
        }
        else if (size < patternDefaults.minWidth) {
            size = patternDefaults.minWidth;
        }

        var op = style.fillOpacity;
        if (style.opacityFunction != null && prop != null) {
            op = style.opacityFunction(prop, indexes) / 100;
            notFunc = false;
        }
        
        var arr = (pattern.colors != null ? pattern.colors : []);
        var count = arr.length;
        var resColors = []
        var rgb = [0xff0000, 0x00ff00, 0x0000ff];
        for (var i = 0; i < count; i++) {
            var col = arr[i];
            if(pattern.patternColorsFunction[i] != null) {
                col =  (prop != null ? pattern.patternColorsFunction[i](prop, indexes): rgb[i%3]);
                notFunc = false;
            }
            resColors.push(col);
        }

        var delta = size + step,
            allSize = delta * count,
            center = 0,	radius = 0,	rad = 0,
            hh = allSize,				// высота битмапа
            ww = allSize,				// ширина битмапа
            type = pattern.style, 
            flagRotate = false;

        if (type == 'diagonal1' || type == 'diagonal2' || type == 'cross' || type == 'cross1') {
            flagRotate = true;
        } else if (type == 'circle') {
            ww = hh = 2 * delta;
            center = Math.floor(ww / 2);	// центр круга
            radius = Math.floor(size / 2);	// радиус
            rad = 2 * Math.PI / count;		// угол в рад.
        }
        if (ww * hh > patternDefaults.maxWidth) {
            console.log({'func': 'getPatternIcon', 'Error': 'MAX_PATTERN_SIZE', 'alert': 'Bitmap from pattern is too big'});
            return null;
        }

        var canvas = document.createElement('canvas');
        canvas.width = ww, canvas.height = hh;
        var ptx = canvas.getContext('2d');
        ptx.clearRect(0, 0, canvas.width , canvas.height);
        if (type === 'diagonal2' || type === 'vertical') {
            ptx.translate(ww, 0);
            ptx.rotate(Math.PI/2);
        }

        for (var i = 0; i < count; i++) {
            ptx.beginPath();
            var fillStyle = gmxAPIutils.dec2color(resColors[i], op);
            ptx.fillStyle = fillStyle;

            if (flagRotate) {
                var x1 = i * delta; var xx1 = x1 + size;
                ptx.moveTo(x1, 0); ptx.lineTo(xx1, 0); ptx.lineTo(0, xx1); ptx.lineTo(0, x1); ptx.lineTo(x1, 0);

                x1 += allSize; xx1 = x1 + size;
                ptx.moveTo(x1, 0); ptx.lineTo(xx1, 0); ptx.lineTo(0, xx1); ptx.lineTo(0, x1); ptx.lineTo(x1, 0);
                if (type === 'cross' || type === 'cross1') {
                    x1 = i * delta; xx1 = x1 + size;
                    ptx.moveTo(ww, x1); ptx.lineTo(ww, xx1); ptx.lineTo(ww - xx1, 0); ptx.lineTo(ww - x1, 0); ptx.lineTo(ww, x1);

                    x1 += allSize; xx1 = x1 + size;
                    ptx.moveTo(ww, x1); ptx.lineTo(ww, xx1); ptx.lineTo(ww - xx1, 0); ptx.lineTo(ww - x1, 0); ptx.lineTo(ww, x1);
                }
            } else if (type == 'circle') {
                ptx.arc(center, center, size, i*rad, (i+1)*rad);
                ptx.lineTo(center, center);
            } else {
                ptx.fillRect(0, i * delta, ww, size);
            }
            ptx.closePath();
            ptx.fill();
        }
        var canvas1 = document.createElement('canvas');
        canvas1.width = ww
        canvas1.height = hh;
        var ptx1 = canvas1.getContext('2d');
        ptx1.drawImage(canvas, 0, 0, ww, hh);
        return { 'notFunc': notFunc, 'canvas': canvas1 };
    }
    ,
    toPixels: function(p, tpx, tpy, mInPixel) { // get pixel point
        var px1 = p[0] * mInPixel; 	px1 = (0.5 + px1) << 0;
        var py1 = p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
        return [px1 - tpx, tpy - py1];
    },

    getPixelPoint: function(attr, coords) {
        var gmx = attr.gmx,
            mInPixel = gmx.mInPixel,
            item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys || {},
            style = attr.style || {},
            scale = attr.scale || style.scale,
            sx = currentStyle.sx || style.sx || 4,
            sy = currentStyle.sy || style.sy || 4,
            px = attr.tpx,
            py = attr.tpy;

        if(scale) {
            sx *= scale, sy *= scale;
        }
        var px1 = coords[0] * mInPixel - px,
            py1 = py - coords[1] * mInPixel;
        
        return ((py1 - sy) > 255 || (px1 - sx) > 255 || (px1 + sx) < 0 || (py1 + sy) < 0) 
            ? null
            : {
                sx: sx,
                sy: sy,
                px1: (0.5 + px1) << 0,
                py1: (0.5 + py1) << 0
            }
        ;
    },

    pointToCanvas: function(attr) {				// Точку в canvas
        var gmx = attr.gmx,
            pointAttr = attr.pointAttr,
            style = attr.style || {},
            sx = pointAttr.sx,
            sy = pointAttr.sy,
            px1 = pointAttr.px1,
            py1 = pointAttr.py1;

        var item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys,
            px1sx = px1 - sx, py1sy = py1 - sy,
            sx2 = 2 * sx, sy2 = 2 * sy,
            ctx = attr.ctx;

        if(style.image) {
            style.rotateRes = currentStyle.rotate || 0;
            if('opacity' in style) ctx.globalAlpha = currentStyle.opacity || style.opacity;
            if(gmx.transformFlag) {
                ctx.setTransform(gmx.mInPixel, 0, 0, gmx.mInPixel, -attr.tpx, attr.tpy);
                ctx.drawImage(style.image, px1sx, -py1sy, sx2, sy2);
                ctx.setTransform(gmx.mInPixel, 0, 0, -gmx.mInPixel, -attr.tpx, attr.tpy);
            } else if(style.rotateRes) {
                ctx.translate(px1, py1);
                ctx.rotate(gmxAPIutils.deg_rad(style.rotateRes));
                ctx.translate(-px1, -py1);
                ctx.drawImage(style.image, px1sx, py1sy, sx2, sy2);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            } else {
                ctx.drawImage(style.image, px1sx, py1sy, sx2, sy2);
            }
            if('opacity' in style) ctx.globalAlpha = 1;
        } else if(style.fillColor || currentStyle.fillRadialGradient) {
            ctx.beginPath();
            if(style.type === 'circle' || currentStyle.fillRadialGradient) {
                var circle = style.iconGeomSize;
                if(currentStyle.fillRadialGradient) {
                    var rgr = currentStyle.fillRadialGradient,
                        radgrad = ctx.createRadialGradient(px1+rgr.x1, py1+rgr.y1, rgr.r1, px1+rgr.x2, py1+rgr.y2, rgr.r2);
                    for (var i = 0, len = rgr.addColorStop.length; i < len; i++) {
                        var arr = rgr.addColorStop[i];
                        radgrad.addColorStop(arr[0], arr[1]);
                    }
                    ctx.fillStyle = radgrad;
                    circle = rgr.r2;
                }
                ctx.arc(px1, py1, circle, 0, 2*Math.PI);
            } else {
                ctx.fillRect(px1sx, py1sy, sx2, sy2);
            }
            ctx.fill();
        }
        if(currentStyle.strokeStyle) {
            ctx.beginPath();
            if(style.circle) {
                ctx.arc(px1, py1, style.iconGeomSize, 0, 2*Math.PI);
            } else {
                ctx.strokeRect(px1sx, py1sy, sx2, sy2);
            }
            ctx.stroke();
        }
    },
    lineToCanvas: function(attr) {  // Lines in canvas
		var gmx = attr.gmx,
            coords = attr.coords,
            ctx = attr.ctx;

        var lastX = null, lastY = null;
		if(attr.style.strokeStyle) {
			ctx.beginPath();
			for (var i = 0, len = coords.length; i < len; i++) {
                var p1 = gmxAPIutils.toPixels(coords[i], attr.tpx, attr.tpy, gmx.mInPixel);
				if(lastX !== p1[0] || lastY !== p1[1]) {
					if(i == 0)	ctx.moveTo(p1[0], p1[1]);
					else 		ctx.lineTo(p1[0], p1[1]);
					lastX = p1[0], lastY = p1[1];
				}
			}
			ctx.stroke();
		}
	},

    polygonToCanvas: function(attr) {       // Polygons in canvas
        if(attr.coords.length === 0) return null;
        var gmx = attr.gmx,
            mInPixel = gmx.mInPixel,
            flagPixels = attr.flagPixels || false,
            hiddenLines = attr.hiddenLines || [],
            coords = attr.coords,
            len = coords.length,
            ctx = attr.ctx,
            px = attr.tpx,
            py = attr.tpy,
            cnt = 0, cntHide = 0,
            lastX = null, lastY = null,
            pixels = [], hidden = [];

        ctx.beginPath();
        for (var i = 0; i < len; i++) {
            var lineIsOnEdge = false;
            if(i == hiddenLines[cntHide]) {
                lineIsOnEdge = true;
                cntHide++;
            }
            var p1 = [coords[i][0], coords[i][1]];
            if (!flagPixels) p1 = [p1[0] * mInPixel, p1[1] * mInPixel];
            var p2 = [(0.5 + p1[0] - px) << 0, (0.5 + py - p1[1]) << 0];

            if(lastX !== p2[0] || lastY !== p2[1]) {
                lastX = p2[0], lastY = p2[1];
                ctx[(lineIsOnEdge ? 'moveTo' : 'lineTo')](p2[0], p2[1]);
                if(!flagPixels) {
                    //pixels.push([L.Util.formatNum(p1[0], 2), L.Util.formatNum(p1[1], 2)]);
                    pixels.push([p1[0], p1[1]]);
                    if(lineIsOnEdge) hidden.push(cnt);
                }
                cnt++;
            }
        }
        if(cnt === 1) ctx.lineTo(lastX + 1, lastY);
        ctx.stroke();
        return flagPixels ? null : { coords: pixels, hidden: hidden };
    },

    polygonToCanvasFill: function(attr) {     // Polygon fill
        if (attr.coords.length < 3) return;
        var gmx = attr.gmx,
            mInPixel = gmx.mInPixel,
            flagPixels = attr.flagPixels || false,
            coords = attr.coords,
            len = coords.length,
            px = attr.tpx,
            py = attr.tpy,
            ctx = attr.ctx;

        ctx.lineWidth = 0;
        var p1 = flagPixels ? coords[0] : [coords[0][0] * mInPixel, coords[0][1] * mInPixel],
            p2 = [(0.5 + p1[0] - px) << 0, (0.5 + py - p1[1]) << 0];
        ctx.moveTo(p2[0], p2[1]);
        for (var i = 1; i < len; i++) {
            p1 = flagPixels ? coords[i] : [coords[i][0] * mInPixel, coords[i][1] * mInPixel];
            p2 = [(0.5 + p1[0] - px) << 0, (0.5 + py - p1[1]) << 0];
            ctx.lineTo(p2[0], p2[1]);
        }
    },
    isPatternNode: function(it) {
        return it instanceof HTMLCanvasElement || it instanceof HTMLImageElement;
    },

    labelCanvasContext: null    // 2dContext canvas for Label size
    ,
    getLabelWidth: function(txt, style) {   // Get label size Label
        if(style) {
            if(!gmxAPIutils.labelCanvasContext) {
                var canvas = document.createElement('canvas');
                canvas.width = canvas.height = 512;
                gmxAPIutils.labelCanvasContext = canvas.getContext('2d');
            }
            var ptx = gmxAPIutils.labelCanvasContext;
            ptx.clearRect(0, 0, 512, 512);
            
            if (ptx.font !== style.font) ptx.font = style.font;
            //if (ptx.strokeStyle !== style.strokeStyle) ptx.strokeStyle = style.strokeStyle;
            if (ptx.fillStyle !== style.fillStyle) ptx.fillStyle = style.fillStyle;
            ptx.fillText(txt, 0, 0);
            return ptx.measureText(txt).width;
        }
        return 0;
    }
    ,
    setLabel: function(ctx, txt, coord, style) {
        var x = coord[0],
            y = coord[1];

        if(ctx.shadowColor !== style.shadowColor) ctx.shadowColor = style.shadowColor;
        if(ctx.shadowBlur !== style.shadowBlur) ctx.shadowBlur = style.shadowBlur;
        if(ctx.font !== style.font) ctx.font = style.font;
        if(ctx.strokeStyle !== style.strokeStyle) ctx.strokeStyle = style.strokeStyle;
        if(ctx.fillStyle !== style.fillStyle) ctx.fillStyle = style.fillStyle;
        ctx.strokeText(txt, x, y);
        ctx.fillText(txt, x, y);
    }
    ,worldWidthMerc: 20037508
    ,r_major: 6378137.000
    ,
    deg_rad: function(ang) {
        return ang * (Math.PI/180.0);
    },

	distVincenty: function(lon1, lat1, lon2, lat2) {
		var p1 = {
            lon: gmxAPIutils.deg_rad(lon1),
            lat: gmxAPIutils.deg_rad(lat1)
        },
            p2 = {
            lon: gmxAPIutils.deg_rad(lon2),
            lat: gmxAPIutils.deg_rad(lat2)
        },
            a = gmxAPIutils.r_major,
            b = 6356752.3142,
            f = 1/298.257223563;  // WGS-84 ellipsiod

        var L1 = p2.lon - p1.lon,
            U1 = Math.atan((1-f) * Math.tan(p1.lat)),
            U2 = Math.atan((1-f) * Math.tan(p2.lat)),
            sinU1 = Math.sin(U1), cosU1 = Math.cos(U1),
            sinU2 = Math.sin(U2), cosU2 = Math.cos(U2),
            lambda = L1,
            lambdaP = 2*Math.PI,
            iterLimit = 20;
		while (Math.abs(lambda-lambdaP) > 1e-12 && --iterLimit>0) {
				var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda),
                    sinSigma = Math.sqrt((cosU2*sinLambda) * (cosU2*sinLambda) + 
					(cosU1*sinU2-sinU1*cosU2*cosLambda) * (cosU1*sinU2-sinU1*cosU2*cosLambda));
				if (sinSigma == 0) return 0;
				var cosSigma = sinU1*sinU2 + cosU1*cosU2*cosLambda,
                    sigma = Math.atan2(sinSigma, cosSigma),
                    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma,
                    cosSqAlpha = 1 - sinAlpha*sinAlpha,
                    cos2SigmaM = cosSigma - 2*sinU1*sinU2/cosSqAlpha;
				if (isNaN(cos2SigmaM)) cos2SigmaM = 0;
				var C = f/16*cosSqAlpha*(4+f*(4-3*cosSqAlpha));
				lambdaP = lambda;
				lambda = L1 + (1-C) * f * sinAlpha *
					(sigma + C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
		}
		if (iterLimit==0) return NaN

		var uSq = cosSqAlpha * (a*a - b*b) / (b*b),
            A = 1 + uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq))),
            B = uSq/1024 * (256+uSq*(-128+uSq*(74-47*uSq))),
            deltaSigma = B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-
				B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM))),
            s = b*A*(sigma-deltaSigma);

		s = s.toFixed(3);
		return s;
	},

	pad2: function(t) {
		return (t < 10) ? ("0" + t) : ("" + t);
	},

	trunc: function(x) {
		return ("" + (Math.round(10000000*x)/10000000 + 0.00000001)).substring(0, 9);
	},

	formatDegrees: function(angle) {
		angle = Math.round(10000000*angle)/10000000 + 0.00000001;
		var a1 = Math.floor(angle);
		var a2 = Math.floor(60*(angle - a1));
		var a3 = gmxAPIutils.pad2(3600*(angle - a1 - a2/60)).substring(0, 2);
		return gmxAPIutils.pad2(a1) + "°" + gmxAPIutils.pad2(a2) + "'" + a3 + '"';
	},

	LatLon_formatCoordinates: function(x, y) {
		return  gmxAPIutils.formatDegrees(Math.abs(y)) + (y > 0 ? " N, " : " S, ") + 
			gmxAPIutils.formatDegrees(Math.abs(x)) + (x > 0 ? " E" : " W");
	},

	formatCoordinates: function(x, y) {
		return  gmxAPIutils.LatLon_formatCoordinates(x, y);
	},

	LatLon_formatCoordinates2: function(x, y) {
		return  gmxAPIutils.trunc(Math.abs(y)) + (y > 0 ? " N, " : " S, ") + 
			gmxAPIutils.trunc(Math.abs(x)) + (x > 0 ? " E" : " W");
	}
	,
	formatCoordinates2: function(x, y) {
		return  gmxAPIutils.LatLon_formatCoordinates2(x, y);
	},

    getPixelScale: function(zoom) {
        return 256 / gmxAPIutils.tileSizes[zoom];
    },

	forEachPoint: function(coords, callback)
	{
		if (!coords || coords.length == 0) return [];
		if (!coords[0].length)
		{
			if (coords.length == 2)
				return callback(coords);
			else
			{
				var ret = [];
				for (var i = 0; i < coords.length/2; i++)
					ret.push(callback([coords[i*2], coords[i*2 + 1]]));
				return ret;
			}
		}
		else
		{
			var ret = [];
			for (var i = 0; i < coords.length; i++) {
				if(typeof(coords[i]) != 'string') ret.push(this.forEachPoint(coords[i], callback));
			}
			return ret;
		}
	}
	,

	getQuicklookPoints: function(coord)	{		// получить 4 точки привязки снимка
		var d1 = Number.MAX_VALUE;
		var d2 = Number.MAX_VALUE;
		var d3 = Number.MAX_VALUE;
		var d4 = Number.MAX_VALUE;
		var x1, y1, x2, y2, x3, y3, x4, y4;
		this.forEachPoint(coord, function(p)
		{
			var x = p[0];
			var y = p[1];
			if ((x - y) < d1)
			{
				d1 = x - y;
				x1 = p[0];
				y1 = p[1];
			}
			if ((-x - y) < d2)
			{
				d2 = -x - y;
				x2 = p[0];
				y2 = p[1];
			}
			if ((-x + y) < d3)
			{
				d3 = -x + y;
				x3 = p[0];
				y3 = p[1];
			}
			if ((x + y) < d4)
			{
				d4 = x + y;
				x4 = p[0];
				y4 = p[1];
			}
		});
		return {x1: x1, y1: y1, x2: x2, y2: y2, x3: x3, y3: y3, x4: x4, y4: y4};
	}
    ,
    isPointInPolygonArr: function(chkPoint, poly) { // Проверка точки на принадлежность полигону в виде массива
        var isIn = false,
            x = chkPoint[0], 
            y = chkPoint[1],
            p1 = poly[0];
        for (var i = 1, len = poly.length; i < len; i++)
        {
            var p2 = poly[i];
            var xmin = Math.min(p1[0], p2[0]);
            var xmax = Math.max(p1[0], p2[0]);
            var ymax = Math.max(p1[1], p2[1]);
            if (x > xmin && x <= xmax && y <= ymax && p1[0] != p2[0]) {
                var xinters = (x - p1[0])*(p2[1] - p1[1])/(p2[0] - p1[0]) + p1[1];
                if (p1[1] == p2[1] || y <= xinters) isIn = !isIn;
            }
            p1 = p2;
        }
        return isIn;
    }
    ,
    isPointInPolygonWithHoles: function(chkPoint, coords) {
        var flag = false;
        if (!gmxAPIutils.isPointInPolygonArr(chkPoint, coords[0])) return false;
        flag = true;
        for (var j = 1, len = coords.length; j < len; j++) {
            if (gmxAPIutils.isPointInPolygonArr(chkPoint, coords[j])) return false;
        }
        return true;
    },

    isPointInPolyLine: function(chkPoint, lineHeight, coords, hiddenLines) {
        // Проверка точки(с учетом размеров) на принадлежность линии
        var dx = chkPoint[0], dy = chkPoint[1],
            nullPoint = { x: dx, y: dy },
            minx = dx - lineHeight, maxx = dx + lineHeight,
            miny = dy - lineHeight, maxy = dy + lineHeight,
            cntHide = 0;

        lineHeight *= lineHeight;
        for (var i = 1, len = coords.length; i < len; i++) {
            if(hiddenLines && i == hiddenLines[cntHide]) {
                cntHide++;
            } else {
                var p1 = coords[i-1], p2 = coords[i],
                    x1 = p1[0], y1 = p1[1],
                    x2 = p2[0], y2 = p2[1];
                
                if(!(Math.max(x1, x2) < minx
                    || Math.min(x1, x2) > maxx
                    || Math.max(y1, y2) < miny
                    || Math.min(y1, y2) > maxy)) {
                    var sqDist = L.LineUtil._sqClosestPointOnSegment(nullPoint, { x: x1, y: y1 }, { x: x2, y: y2 }, true);
                    if(sqDist < lineHeight) {
                        return true;
                    }
                }
            }
        }
        return false;
    },

    isPointInLines: function (attr) {
        var arr = attr.coords,
            point = attr.point,
            delta = attr.delta,
            boundsArr = attr.boundsArr,
            hidden = attr.hidden;
        for (var j = 0, len = arr.length, flag = false; j < len; j++) {
            flag = boundsArr[j] ? boundsArr[j].contains(point) : true;
            if (flag
                && gmxAPIutils.isPointInPolyLine(point, delta, arr[j], hidden ? hidden[j] : null)
            ) {
               return true;
            }
        }
        return false;
    },

    getLength: function(latlngs) {
        var length = 0;
        if (latlngs && latlngs.length) {
            var lng = false, lat = false;
            latlngs.forEach(function(latlng) {
                if (lng !== false && lat !== false)
                    length += parseFloat(gmxAPIutils.distVincenty(lng, lat, latlng.lng, latlng.lat));
                lng = latlng.lng;
                lat = latlng.lat;
            });
        }
        return length;
    },

    prettifyDistance: function(length, type) {
        var km = ' ' + L.gmxLocale.getText('units.km');
        if (type === 'km')
            return (Math.round(length)/1000) + km;
        if (length < 2000 || type === 'm')
            return Math.round(length) + ' ' + L.gmxLocale.getText('units.m');
        if (length < 200000)
            return (Math.round(length/10)/100) + km;
        return Math.round(length/1000) + km;
    },

    getArea: function(arr) {
        var area = 0;
        for(var i=0, len = arr.length; i<len; i++) {
            var ipp = (i == (len - 1) ? 0 : i + 1),
                p1 = arr[i], p2 = arr[ipp];
            area += p1.lng * Math.sin(gmxAPIutils.deg_rad(p2.lat)) - p2.lng * Math.sin(gmxAPIutils.deg_rad(p1.lat));
        }
        var out = Math.abs(area * gmxAPIutils.lambertCoefX * gmxAPIutils.lambertCoefY/2);
        return out;
    },

    prettifyArea: function(area, type) {
        var km2 = ' ' + L.gmxLocale.getText('units.km2');

        if (type === 'km2')
            return ("" + (Math.round(area/100)/10000)) + km2;
        if (type === 'ha')
            return ("" + (Math.round(area/100)/100)) + ' ' + L.gmxLocale.getText('units.ha');

        if (area < 100000 || type === 'm2')
            return Math.round(area) + ' ' + L.gmxLocale.getText('units.m2');
        if (area < 3000000)
            return ("" + (Math.round(area/1000)/1000)).replace(".", ",") + km2;
        if (area < 30000000)
            return ("" + (Math.round(area/10000)/100)).replace(".", ",") + km2;
        if (area < 300000000)
            return ("" + (Math.round(area/100000)/10)).replace(".", ",") + km2;
        return (Math.round(area/1000000)) + km2;
    },

    geoLength: function(geom) {
        var ret = 0;
        if (geom.type == "MULTILINESTRING") {
            for (var i = 0, len = geom.coordinates.length; i < len; i++)
                ret += gmxAPIutils.geoLength({ type: "LINESTRING", coordinates: geom.coordinates[i] });
            return ret;
        } else if (geom.type == "LINESTRING") {
            ret = gmxAPIutils(geom.coordinates[0]);
            for (var i = 1; i < geom.coordinates.length; i++)
                ret -= gmxAPIutils.geoLength(geom.coordinates[i]);
            return ret;
        }
        else if (geom.length)
        {
            var latlngs = [];
            //gmxAPIutils.forEachPoint(geom, function(p) { pts.push(p); });
            return gmxAPIutils.getLength(latlngs);
        }
        else
            return 0;
    },

    geometryToGeoJSON: function (geom) {
        return L.GeoJSON.asFeature({
            type: geom.type === 'MULTIPOLYGON' ? 'MultiPolygon'
                : geom.type === 'POLYGON' ? 'Polygon'
                : geom.type === 'MULTILINESTRING' ? 'MultiLineString'
                : geom.type === 'LINESTRING' ? 'LineString'
                : geom.type === 'MULTIPOINT' ? 'MultiPoint'
                : geom.type === 'POINT' ? 'Point'
                : geom.type,
            coordinates: geom.coordinates
        });
    },

    geoArea: function(geom) {
        var ret = 0;
        if (geom.type == "MULTIPOLYGON") {
            for (var i = 0, len = geom.coordinates.length; i < len; i++)
                ret += gmxAPIutils.geoArea({ type: "POLYGON", coordinates: geom.coordinates[i] });
            return ret;
        } else if (geom.type == "POLYGON") {
            ret = gmxAPIutils.geoArea(geom.coordinates[0]);
            for (var i = 1; i < geom.coordinates.length; i++)
                ret -= gmxAPIutils.geoArea(geom.coordinates[i]);
            return ret;
        }
        else if (geom.length)
        {
            var latlngs = [];
            gmxAPIutils.forEachPoint(geom, function(p) {
                latlngs.push(L.Projection.Mercator.unproject({y: p[1], x: p[0]}));
            });
            return gmxAPIutils.getArea(latlngs);
        }
        else
            return 0;
    },

    getGeometriesSummary: function(arr, units) {
        var out = '',
            type = '',
            res = 0;
        arr.forEach(function(geom) {
            if(geom) {
                type = geom.type;
                if (type.indexOf("POINT") != -1) {
                    var latlng = L.Projection.Mercator.unproject({y: geom.coordinates[1], x: geom.coordinates[0]});
                    out = '<b>' + L.gmxLocale.getText('Coordinates') + '</b>: '
                        + gmxAPIutils.formatCoordinates(latlng.lng, latlng.lat);
                } else if (type.indexOf("LINESTRING") != -1) {
                    res += gmxAPIutils.geoLength(geom);
                } else if (type.indexOf("POLYGON") != -1) {
                    res += gmxAPIutils.geoArea(geom);
                }
            }
        });
        if (!out) {
            if (type.indexOf("LINESTRING") != -1) {
                out = '<b>' + L.gmxLocale.getText('Length') + '</b>: '
                    + gmxAPIutils.prettifyDistance(res, units.length);
            } else if (type.indexOf("POLYGON") != -1) {
                out = '<b>' + L.gmxLocale.getText('Area') + '</b>: '
                    + gmxAPIutils.prettifyArea(res, units.square);
            }
        }
        return out;
    },

    getGeometrySummary: function(geom, units) {
        return gmxAPIutils.getGeometriesSummary([geom], units);
    },

    chkOnEdge: function(p1, p2, ext) { // отрезок на границе
        if ((p1[0] < ext.min.x && p2[0] < ext.min.x) || (p1[0] > ext.max.x && p2[0] > ext.max.x)) return true;
        if ((p1[1] < ext.min.y && p2[1] < ext.min.y) || (p1[1] > ext.max.y && p2[1] > ext.max.y)) return true;
        return false;
    },

    getHidden: function(coords, tb) {  // массив точек на границах тайлов
        var hiddenLines = [],
            prev = null;
        for (var i = 0, len = coords.length; i < len; i++) {
            var p = coords[i];
            if(prev && gmxAPIutils.chkOnEdge(p, prev, tb)) {
                hiddenLines.push(i);
            }
            prev = p;
        }
        return hiddenLines;
    },

    getTileBounds: function(x, y, z) {  //x, y, z - GeoMixer tile coordinates
        var tileSize = gmxAPIutils.tileSizes[z],
            minx = x * tileSize, 
            miny = y * tileSize;
        return gmxAPIutils.bounds([[minx, miny], [minx + tileSize, miny + tileSize]]);
    },

    styleKeys: {
        marker: {
            server: ['image',   'angle',     'scale',     'minScale',     'maxScale',     'size',         'circle',     'center',     'color'],
            client: ['iconUrl', 'iconAngle', 'iconScale', 'iconMinScale', 'iconMaxScale', 'iconGeomSize', 'iconCircle', 'iconCenter', 'iconColor']
        },
        outline: {
            server: ['color',  'opacity',   'thickness', 'dashes'],
            client: ['color',  'opacity',   'weight',    'dashArray']
        },
        fill: {
            server: ['color',     'opacity',   'image',       'pattern',     'radialGradient',     'linearGradient'],
            client: ['fillColor', 'fillOpacity', 'fillImage', 'fillPattern', 'fillRadialGradient', 'fillLinearGradient']
        },
        label: {
            server: ['text',      'field',      'color',      'haloColor',      'size',          'spacing',      'align'],
            client: ['labelText', 'labelField', 'labelColor', 'labelHaloColor', 'labelFontSize', 'labelSpacing', 'labelAlign']
        }
    },
    styleFuncKeys: {
        'iconGeomSize': 'iconGeomSizeFunction',
        'iconAngle': 'rotateFunction',
        'iconScale': 'scaleFunction',
        'color': 'colorFunction',
        'fillColor': 'fillColorFunction'
    },

    toServerStyle: function(style) {   // Style leaflet->Scanex
        var out = {};

        for (var key in gmxAPIutils.styleKeys) {
            var keys = gmxAPIutils.styleKeys[key];
            keys.client.forEach(function(key1, i) {
                if (key1 in style) {
                    if (!out[key]) out[key] = {};
                    out[key][keys.server[i]] = style[key1];
                }
            });
        }
        if ('iconAnchor' in style) {
            if (!out.marker) out.marker = {};
            out.marker.dx = style.iconAnchor[0];
            out.marker.dy = style.iconAnchor[1];
        }
        return out;
    },

    fromServerStyle: function(style) {   // Style Scanex->leaflet
        var out = {
            type: ''    // 'polygon', 'line', 'circle', 'square', 'image'
        };

        for (var key in gmxAPIutils.styleKeys) {
            var st = style[key];
            if (st && typeof(st) === 'object') {
                var keys = gmxAPIutils.styleKeys[key];
                keys.server.forEach(function(key1, i) {
                    if (key1 in st) {
                        var newKey = keys.client[i],
                            zn = st[key1];
                        if (typeof(zn) === 'string') {
                            if (gmxAPIutils.styleFuncKeys[newKey]) {
                                if (zn.match(/[^\d\.]/) === null) zn = Number(zn);
                                else {
                                    out[gmxAPIutils.styleFuncKeys[newKey]] = gmxParsers.parseExpression(zn);
                                }
                            }
                        } else if (key1 === 'opacity') {
                            zn /= 100;
                        }
                        out[newKey] = zn;
                    }
                });
            }
        }
        if (style.marker) {
            var st = style.marker;
            if ('dx' in st || 'dy' in st) {
                out.iconAnchor = [st.dx || 0, st.dy || 0];
            }
        }
        return out;
    }
}

gmxAPIutils.lambertCoefX = 100*gmxAPIutils.distVincenty(0, 0, 0.01, 0);				// 111319.5;
gmxAPIutils.lambertCoefY = 100*gmxAPIutils.distVincenty(0, 0, 0, 0.01)*180/Math.PI;	// 6335440.712613423;

!function() {
    //pre-calculate tile sizes
    for (var z = 0; z < 30; z++) {
        gmxAPIutils.tileSizes[z] = 40075016.685578496 / Math.pow(2, z);
    }
}()

gmxAPIutils.Bounds = function(arr) {
    this.min = {
        x: Number.MAX_VALUE,
        y: Number.MAX_VALUE
    };
    this.max = {
        x: -Number.MAX_VALUE,
        y: -Number.MAX_VALUE
    };
    this.extendArray(arr);
};
gmxAPIutils.Bounds.prototype = {
    extend: function(x, y) {
        if (x < this.min.x) this.min.x = x;
        if (x > this.max.x) this.max.x = x;
        if (y < this.min.y) this.min.y = y;
        if (y > this.max.y) this.max.y = y;
        return this;
    },
    extendBounds: function(bounds) {
        return this.extendArray([[bounds.min.x, bounds.min.y], [bounds.max.x, bounds.max.y]]);
    },
    extendArray: function(arr) {
        if (!arr) { return this };
        for(var i=0, len=arr.length; i<len; i++) {
            this.extend(arr[i][0], arr[i][1]);
        }
        return this;
    },
    addBuffer: function(dxmin, dymin, dxmax, dymax) {
        this.min.x -= dxmin;
        this.min.y -= dymin || dxmin;
        this.max.x += dxmax || dxmin;
        this.max.y += dymax || dxmin;
        return this;
    },
    contains: function (point) { // ([x, y]) -> Boolean
        var min = this.min, max = this.max,
            x = point[0], y = point[1];
        return x > min.x && x < max.x && y > min.y && y < max.y;
    },
    intersects: function (bounds) { // (Bounds) -> Boolean
        var min = this.min,
            max = this.max,
            min2 = bounds.min,
            max2 = bounds.max;
        return max2.x > min.x && min2.x < max.x && max2.y > min.y && min2.y < max.y;
    },
    intersectsWithDelta: function (bounds, dx, dy) { // (Bounds, dx, dy) -> Boolean
        var min = this.min,
            max = this.max,
            x = dx || 0,
            y = dy || 0,
            min2 = bounds.min,
            max2 = bounds.max;
        return max2.x + x > min.x && min2.x - x < max.x && max2.y + y > min.y && min2.y - y < max.y;
    },
    clipPolygon: function (coords) { // (coords) -> clip coords
        var min = this.min,
            max = this.max,
            clip = [[min.x, min.y], [max.x, min.y], [max.x, max.y], [min.x, max.y]],
            cp1, cp2, s, e,
            inside = function (p) {
                return (cp2[0]-cp1[0])*(p[1]-cp1[1]) > (cp2[1]-cp1[1])*(p[0]-cp1[0]);
            },
            intersection = function () {
                var dc = [ cp1[0] - cp2[0], cp1[1] - cp2[1] ],
                    dp = [ s[0] - e[0], s[1] - e[1] ],
                    n1 = cp1[0] * cp2[1] - cp1[1] * cp2[0],
                    n2 = s[0] * e[1] - s[1] * e[0], 
                    n3 = 1.0 / (dc[0] * dp[1] - dc[1] * dp[0]);
                return [(n1*dp[0] - n2*dc[0]) * n3, (n1*dp[1] - n2*dc[1]) * n3];
            };

        var outputList = coords;
        cp1 = clip[clip.length-1];
        for (var j in clip) {
            var cp2 = clip[j],
                inputList = outputList;
            outputList = [];
            s = inputList[inputList.length - 1]; //last on the input list
            for (var i in inputList) {
                var e = inputList[i];
                if (inside(e)) {
                    if (!inside(s)) outputList.push(intersection());
                    outputList.push(e);
                } else if (inside(s)) {
                    outputList.push(intersection());
                }
                s = e;
            }
            cp1 = cp2;
        }
        return outputList
    }
};

gmxAPIutils.bounds = function(arr) {
    return new gmxAPIutils.Bounds(arr);
};

L.gmxUtil = {
    requestJSONP: gmxAPIutils.requestJSONP,
    fromServerStyle: gmxAPIutils.fromServerStyle,
    toServerStyle: gmxAPIutils.toServerStyle,
    bounds: gmxAPIutils.bounds,
    tileSizes: gmxAPIutils.tileSizes,
    formatCoordinates: function (latlng, type) {
        return gmxAPIutils['formatCoordinates' + (type ? '2' : '')](latlng.lng, latlng.lat);
    },
    getLength: gmxAPIutils.getLength,
    prettifyDistance: gmxAPIutils.prettifyDistance,
    getArea: gmxAPIutils.getArea,
    prettifyArea: gmxAPIutils.prettifyArea,
    geoArea: gmxAPIutils.geoArea,
    getGeometriesSummary: gmxAPIutils.getGeometriesSummary,
    getGeometrySummary: gmxAPIutils.getGeometrySummary,
    getPropertiesHash: gmxAPIutils.getPropertiesHash,
    distVincenty: gmxAPIutils.distVincenty
};

!function() {

    //скопирована из API для обеспечения независимости от него
    function parseUri(str)
    {
        var	o   = parseUri.options,
            m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
            uri = {},
            i   = 14;

        while (i--) uri[o.key[i]] = m[i] || "";

        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
            if ($1) uri[o.q.name][$1] = $2;
        });

        uri.hostOnly = uri.host;
        uri.host = uri.authority; // HACK

        return uri;
    };

    parseUri.options = {
        strictMode: false,
        key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
        q:   {
            name:   "queryKey",
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };

    var requests = {};
    var lastRequestId = 0;
    
    var processMessage = function(e) {

        if (!(e.origin in requests)) {
            return;
        }
        
        var dataStr = decodeURIComponent(e.data.replace(/\n/g,'\n\\'));
        try {
            var dataObj = JSON.parse(dataStr);
        } catch (e) {
            request.callback && request.callback({Status:"error", ErrorInfo: {ErrorMessage: "JSON.parse exeption", ExceptionType: "JSON.parse", StackTrace: dataStr}});
        }
        var request = requests[e.origin][dataObj.CallbackName];
        if(!request) return;    // message от других запросов
        
        delete request[dataObj.CallbackName];
        delete dataObj.CallbackName;

        if(request.iframe.parentNode) request.iframe.parentNode.removeChild(request.iframe);
        request.callback && request.callback(dataObj);
    }
    
    L.DomEvent.on(window, 'message', processMessage);

    function createPostIframe2(id, callback, url)
    {
        var uniqueId = 'gmxAPIutils_id'+(lastRequestId++),
            iframe = L.DomUtil.create('iframe');

        iframe.style.display = 'none';
        iframe.setAttribute('id', id);
        iframe.setAttribute('name', id);
        iframe.src = 'javascript:true';
        iframe.callbackName = uniqueId;
        
        var parsedURL = parseUri(url);
        var origin = (parsedURL.protocol ? (parsedURL.protocol + ':') : window.location.protocol) + '//' + (parsedURL.host || window.location.host);
        
        requests[origin] = requests[origin] || {};
        requests[origin][uniqueId] = {callback: callback, iframe: iframe};

        return iframe;
    }
    
	//расширяем namespace
    gmxAPIutils.createPostIframe2 = createPostIframe2;

}();

// кроссдоменный POST запрос
(function()
{
	/** Посылает кроссдоменный POST запрос
	* @namespace utilities
    * @ignore
	* @function
	* 
	* @param url {string} - URL запроса
	* @param params {object} - хэш параметров-запросов
	* @param callback {function} - callback, который вызывается при приходе ответа с сервера. Единственный параметр ф-ции - собственно данные
	* @param baseForm {DOMElement} - базовая форма запроса. Используется, когда нужно отправить на сервер файл. 
	*                                В функции эта форма будет модифицироваться, но после отправления запроса будет приведена к исходному виду.
	*/
	function sendCrossDomainPostRequest(url, params, callback, baseForm)
	{
        var form,
            id = '$$iframe_' + gmxAPIutils.newId();

        var iframe = gmxAPIutils.createPostIframe2(id, callback, url),
            originalFormAction;
            
        if (baseForm)
        {
            form = baseForm;
            originalFormAction = form.getAttribute('action');
            form.setAttribute('action', url);
            form.target = id;
        }
        else
        {
            if(L.Browser.ielt9) {
                var str = '<form id=' + id + '" enctype="multipart/form-data" style="display:none" target="' + id + '" action="' + url + '" method="post"></form>';
                form = document.createElement(str);
            } else {
                form = document.createElement("form");
                form.style.display = 'none';
                form.setAttribute('enctype', 'multipart/form-data');
                form.target = id;
                form.setAttribute('method', 'POST');
                form.setAttribute('action', url);
                form.id = id;
            }
        }
        
        var hiddenParamsDiv = document.createElement("div");
        hiddenParamsDiv.style.display = 'none';
        
        if (params.WrapStyle === 'window') {
            params.WrapStyle = 'message';
        }
        
        if (params.WrapStyle === 'message') {
            params.CallbackName = iframe.callbackName;
        }
        
        for (var paramName in params)
        {
            var input = document.createElement("input");
            
            var value = typeof params[paramName] !== 'undefined' ? params[paramName] : '';
            
            input.setAttribute('type', 'hidden');
            input.setAttribute('name', paramName);
            input.setAttribute('value', value);
            
            hiddenParamsDiv.appendChild(input)
        }
        
        form.appendChild(hiddenParamsDiv);
        
        if (!baseForm)
            document.body.appendChild(form);
            
        document.body.appendChild(iframe);
        
        form.submit();
        
        if (baseForm)
        {
            form.removeChild(hiddenParamsDiv);
            if (originalFormAction !== null)
                form.setAttribute('action', originalFormAction);
            else
                form.removeAttribute('action');
        }
        else
        {
            form.parentNode.removeChild(form);
        }
	}
	//расширяем namespace
	gmxAPIutils.sendCrossDomainPostRequest = sendCrossDomainPostRequest;
})();
