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
	'itemBounds': function(item) {							// получить bounds векторного обьекта
		var geo = item['geometry'];
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
	'getTilesByPeriods': function(ph, ut1, ut2, res) {	// получить список тайлов по разбивке и периоду
		if(!res) res = {};
		var deltaUT = ut2 - ut1;
		var days = deltaUT / gmxAPIutils.oneDay;
		var deltaArr = ph['TemporalPeriods'];
		var maxDelta = deltaArr[0];
		for(var i = deltaArr.length - 1; i >= 0; i--) {
			maxDelta = deltaArr[i];
			if(days >= maxDelta) break;
		}
		var mn = gmxAPIutils.oneDay * maxDelta;
		var zn1 = (ut1 - ph['ZeroUT'])/mn;
		var zn2 = (ut2 - ph['ZeroUT'])/mn;
		if(parseInt(zn1) < zn1) {
			/*if(maxDelta > 1) {
				zn1 = parseInt(zn1) + 1;
				var ut11 = ph['ZeroUT'] + zn1 * mn;
				gmxAPIutils.getTilesByPeriods(ph, ph['ut1'], ut11, res);
			} else {*/
				zn1 = parseInt(zn1);
			//}
		}
		if(parseInt(zn2) < zn2) {
			/*if(maxDelta > 1) {
				zn2 = parseInt(zn2);
				var ut21 = ph['ZeroUT'] + zn2 * mn;
				gmxAPIutils.getTilesByPeriods(ph, ut21, ph['ut2'], res);
			} else {*/
				zn2 = parseInt(zn2) + 1;
			//}
		}
		if(!res[maxDelta]) res[maxDelta] = [];
		res[maxDelta].push([zn1, zn2,
			new Date(1000 * (ph['ZeroUT'] + mn *zn1) ),
			new Date(1000 * (ph['ZeroUT'] + mn *zn2) ),
			new Date(1000 * (ph['ZeroUT'] + mn *zn1 + 256*gmxAPIutils.oneDay) ),
			new Date(1000 * (ph['ZeroUT'] + mn *zn2 + 256*gmxAPIutils.oneDay) )
			]);
		//res[maxDelta].push([zn1, zn2]);
		return res;
	}
	,
	'getNeedTiles': function(ph, dt1, dt2, res) {			// получить список тайлов по временному интервалу
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

		if(style.fillStyle || bgImage) {
			if(bgImage) {
				var pattern = ctx.createPattern(bgImage, "no-repeat");
				ctx.fillStyle = pattern;
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