var gmxAPIutils = {
	'getXmlHttp': function() {
		var xmlhttp;
		if (typeof XMLHttpRequest!='undefined') {
			xmlhttp = new XMLHttpRequest();
		}
		if (!xmlhttp) {
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
	}
	,
	'request': function(ph) {	// {'type': 'GET|POST', 'url': 'string', 'callback': 'func'}
	  try {
		var xhr = gmxAPIutils.getXmlHttp();
		xhr.withCredentials = true;
		xhr.open((ph['type'] ? ph['type'] : 'GET'), ph['url'], true);
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
				//self.log('xhr.status ' + xhr.status);
				if(xhr.status == 200) {
					ph['callback'](xhr.responseText);
					xhr = null;
				}
			}
		};
		xhr.send((ph['params'] ? ph['params'] : null));
		return xhr.status;
	  } catch (e) {
		if(ph['onError']) ph['onError'](xhr.responseText);
		return e.description; // turn all errors into empty results
	  }
	}
	,
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
				return max2.x + dx >= min.x && min2.x - dx <= max.x && max2.y + dy >= min.y && min2.y - dy <= max.y;
			}
		};
        
		return res.extendArray(arr);
	}
	,
	'geoItemBounds': function(geoItem) {					// получить bounds векторного обьекта
		var geo = geoItem['geometry'];
		var type = geo['type'];
		var coords = geo['coordinates'];
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
			addToArr(coords[0]);			// дырки пропускаем
		} else if(type === 'MULTIPOLYGON') {
			for (var i = 0, len = coords.length; i < len; i++) addToArr(coords[i][0]);
		} else if(type === 'MULTIPOINT') {
			addToArr(coords);
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
	// 'getTilesByPeriods': function(ph, ut1, ut2, res) {	// получить список тайлов по разбивке и периоду
		// if(!res) res = {};
		// var deltaUT = ut2 - ut1;
		// var days = deltaUT / gmxAPIutils.oneDay;
		// var deltaArr = ph['TemporalPeriods'];
		// var maxDelta = deltaArr[0];
		// for(var i = deltaArr.length - 1; i >= 0; i--) {
			// maxDelta = deltaArr[i];
			// if(days >= maxDelta) break;
		// }
		// var mn = gmxAPIutils.oneDay * maxDelta;
		// var zn1 = (ut1 - ph['ZeroUT'])/mn;
		// var zn2 = (ut2 - ph['ZeroUT'])/mn;
		// if(parseInt(zn1) < zn1) {
			// // if(maxDelta > 1) {
				// // zn1 = parseInt(zn1) + 1;
				// // var ut11 = ph['ZeroUT'] + zn1 * mn;
				// // gmxAPIutils.getTilesByPeriods(ph, ph['ut1'], ut11, res);
			// // } else {
				// zn1 = parseInt(zn1);
			// // }
		// }
		// if(parseInt(zn2) < zn2) {
			// // if(maxDelta > 1) {
				// // zn2 = parseInt(zn2);
				// // var ut21 = ph['ZeroUT'] + zn2 * mn;
				// // gmxAPIutils.getTilesByPeriods(ph, ut21, ph['ut2'], res);
			// // } else {
				// zn2 = parseInt(zn2) + 1;
			// // }
		// }
		// if(!res[maxDelta]) res[maxDelta] = [];
		// res[maxDelta].push([zn1, zn2,
			// new Date(1000 * (ph['ZeroUT'] + mn *zn1) ),
			// new Date(1000 * (ph['ZeroUT'] + mn *zn2) ),
			// new Date(1000 * (ph['ZeroUT'] + mn *zn1 + 256*gmxAPIutils.oneDay) ),
			// new Date(1000 * (ph['ZeroUT'] + mn *zn2 + 256*gmxAPIutils.oneDay) )
			// ]);
		// // res[maxDelta].push([zn1, zn2]);
		// return res;
	// },
	'getNeedTiles': function(ph, t1, t2) {
        if(ph.layerType !== 'VectorTemporal') {
            var res = {};
            for (var t in ph.tilesAll) {
                res[t] = true;
            }
            return res;
        }
        
        var t1Val = t1.valueOf() / 1000,
            t2Val = t2.valueOf() / 1000;
        
        // --------------------
        var selectTilesForNode = function(node, t1, t2) {
            if (t1 >= node.t2 || t2 <= node.t1) {
                return {count: 0, tiles: {}};
            }
            
            if (node.d === 0) {
                return {
                    tiles: node.tiles,
                    count: node.count
                }
            }
            
            var childrenCount = 0; //number of tiles if we use shorter intervals
            var childrenRes = [];
            for (var ds = 0; ds < node.children.length; ds++) {
                if (node.children[ds]) {
                    childrenRes[ds] = selectTilesForNode(node.children[ds], Math.max(t1, node.t1), Math.min(t2, node.t2));
                } else {
                    childrenRes[ds] = {count: 0, tiles: {}};
                }
                childrenCount += childrenRes[ds].count;
            }
            
            if (childrenCount < node.count) {
                var resTiles = {};
                for (var ds = 0; ds < childrenRes.length; ds++) {
                    for (var key in childrenRes[ds].tiles) {
                        resTiles[key] = childrenRes[ds].tiles[key];
                    }
                    // resTiles = resTiles.concat(childrenRes[ds]);
                }
                
                return {
                    tiles: resTiles,
                    count: childrenCount
                }
            } else {
                return {
                    tiles: node.tiles,
                    count: node.count
                } 
            }
        }
        
        var res = {};
        for (var ds = 0; ds < ph.tileTreeRoots.length; ds++) {
            if (ph.tileTreeRoots[ds]) {
                var tiles = selectTilesForNode(ph.tileTreeRoots[ds], t1Val, t2Val).tiles;
                for (var key in tiles) {
                    res[key] = tiles[key];
                }
            }
            // res = res.concat();
        }
        
        return res;
    },
	/*'getNeedTilesPrev': function(ph, dt1, dt2, res) {			// получить список тайлов по временному интервалу
		var _needPeriods = null;
		if(ph['layerType'] === 'VectorTemporal') {
			var ut1 = Math.floor(dt1.getTime() / 1000);
			var ut2 = Math.floor(dt2.getTime() / 1000);
			ph['ut1'] = ut1;
			ph['ut2'] = ut2;
			_needPeriods = gmxAPIutils.getTilesByPeriods(ph, ut1, ut2);
		}
		var cnt = 0;
		var tilesNeedLoad = {};
		for (var key in ph['tilesAll']) {
			if(_needPeriods) {
				var tile = ph['tilesAll'][key].tile;
				var d = tile.d;
				var s = tile.s;
				if(_needPeriods[d]) {
					var needArr = _needPeriods[d];
					for (var i = 0, len = needArr.length; i < len; i++)
					{
						var sp = needArr[i];
						if(s >= sp[0] && s <= sp[1]) {
							tilesNeedLoad[key] = true;
							cnt++;
						}
					}
				}
			} else {
				tilesNeedLoad[key] = true;
				cnt++;
			}
		}
		if(!res) res = {};
		res['tilesNeedLoad'] = tilesNeedLoad;
		return res;
	}
	,*/
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
        if(!style['pattern']) return null;
        var pattern = style['pattern'];
        var prop = (item ? item['properties'] : {});

        var notFunc = true;
        var step = (pattern.step > 0 ? pattern.step : 0);		// шаг между линиями
        if (pattern.patternStepFunction != null && prop != null) {
            step = pattern.patternStepFunction(prop);
            notFunc = false;
        }
        if (step > patternDefaults['max_step']) step = patternDefaults['max_step'];
        else if (step < patternDefaults['min_step']) step = patternDefaults['min_step'];
        
        var size = (pattern.width > 0 ? pattern.width : 8);		// толщина линий
        if (pattern.patternWidthFunction != null && prop != null) {
            size = pattern.patternWidthFunction(prop);
            notFunc = false;
        }
        if (size > patternDefaults['max_width']) size = patternDefaults['max_width'];
        else if (size < patternDefaults['min_width']) size = patternDefaults['min_width'];

        var op = style['fillOpacity'];
        if (style['opacityFunction'] != null && prop != null) {
            op = style['opacityFunction'](prop) / 100;
            notFunc = false;
        }
        
        var arr = (pattern.colors != null ? pattern.colors : []);
        var count = arr.length;
        var resColors = []
        var rgb = [0xff0000, 0x00ff00, 0x0000ff];
        for (var i = 0; i < arr.length; i++) {
            var col = arr[i];
            if(pattern['patternColorsFunction'][i] != null) {
                col =  (prop != null ? pattern['patternColorsFunction'][i](prop): rgb[i%3]);
                notFunc = false;
            }
            resColors.push(col);
        }

        var delta = size + step;
        var allSize = delta * count;
        var center = 0,	radius = 0,	rad = 0; 

        var hh = allSize;				// высота битмапа
        var ww = allSize;				// ширина битмапа
        var type = pattern.style; 
        var flagRotate = false; 
        if (type == 'diagonal1' || type == 'diagonal2' || type == 'cross' || type == 'cross1') {
            flagRotate = true;
        } else if (type == 'circle') {
            ww = hh = 2 * delta;
            center = Math.floor(ww / 2);	// центр круга
            radius = Math.floor(size / 2);	// радиус
            rad = 2 * Math.PI / count;		// угол в рад.
        }
        if (ww * hh > patternDefaults['max_width']) {
            //gmxAPI.addDebugWarnings({'func': 'getPatternIcon', 'Error': 'MAX_PATTERN_SIZE', 'alert': 'Bitmap from pattern is too big'});
            //return null;
        }

        var canvas = document.createElement('canvas');
        canvas.width = ww; canvas.height = hh;
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
        var imgData = ptx.getImageData(0, 0, ww, hh);
        var canvas1 = document.createElement('canvas');
        canvas1.width = ww
        canvas1.height = hh;
        var ptx1 = canvas1.getContext('2d');
        ptx1.drawImage(canvas, 0, 0, ww, hh);
        return { 'notFunc': notFunc, 'canvas': canvas1 };
    }
	,
	'pointToCanvas': function(attr) {				// Точку в canvas
		var gmx = attr['gmx'];
		var coords = attr['coords'];
		var ctx = attr['ctx'];
		var style = attr['style'];

		var mInPixel = gmx['mInPixel'];
		var tpx = attr['tpx'];
		var tpy = attr['tpy'];
		// получить координату в px
		var px1 = coords[0] * mInPixel - tpx; 	px1 = (0.5 + px1) << 0;
		var py1 = tpy - coords[1] * mInPixel;	py1 = (0.5 + py1) << 0;
		var sx = attr['sx'] || style['sx'] || 4;
		var sy = attr['sy'] || style['sy'] || 4;

		if(style['marker']) {
			if(style['image']) {
				if('opacity' in style) ctx.globalAlpha = style['opacity'];
				ctx.drawImage(style['image'], px1 - sx, py1 - sy, 2 * sx, 2 * sy);
				if('opacity' in style) ctx.globalAlpha = 1;
			} else if(style['polygons']) {
				var rotateRes = style['rotate'] || 0;
				if(rotateRes && typeof(rotateRes) == 'string') {
					rotateRes = (style['rotateFunction'] ? style['rotateFunction'](prop) : 0);
				}
				style['rotateRes'] = rotateRes || 0;

				for (var i = 0; i < style['polygons'].length; i++)
				{
					var p = style['polygons'][i];
					ctx.save();
					ctx.lineWidth = p['stroke-width'] || 0;
					ctx.fillStyle = p['fill_rgba'] || 'rgba(0, 0, 255, 1)';
					
					ctx.beginPath();
					var arr = gmxAPIutils.rotatePoints(p['points'], style['rotateRes'], style['scale'], {'x': sx, 'y': sy});
					for (var j = 0; j < arr.length; j++)
					{
						var t = arr[j];
						if(j == 0)
							ctx.moveTo(px1 + t['x'], py1 + t['y']);
						else
							ctx.lineTo(px1 + t['x'], py1 + t['y']);
					}
					ctx.fill();
					ctx.restore();
				}
			}
		} else if(style.strokeStyle) {
			ctx.beginPath();
			if(style['circle']) {
				ctx.arc(px1, py1, style['circle'], 0, 2*Math.PI);
			} else {
				ctx.strokeRect(px1 - sx, py1 - sy, 2*sx, 2*sy);
			}
			ctx.stroke();
		}
		if(style['fill']) {
			ctx.beginPath();
			if(style['circle']) {
                if(style['radialGradient']) {
                    var rgr = style['radialGradient'];
                    var r1 = (rgr['r1Function'] ? rgr['r1Function'](prop) : rgr['r1']);
                    var r2 = (rgr['r2Function'] ? rgr['r2Function'](prop) : rgr['r2']);
                    var x1 = (rgr['x1Function'] ? rgr['x1Function'](prop) : rgr['x1']);
                    var y1 = (rgr['y1Function'] ? rgr['y1Function'](prop) : rgr['y1']);
                    var x2 = (rgr['x2Function'] ? rgr['x2Function'](prop) : rgr['x2']);
                    var y2 = (rgr['y2Function'] ? rgr['y2Function'](prop) : rgr['y2']);
                    px1 = coords[0] * mInPixel - tpx - 1; 	    px1 = (0.5 + px1) << 0;
                    py1 = tpy - coords[1] * mInPixel - 1;		py1 = (0.5 + py1) << 0;

                    var radgrad = ctx.createRadialGradient(px1+x1, py1+y1, r1, px1+x2, py1+y2,r2);  
                    for (var i = 0; i < style['radialGradient']['addColorStop'].length; i++)
                    {
                        var arr = style['radialGradient']['addColorStop'][i];
                        var arrFunc = style['radialGradient']['addColorStopFunctions'][i];
                        var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr[0]);
                        var p2 = (arr.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr[2]));
                        var p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr[1], p2/100);
                        radgrad.addColorStop(p0, p1);
                    }
                    ctx.fillStyle = radgrad;
                }
				ctx.arc(px1, py1, style['circle'], 0, 2*Math.PI);
			} else {
				ctx.fillRect(px1 - sx, py1 - sy, 2*sx, 2*sy);
			}
			ctx.fill();
		}
	}
	,
	'lineToCanvas': function(attr) {				// Линии в canvas
		var gmx = attr['gmx'];
		var coords = attr['coords'];
		var ctx = attr['ctx'];
		var style = attr['style'];

		var mInPixel = gmx['mInPixel'];
		var tpx = attr['tpx'];
		var tpy = attr['tpy'];
		var toPixels = function(p) {				// получить координату в px
			var px1 = p[0] * mInPixel - tpx; 	px1 = (0.5 + px1) << 0;
			var py1 = tpy - p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
			return [px1, py1];
		}
		var arr = [];
		var lastX = null, lastY = null;
		if(style.strokeStyle) {
			ctx.beginPath();
			for (var i = 0, len = coords.length; i < len; i++) {
				var p1 = toPixels(coords[i]);
				if(lastX !== p1[0] || lastY !== p1[1]) {
					if(i == 0)	ctx.moveTo(p1[0], p1[1]);
					else 		ctx.lineTo(p1[0], p1[1]);
					lastX = p1[0], lastY = p1[1];
					if(ctx.fillStyle) arr.push(p1);
				}
			}
			ctx.stroke();
		}
	}
	,
	'polygonToCanvas': function(attr) {				// Полигон в canvas
		var gmx = attr['gmx'];
		var coords = attr['coords'];
		var hiddenLines = attr['hiddenLines'];
		var bgImage = attr['bgImage'];
		var ctx = attr['ctx'];
		var style = attr['style'];

		var mInPixel = gmx['mInPixel'];
		var tpx = attr['tpx'];
		var tpy = attr['tpy'];
		var toPixels = function(p) {				// получить координату в px
			var px1 = p[0] * mInPixel - tpx; 	px1 = (0.5 + px1) << 0;
			var py1 = tpy - p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
			return [px1, py1];
		}
		var arr = [];
		var lastX = null, lastY = null, cntHide = 0;
		if(style.strokeStyle) {
			ctx.beginPath();
			for (var i = 0, len = coords.length; i < len; i++) {
				var lineIsOnEdge = false;
				if(i == hiddenLines[cntHide]) {
					lineIsOnEdge = true;
					cntHide++;
				}
				var p1 = toPixels(coords[i]);
				if(lastX !== p1[0] || lastY !== p1[1]) {
					if(lineIsOnEdge || i == 0)	ctx.moveTo(p1[0], p1[1]);
					else 						ctx.lineTo(p1[0], p1[1]);
					lastX = p1[0], lastY = p1[1];
					if(ctx.fillStyle) arr.push(p1);
				}
			}
			ctx.stroke();
		} else {
			arr = coords;
		}

        if(style['marker']) {
            if(style['image']) {
                var point = getPoint();
                var x = attr['x'];
                var y = 256 + attr['y'];
 /*
                if(style['imageWidth']) out['sx'] = style['imageWidth']/2;
                if(style['imageHeight']) out['sy'] = style['imageHeight']/2;
                var px1 = point.x * mInPixel - x - out['sx']; 		px1 = (0.5 + px1) << 0;
                var py1 = y - point.y * mInPixel - out['sy'];		py1 = (0.5 + py1) << 0;
                ctx.drawImage(style['image'], px1, py1);
*/
            }
        //} else if(style.fillStyle || bgImage) {
        } else if(style.fill || bgImage) {
			if(bgImage) {
				var pattern = ctx.createPattern(bgImage, "no-repeat");
				ctx.fillStyle = pattern;
			} if(style['pattern']) {
/*
                var canvasPattern = attr['canvasPattern'] || null;
                if(!canvasPattern) {
                    var pt = gmxAPIutils.getPatternIcon(out, style);
                    canvasPattern = (pt ? pt['canvas'] : null);
                }
                if(canvasPattern) {
                    var pattern = ctx.createPattern(canvasPattern, "repeat");
                    ctx.fillStyle = pattern;
                }
*/
            } else if(style['linearGradient']) {
                var rgr = style['linearGradient'];
                var x1 = (rgr['x1Function'] ? rgr['x1Function'](prop) : rgr['x1']);
                var y1 = (rgr['y1Function'] ? rgr['y1Function'](prop) : rgr['y1']);
                var x2 = (rgr['x2Function'] ? rgr['x2Function'](prop) : rgr['x2']);
                var y2 = (rgr['y2Function'] ? rgr['y2Function'](prop) : rgr['y2']);
                var lineargrad = ctx.createLinearGradient(x1,y1, x2, y2);  
                for (var i = 0; i < style['linearGradient']['addColorStop'].length; i++)
                {
                    var arr = style['linearGradient']['addColorStop'][i];
                    var arrFunc = style['linearGradient']['addColorStopFunctions'][i];
                    var p0 = (arrFunc[0] ? arrFunc[0](prop) : arr[0]);
                    var p2 = (arr.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop) : arr[2]));
                    var p1 = gmxAPIutils.dec2rgba(arrFunc[1] ? arrFunc[1](prop) : arr[1], p2/100);
                    lineargrad.addColorStop(p0, p1);
                }
                ctx.fillStyle = lineargrad; 
                //ctx.fillRect(0, 0, 255, 255);
            }
            
			ctx.beginPath();
			//ctx.fillRect(0, 0, 256, 256);
			//ctx.globalAlpha = 0;
			for (var i = 0, len = arr.length; i < len; i++) {
				var p1 = arr[i];
				if(!style.strokeStyle) p1 = toPixels(p1);
				if(i == 0)	ctx.moveTo(p1[0], p1[1]);
				else		ctx.lineTo(p1[0], p1[1]);
			}
			//ctx.globalAlpha = 1;
			ctx.fill();
			//ctx.clip();
		}
	}
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
		return {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'x3': x3, 'y3': y3, 'x4': x4, 'y4': y4};
	}
	
}

!function() {
    //pre-calculate tile sizes
    for (var z = 0; z < 30; z++) {
        gmxAPIutils.tileSizes[z] = 40075016.685578496 / Math.pow(2, z);
    }
}()