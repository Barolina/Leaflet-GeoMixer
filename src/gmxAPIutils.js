var gmxAPIutils = {
	lastMapId: 0,
    
	newMapId: function()
	{
		gmxAPIutils.lastMapId += 1;
		return "random_" + gmxAPIutils.lastMapId;
	},
    
	uniqueGlobalName: function(thing)
	{
		var id = gmxAPIutils.newMapId();
		window[id] = thing;
		return id;
	},
    
    /** Sends JSONP requests 
      @return {gmxDeferred} Defered with server JSON resonse or error status
    */
	requestJSONP: function(url, params, callbackParamName) {
        var def = new gmxDeferred();
        callbackParamName = callbackParamName || 'CallbackName';
        
        var script = document.createElement("script");
        script.setAttribute("charset", "UTF-8");
        var callbackName = gmxAPIutils.uniqueGlobalName(function(obj)
        {
            delete window[callbackName];
            document.getElementsByTagName("head").item(0).removeChild(script);
            def.resolve(obj);
        });
        var urlParams = L.extend({}, params);
        urlParams[callbackParamName] = callbackName;
        
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
    
    tileSizes: [] // Размеры тайла по zoom
	,
    
    getTileNumFromLeaflet: function (tilePoint, zoom) {
		var pz = Math.pow(2, zoom);
		var tx = tilePoint.x % pz + (tilePoint.x < 0 ? pz : 0);
		var ty = tilePoint.y % pz + (tilePoint.y < 0 ? pz : 0);
		var gmxTilePoint = {
			'z': zoom
			,'x': tx % pz - pz/2
			,'y': pz/2 - 1 - ty % pz
		};
		return gmxTilePoint;
	},
    
	getTilePosZoomDelta: function(tilePoint, zoomFrom, zoomTo) {		// получить смещение тайла на меньшем zoom
		var dz = Math.pow(2, zoomFrom - zoomTo);
		var size = 256 / dz;
		var dx = tilePoint.x % dz;
		var dy = tilePoint.y % dz;
		return {
			size: size
			,zDelta: dz
			,x: size * (dx < 0 ? dz + dx : dx)
			,y: size * (dy < 0 ? 1 + dy : dz - 1 - dy)
		};
    }
	,
    //TODO: use L.Bounds? test performance?
	'bounds': function(arr) {							// получить bounds массива точек
		var res = {
			min: {
				x: Number.MAX_VALUE,
                y: Number.MAX_VALUE
			},
			max: {
				x: -Number.MAX_VALUE,
                y: -Number.MAX_VALUE
			},
			extend: function(x, y) {
				if (x < this.min.x) this.min.x = x;
				if (x > this.max.x) this.max.x = x;
				if (y < this.min.y) this.min.y = y;
				if (y > this.max.y) this.max.y = y;
                return this;
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
                this.min.y -= dymin;
                this.max.x += dxmax;
                this.max.y += dymax;
                return this;
            },
            //TODO: do we still need dx, dy?
			intersects: function (bounds, dx, dy) { // (Bounds, dx, dy) -> Boolean
				var min = this.min,
					max = this.max,
					dx = dx || 0,
					dy = dy || 0,
					min2 = bounds.min,
					max2 = bounds.max;
				return max2.x + dx > min.x && min2.x - dx < max.x && max2.y + dy > min.y && min2.y - dy < max.y;
			}
		};
        
		return res.extendArray(arr);
	}
	,
	'geoItemBounds': function(geoItem) {					// получить bounds векторного обьекта
		var geo = geoItem.geometry;
		var type = geo.type;
		var coords = geo.coordinates;
		var arr = [];
		var addToArr = function(pol) {
			for (var i = 0, len = pol.length; i < len; i++)	arr.push(pol[i]);
		}
		if(type === 'POINT') {
			arr.push(coords);
		} else if(type === 'MULTIPOINT') {
			for (var i = 0, len = coords.length; i < len; i++) addToArr(coords[i]);
		} else if(type === 'LINESTRING') {
			addToArr(coords);
		} else if(type === 'MULTILINESTRING') {
			for (var i = 0, len = coords.length; i < len; i++) addToArr(coords[i]);
		} else if(type === 'POLYGON') {
			coords.length && addToArr(coords[0]);			// дырки пропускаем
		} else if(type === 'MULTIPOLYGON') {
			for (var i = 0, len = coords.length; i < len; i++) addToArr(coords[i][0]);
		}
		return gmxAPIutils.bounds(arr);
	}
	,'dec2rgba': function(i, a)	{				// convert decimal to rgb
		var r = (i >> 16) & 255;
		var g = (i >> 8) & 255;
		var b = i & 255;
		return 'rgba('+r+', '+g+', '+b+', '+a+')';
	}
	,
	'oneDay': 60*60*24			// один день
	,
    'isTileKeysIntersects': function(tk1, tk2) { // пересечение по номерам двух тайлов
        if (tk1.z < tk2.z) {
            var t = tk1; tk1 = tk2; tk2 = t;
        }
        
        var dz = tk1.z - tk2.z
        return tk1.x >> dz === tk2.x && tk1.y >> dz === tk2.y;
	}
	,
	parseXML: function(str)
	{
		var xmlDoc;
		try
		{
			if (window.DOMParser)
			{
				parser = new DOMParser();
				xmlDoc = parser.parseFromString(str,"text/xml");
			}
			else // Internet Explorer
			{
				xmlDoc = new ActiveXObject("MSXML2.DOMDocument.3.0");
				xmlDoc.validateOnParse = false;
				xmlDoc.async = false;
				xmlDoc.loadXML(str);
			}
		}
		catch(e)
		{
			console.log({'func': 'parseXML', 'str': str, 'event': e, 'alert': e});
		}
		
		return xmlDoc;
	}
    ,
    'rotatePoints': function(arr, angle, scale, center) {			// rotate - массива точек
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
    'getPatternIcon': function(item, style) {			// получить bitmap стиля pattern
        if (!style.pattern) return null;

        var notFunc = true,
            pattern = style.pattern,
            prop = (item ? item.properties : {}),
            step = (pattern.step > 0 ? pattern.step : 0),		// шаг между линиями
            patternDefaults = {					// настройки для pattern стилей
                 minWidth: 1
                ,maxWidth: 1000
                ,minStep: 0
                ,maxStep: 1000
            };
        if (pattern.patternStepFunction != null && prop != null) {
            step = pattern.patternStepFunction(prop);
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
            size = pattern.patternWidthFunction(prop);
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
            op = style.opacityFunction(prop) / 100;
            notFunc = false;
        }
        
        var arr = (pattern.colors != null ? pattern.colors : []);
        var count = arr.length;
        var resColors = []
        var rgb = [0xff0000, 0x00ff00, 0x0000ff];
        for (var i = 0; i < count; i++) {
            var col = arr[i];
            if(pattern.patternColorsFunction[i] != null) {
                col =  (prop != null ? pattern.patternColorsFunction[i](prop): rgb[i%3]);
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
            var col = resColors[i];
            var fillStyle = gmxAPIutils.dec2rgba(col, 1);
            fillStyle = fillStyle.replace(/1\)/, op + ')');
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
	'toPixels': function(p, tpx, tpy, mInPixel) {				// получить координату в px
        var px1 = p[0] * mInPixel; 	px1 = (0.5 + px1) << 0;
        var py1 = p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
        return [px1 - tpx, tpy - py1];
    }
	,
	'pointToCanvas': function(attr) {				// Точку в canvas
		var gmx = attr.gmx,
            style = attr.style,
            coords = attr.coords,
            px = attr.tpx,
            py = attr.tpy,
            sx = attr.sx || style.sx || 4,
            sy = attr.sy || style.sy || 4,
            ctx = attr.ctx;

        if(gmx.transformFlag) {
            px /= gmx.mInPixel, py /= gmx.mInPixel;
            sx /= gmx.mInPixel, sy /= gmx.mInPixel;
        }
		// получить координату в px
        var p1 = gmx.transformFlag ? [coords[0], coords[1]] : gmxAPIutils.toPixels(coords, px, py, gmx.mInPixel);
		var px1 = p1[0];
		var py1 = p1[1];

		if(style.marker) {
			if(style.image) {
				if('opacity' in style) ctx.globalAlpha = style.opacity;
                if(gmx.transformFlag) {
                    ctx.setTransform(gmx.mInPixel, 0, 0, gmx.mInPixel, -attr.tpx, attr.tpy);
                    ctx.drawImage(style.image, px1 - sx, sy - py1, 2 * sx, 2 * sy);
                    ctx.setTransform(gmx.mInPixel, 0, 0, -gmx.mInPixel, -attr.tpx, attr.tpy);
				} else {
                    ctx.drawImage(style.image, px1 - sx, py1 - sy, 2 * sx, 2 * sy);
                }
                if('opacity' in style) ctx.globalAlpha = 1;
			} else if(style.polygons) {
				var rotateRes = style.rotate || 0;
				if(rotateRes && typeof(rotateRes) == 'string') {
					rotateRes = (style.rotateFunction ? style.rotateFunction(prop) : 0);
				}
				style.rotateRes = rotateRes || 0;

				for (var i = 0, len = style.polygons.length; i < len; i++)
				{
					var p = style.polygons[i];
					ctx.save();
					ctx.lineWidth = p['stroke-width'] || 0;
					ctx.fillStyle = p.fill_rgba || 'rgba(0, 0, 255, 1)';
					
					ctx.beginPath();
					var arr = gmxAPIutils.rotatePoints(p.points, style.rotateRes, style.scale, {x: sx, y: sy});
					for (var j = 0, len1 = arr.length; j < len1; j++)
					{
						var t = arr[j];
						if(j == 0)
							ctx.moveTo(px1 + t.x, py1 + t.y);
						else
							ctx.lineTo(px1 + t.x, py1 + t.y);
					}
					ctx.fill();
					ctx.restore();
				}
			}
		} else if(style.strokeStyle) {
			ctx.beginPath();
			if(style.circle) {
				ctx.arc(px1, py1, style.circle, 0, 2*Math.PI);
			} else {
				ctx.strokeRect(px1 - sx, py1 - sy, 2*sx, 2*sy);
			}
			ctx.stroke();
		}
		if(style.fill) {
			ctx.beginPath();
			if(style.circle) {
                if(style.radialGradient) {
                    var rgr = style.radialGradient;
                    var r1 = (rgr.r1Function ? rgr.r1Function(prop) : rgr.r1);
                    var r2 = (rgr.r2Function ? rgr.r2Function(prop) : rgr.r2);
                    var x1 = (rgr.x1Function ? rgr.x1Function(prop) : rgr.x1);
                    var y1 = (rgr.y1Function ? rgr.y1Function(prop) : rgr.y1);
                    var x2 = (rgr.x2Function ? rgr.x2Function(prop) : rgr.x2);
                    var y2 = (rgr.y2Function ? rgr.y2Function(prop) : rgr.y2);

                    var radgrad = ctx.createRadialGradient(px1+x1, py1+y1, r1, px1+x2, py1+y2,r2);  
                    for (var i = 0, len = style.radialGradient.addColorStop.length; i < len; i++)
                    {
                        var arr = style.radialGradient.addColorStop[i];
                        var arrFunc = style.radialGradient.addColorStopFunctions[i];
                        var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr[0]);
                        var p2 = (arr.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr[2]));
                        var p3 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr[1], p2/100);
                        radgrad.addColorStop(p0, p3);
                    }
                    ctx.fillStyle = radgrad;
                }
				ctx.arc(px1, py1, style.circle, 0, 2*Math.PI);
			} else {
				ctx.fillRect(px1 - sx, py1 - sy, 2*sx, 2*sy);
			}
			ctx.fill();
		}
	}
	,
	'lineToCanvas': function(attr) {				// Линии в canvas
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
	}
	,
	'polygonToCanvas': function(attr) {				// Полигон в canvas
        if(attr.coords.length === 0) return;
		var gmx = attr.gmx,
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
            if(!flagPixels) p1 = [p1[0] * gmx.mInPixel, p1[1] * gmx.mInPixel];
            var p2 = [(0.5 + p1[0] - px) << 0, (0.5 + py - p1[1]) << 0];
            //var p2 = [(0.5 + p1[0] - px), (0.5 + py - p1[1])];

            if(lastX !== p2[0] || lastY !== p2[1]) {
                lastX = p2[0], lastY = p2[1];
                ctx[(lineIsOnEdge ? 'moveTo' : 'lineTo')](p2[0], p2[1]);
                if(!flagPixels) {
                    pixels.push(p1);
                    if(lineIsOnEdge) hidden.push(cnt);
                }
                cnt++;
            }
        }
        if(cnt === 1) ctx.lineTo(lastX + 1, lastY);
        ctx.stroke();
        return flagPixels ? null : { coords: pixels, hidden: hidden };
	}
	,
	'polygonToCanvasFill': function(attr) {				// Polygon fill
        if(attr.coords.length < 3) return;
		var gmx = attr.gmx,
            flagPixels = attr.flagPixels || false,
            coords = attr.coords,
            px = attr.tpx,
            py = attr.tpy,
            ctx = attr.ctx;

        if(attr.bgImage) {
            var pattern = ctx.createPattern(attr.bgImage, "no-repeat");
            ctx.fillStyle = pattern;
        }
        ctx.lineWidth = 0;
        ctx.beginPath();
        for (var i = 0, len = coords.length; i < len; i++) {
            var p1 = flagPixels ? coords[i] : [coords[i][0] * gmx.mInPixel, coords[i][1] * gmx.mInPixel];
            ctx[(i == 0 ? 'moveTo' : 'lineTo')]((0.5 + p1[0] - px) << 0, (0.5 + py - p1[1]) << 0);
        }
        ctx.fill();
	}
    ,
    'labelCanvasContext': null 			// 2dContext canvas для определения размера Label
    ,
    'getLabelSize': function(txt, style)	{			// Получить размер Label
        var out = [0, 0];
        if(style) {
            if(!gmxAPIutils.labelCanvasContext) {
                var canvas = document.createElement('canvas');
                canvas.width = canvas.height = 512;
                gmxAPIutils.labelCanvasContext = canvas.getContext('2d');
            }
            var ptx = gmxAPIutils.labelCanvasContext;
            ptx.clearRect(0, 0, 512, 512);
            
            var size = style.size || 12;
            ptx.font = size + 'px "Arial"';
            ptx.strokeStyle = style.strokeStyle || 'rgba(0, 0, 255, 1)';
            ptx.fillStyle = style.fillStyle || 'rgba(0, 0, 255, 1)';
            ptx.fillText(txt, 0, 0);
            
            out = [ptx.measureText(txt).width, size + 2];
        }
        return out;
    }
	,
	'setLabel': function(txt, attr, parsedStyleKeys) {				// Label в canvas
		var gmx = attr.gmx,
            size = attr.size || 12,
            ctx = attr.ctx;

        ctx.font = size + 'px "Arial"';
        ctx.strokeStyle = parsedStyleKeys.strokeStyle || 'rgba(0, 0, 255, 1)';
		ctx.shadowColor = ctx.strokeStyle;
        ctx.fillStyle = parsedStyleKeys.fillStyle || 'rgba(0, 0, 255, 1)';
		if(ctx.shadowBlur != 4) ctx.shadowBlur = 4;
        
        var p1 = gmxAPIutils.toPixels(attr.coords, attr.tpx, attr.tpy, gmx.mInPixel);
		var extentLabel = parsedStyleKeys.extentLabel;
        ctx.strokeText(txt, p1[0] - extentLabel[0]/2, p1[1]);
        ctx.fillText(txt, p1[0] - extentLabel[0]/2, p1[1]);
        //console.log('setLabel', attr, parsedStyleKeys);
	}
	,'worldWidthMerc': 20037508
	,'r_major': 6378137.000
	,'y_ex': function(lat)	{				// Вычисление y_ex 
		if (lat > 89.5)		lat = 89.5;
		if (lat < -89.5) 	lat = -89.5;
		var phi = gmxAPIutils.deg_rad(lat);
		var ts = Math.tan(0.5*((Math.PI*0.5) - phi));
		var y = -gmxAPIutils.r_major * Math.log(ts);
		return y;
	}	
	,
	deg_rad: function(ang)
	{
		return ang * (Math.PI/180.0);
	},
    
    //x, y, z - GeoMixer tile coordinates
    getTileBounds: function(x, y, z) {
        var tileSize = gmxAPIutils.tileSizes[z],
            minx = x * tileSize, 
            miny = y * tileSize;

        return gmxAPIutils.bounds([[minx, miny], [minx + tileSize, miny + tileSize]]);
    }
	,
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
    'isPointInPolygonArr': function(chkPoint, poly)	{			// Проверка точки на принадлежность полигону в виде массива
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
    'chkPointInPolyLine': function(chkPoint, lineHeight, coords) {	// Проверка точки(с учетом размеров) на принадлежность линии
        lineHeight *= lineHeight;
        
        var chkPoint = { x: chkPoint[0], y: chkPoint[1] };
        var p1 = { x: coords[0][0], y: coords[0][1] };
        for (var i = 1, len = coords.length; i < len; i++)
        {
            var p2 = { x: coords[i][0], y: coords[i][1] };
            var sqDist = L.LineUtil._sqClosestPointOnSegment(chkPoint, p1, p2, true);
            if(sqDist < lineHeight) return true;
            p1 = p2;
        }
        return false;
    }
}

!function() {
    //pre-calculate tile sizes
    for (var z = 0; z < 30; z++) {
        gmxAPIutils.tileSizes[z] = 40075016.685578496 / Math.pow(2, z);
    }
}()