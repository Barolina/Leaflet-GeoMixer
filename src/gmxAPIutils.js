var gmxAPIutils = {
	/*'cloneLevel': 10				// уровень клонирования обьектов
	,
	'clone': function (o, level)
	{
		if(!level) level = 0;
		var type = typeof(o);
		if(!o || type !== 'object')  {
			return (type === 'function' ? 'function' : o);
		}
		var c = 'function' === typeof(o.pop) ? [] : {};
		var p, v;
		for(p in o) {
			if(o.hasOwnProperty(p)) {
				v = o[p];
				var type = typeof(v);
				if(v && type === 'object') {
					c[p] = (level < gmxAPIutils.cloneLevel ? gmxAPIutils.clone(v, level + 1) : 'object');
				}
				else {
					c[p] = (type === 'function' ? 'function' : v);
				}
			}
		}
		return c;
	}
	,*/
	'getXmlHttp': function() {
		var xmlhttp;
		try {
			xmlhttp = new ActiveXObject("Msxml2.XMLHTTP");
		} catch (e) {
			try {
				xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
			} catch (E) {
				xmlhttp = false;
			}
		}
		if (!xmlhttp && typeof XMLHttpRequest!='undefined') {
			xmlhttp = new XMLHttpRequest();
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
	'getTileSize': function(zoom)	{		// Вычисление размеров тайла по zoom
		var pz = Math.pow(2, zoom);
		var mInPixel =  pz/156543.033928041;
		return 256 / mInPixel;
	}
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
		gmxTilePoint['gmxTileID'] = zoom + '_' + gmxTilePoint.x + '_' + gmxTilePoint.y
		return gmxTilePoint;
	}
	,
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
			},
			extendArray: function(arr) {
                if (!arr) { return this };
				for(var i=0, len=arr.length; i<len; i++) {
					this.extend(arr[i][0], arr[i][1]);
				}
                return this;
			},
			intersects: function (bounds) { // (Bounds) -> Boolean
				var min = this.min,
					max = this.max,
					min2 = bounds.min,
					max2 = bounds.max;
				return max2.x >= min.x && min2.x <= max.x && max2.y >= min.y && min2.y <= max.y;
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
		} else if(type === 'POLYGON') {
			addToArr(coords[0]);			// дырки пропускаем
		} else if(type === 'MULTIPOLYGON') {
			for (var i = 0, len = coords.length; i < len; i++) addToArr(coords[i][0]);
		} else if(type === 'MULTIPOINT') {
			addToArr(coords);
		}
		item.bounds = gmxAPIutils.bounds(arr);
		arr = null;
	}
	,'dec2rgba': function(i, a)	{				// convert decimal to rgb
		var r = (i >> 16) & 255;
		var g = (i >> 8) & 255;
		var b = i & 255;
		return 'rgba('+r+', '+g+', '+b+', '+a+')';
	}
	,
	'prepareLayerBounds': function(layer, gmx) {					// построение списка тайлов
		var res = {'tilesAll':{}, 'items':{}, 'tileCounts':0, 'cntItems':0};
		var prop = layer.properties;
		var geom = layer.geometry;
		var type = prop['type'] + (prop['Temporal'] ? 'Temporal' : '');

		var defaultStyle = {'lineWidth': 1, 'strokeStyle': 'rgba(0, 0, 255, 1)'};
		var styles = [defaultStyle];
		if(prop['styles']) {
			styles.shift();
			for (var i = 0, len = prop['styles'].length; i < len; i++)
			{
				var it = prop['styles'][i];
				var pt = {};
				var renderStyle = it['RenderStyle'];
				if(renderStyle['outline']) {
					var outline = renderStyle['outline'];
					pt['lineWidth'] = ('thickness' in outline ? outline['thickness'] : 0);
					var color = ('color' in outline ? outline['color'] : 255);
					var opacity = ('opacity' in outline ? outline['opacity']/100 : 1);
					pt['strokeStyle'] = gmxAPIutils.dec2rgba(color, opacity);
				}
				if(renderStyle['fill']) {
					var fill = renderStyle['fill'];
					var color = ('color' in fill ? fill['color'] : 255);
					var opacity = ('opacity' in fill ? fill['opacity']/100 : 1);
					pt['fillStyle'] = gmxAPIutils.dec2rgba(color, opacity);
				}
				styles.push(pt);
			}
		}
		res['styles'] = styles;

		var addRes = function(z, x, y, v, s, d) {
			var gmxTileKey = z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
			var tileSize = gmxAPIutils.getTileSize(z);
			var minx = x * tileSize, miny = y * tileSize;
			res['tilesAll'][gmxTileKey] = {
				'gmxTileKey': gmxTileKey
				,'gmxTilePoint': {'z': z, 'x': x, 'y': y, 's': s, 'd': d, 'v': v}
				,'bounds': gmxAPIutils.bounds([[minx, miny], [minx + tileSize, miny + tileSize]])
			};
		}
		var cnt = 0;
		var arr = prop['tiles'] || [];
		var vers = prop['tilesVers'] || [];
		if(type === 'VectorTemporal') {
			arr = prop['TemporalTiles'];
			vers = prop['TemporalVers'];
			for (var i = 0, len = arr.length; i < len; i++)
			{
				var arr1 = arr[i];
				var z = Number(arr1[4])
					,y = Number(arr1[3])
					,x = Number(arr1[2])
					,s = Number(arr1[1])
					,d = Number(arr1[0])
					,v = Number(vers[i])
				;
				addRes(z, x, y, v, s, d);
				cnt++;
			}
			res['TemporalColumnName'] = prop['TemporalColumnName'];
			res['TemporalPeriods'] = prop['TemporalPeriods'];
			
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			res['ZeroDate'] = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			res['ZeroUT'] = res['ZeroDate'].getTime() / 1000;
			
		} else if(type === 'Vector') {
			for (var i = 0, len = arr.length; i < len; i+=3)
			{
				addRes(Number(arr[i+2]), Number(arr[i]), Number(arr[i+1]), Number(vers[cnt]), -1, -1);
				cnt++;
			}
		}
		res['tileCounts'] = cnt;
		res['layerType'] = type;						// VectorTemporal Vector
		res['identityField'] = prop['identityField'];	// ogc_fid
		res['GeometryType'] = prop['GeometryType'];		// тип геометрий обьектов в слое
		if(prop['IsRasterCatalog']) {
			res['rasterBGfunc'] = function(x, y, z, idr) {
				var qURL = 'http://' + gmx.hostName
					+'/TileSender.ashx?ModeKey=tile'
					+'&x=' + x
					+'&y=' + y
					+'&z=' + z
					+'&idr=' + idr
					+'&MapName=' + gmx.mapName
					+'&LayerName=' + gmx.layerName
					+'&key=' + encodeURIComponent(gmx.sessionKey);
				return qURL;
			};
		}
		return res;
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
				var it = ph['tilesAll'][key];
				var gmxTilePoint = it['gmxTilePoint'];
				var d = gmxTilePoint.d;
				var s = gmxTilePoint.s;
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
		res['tilesNeedLoadCounts'] = cnt;
		return res;
	}
	,
	'isTileKeysIntersects': function(tk1, tk2) { // пересечение по номерам 2 тайлов
		var pz = Math.pow(2, tk1.z - tk2.z);
		var x2 = Math.floor(tk2.x * pz);
		if(x2 - 1 >= tk1.x) return false;
		if(x2 + pz <= tk1.x) return false;
		var y2 = Math.floor(tk2.y * pz);
		if(y2 - 1 >= tk1.y) return false;
		if(y2 + pz <= tk1.y) return false;
		return true;
	}

/* оптимизированная версия
    'isTileKeysIntersects': function(tk1, tk2) { // пересечение по номерам 2 тайлов
        if (tk1.z < tk2.z) {
            var t = tk1; tk1 = tk2; tk2 = t;
        }
        
        var dz = tk1.z - tk2.z
        return tk1.x >> dz === tk2.x && tk1.y >> dz === tk2.y;
	}
*/  
	,
	'getTileKeysIntersects': function(gmxTilePoint, tilesAll) {	// получить список тайлов сервера пересекающих gmxTilePoint
		var out = [];
		for (var key in tilesAll) {
			if(gmxAPIutils.isTileKeysIntersects(gmxTilePoint, tilesAll[key]['gmxTilePoint'])) {
				out.push(key);
			}
		}
		return out;
	}
	,
	'loadTile': function(ph, gmxTilePoint, tilePoint, callback) {	// загрузить тайлы по отображаемому gmxTilePoint
		var prefix = '';
		var cnt = 0;
		
		for (var key in ph.attr['tilesNeedLoad']) {
			var it = ph.attr['tilesAll'][key];
			var tp = it['gmxTilePoint'];
			if(!gmxAPIutils.isTileKeysIntersects(gmxTilePoint, tp)) continue;

			if(!it['fromTilePoints']) it['fromTilePoints'] = [];
			it['fromTilePoints'].push(tilePoint);
			if(!it['inLoad']) {
				it['inLoad'] = true;
				if(!prefix) {
					prefix = ph['tileSenderPrefix'] + '&ModeKey=tile&r=t';
					prefix += "&MapName=" + ph['mapName'];
					prefix += "&LayerName=" + ph['layerName'];
				}
				var url = prefix + "&z=" + tp['z'];
				url += "&x=" + tp['x'];
				url += "&y=" + tp['y'];
				url += "&v=" + tp['v'];
				if(tp['d'] !== -1) url += "&Level=" + tp['d'] + "&Span=" + tp['s'];
				cnt++;
				(function() {
					var gmxTileKey = key;
					var tp1 = tilePoint;
					var attr = ph.attr;
					var func = callback;
					gmxAPIutils.request({
						'url': url
						,'callback': function(st) {
							cnt--;
							var res = JSON.parse(st);
							func({'cnt': cnt, 'gmxTileKey': gmxTileKey, 'data': res});
						}
					});
				})();
			}
		}
		return cnt;
	}
	,
	'parseTile': function(gmx, ph) {	// парсинг загруженного тайла
		var gmxTileKey = ph.gmxTileKey;
		var tHash = gmx.attr['tilesAll'][gmxTileKey];
		var items = gmx.attr.items;
		var layerProp = gmx.properties;
		var identityField = layerProp.identityField || 'ogc_fid';
		var data = ph.data;
		for (var i = 0, len = ph.data.length; i < len; i++) {
			var it = ph.data[i];
			var prop = it['properties'];
			delete it['properties'];
			var geom = it['geometry'];
			
			var id = it['id'] || prop[identityField];
			var propHiden = null;
			var item = items[id];
			if(item) {
				if(item['type'].indexOf('MULTI') == -1) item['type'] = 'MULTI' + item['type'];
			} else {
				item = {
					'id': id
					,'type': geom['type']
					,'properties': prop
					,'propHiden': {
						'fromTiles': {}
					}
				};
				items[id] = item;
			}
			item['propHiden']['fromTiles'][gmxTileKey] = true;
			if(layerProp.TemporalColumnName) {
				var zn = prop[layerProp.TemporalColumnName] || '';
				zn = zn.replace(/(\d+)\.(\d+)\.(\d+)/g, '$2/$3/$1');
				var vDate = new Date(zn);
				var offset = vDate.getTimezoneOffset();
				var dt = Math.floor(vDate.getTime() / 1000  - offset*60);
				item['propHiden']['unixTimeStamp'] = dt;
			}
		}
		
		tHash['data'] = ph.data;
		return ph.data.length;
	}
	,
	'chkHiddenPoints': function(attr) {	// массив точек (мульти)полигона на границах тайлов
		var gmx = attr.gmx;
		var gmxTileKey = attr.gmxTileKey;
		var tHash = gmx.attr['tilesAll'][gmxTileKey];
		var tileBounds = tHash.bounds;
		var d = (tileBounds.max.x - tileBounds.min.x)/10000;
		var tbDelta = {									// границы тайла для определения onEdge отрезков
			'minX': tileBounds.min.x + d
			,'maxX': tileBounds.max.x - d
			,'minY': tileBounds.min.y + d
			,'maxY': tileBounds.max.y - d
		};
		var chkOnEdge = function(p1, p2, ext) {				// отрезок на границе
			if ((p1[0] < ext.minX && p2[0] < ext.minX) || (p1[0] > ext.maxX && p2[0] > ext.maxX)) return true;
			if ((p1[1] < ext.minY && p2[1] < ext.minY) || (p1[1] > ext.maxY && p2[1] > ext.maxY)) return true;
			return false;
		}
		var getHidden = function(coords, tb) {			// массив точек на границах тайлов
			var hideLines = [];
			var prev = null;
			for (var i = 0, len = coords.length; i < len; i++) {
				var p = coords[i];
				if(prev && chkOnEdge(p, prev, tb)) {
					hideLines.push(i);
				}
				prev = p;
			}
			return hideLines;
		}
		for (var i = 0, len = tHash['data'].length; i < len; i++) {
			var it = tHash['data'][i];
			var geom = it['geometry'];
			if(geom['type'].indexOf('POLYGON') !== -1) {
				var hideLines = [];								// индексы точек лежащих на границе тайла
				var coords = geom['coordinates'];
				var cnt = 0;
				for (var j = 0, len1 = coords.length; j < len1; j++) {
					var coords1 = coords[j];
					if(geom['type'].indexOf('MULTI') !== -1) {
						for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
							hideLines.push(getHidden(coords1[j1], tbDelta));
						}
					} else {
						hideLines.push(getHidden(coords1, tbDelta));
					}
				}
				it['hideLines'] = hideLines;
			}
		}
	}
	,
	'polygonToCanvas': function(attr) {				// Полигон в canvas
		var gmx = attr['gmx'];
		var coords = attr['coords'];
		var hideLines = attr['hideLines'];
		var bgImage = attr['bgImage'];
		var ctx = attr['ctx'];
		var style = attr['style'];
		for (var key in style) ctx[key] = style[key];

		var mInPixel = gmx['mInPixel'];
		var tpx = attr['tpx'];
		var tpy = attr['tpy'];
		var toPixels = function(p) {				// получить координату в px
			var px1 = p[0] * mInPixel - tpx; 	px1 = (0.5 + px1) << 0;
			var py1 = tpy - p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
			return [px1, py1];
		}
		var arr = [];
		var lastX = null, lastY = null, prev = null, cntHide = 0;
		if(style.strokeStyle) {
			ctx.beginPath();
			for (var i = 0, len = coords.length; i < len; i++) {
				var lineIsOnEdge = false;
				if(i == hideLines[cntHide]) {
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
	,
	'getTileRasters': function(attr, callback) {	// Получить растры КР для тайла
		var gmx = attr.gmx;
		var gmxTilePoint = attr['gmxTilePoint'];
		var needLoadRasters = 0;
		var chkReadyRasters = function() {
			needLoadRasters--;
			if(needLoadRasters < 1) {
				callback(attr, needLoadRasters);
			}
		}
		for (var i = 0, len = gmxTilePoint['items'].length; i < len; i++) {
			var it = gmxTilePoint['items'][i];
			if(!gmxTilePoint['rasters']) gmxTilePoint['rasters'] = {};
			needLoadRasters++;
			(function() {
				var idr = it.id;
				var rasters = gmxTilePoint['rasters'];
				gmxAPIutils.imageLoader.push({
					'callback' : function(img) {
						rasters[idr] = img;
						chkReadyRasters();
					}
					,'onerror' : function() {
						chkReadyRasters();
					}
					,'src': gmx.attr['rasterBGfunc'](gmxTilePoint['x'], gmxTilePoint['y'], attr['zoom'], idr)
				});
			})();
		}
	}
	,
	'paintTile': function(attr, style) {			// Отрисовка 1 тайла
		var gmxTilePoint = attr.gmxTilePoint;
		var items = gmxTilePoint['items'];
		if(!gmxTilePoint['rasters']) gmxTilePoint['rasters'] = {};
		var dattr = {
			'gmx': attr['gmx']
			,'style': style
			,'tpx': 256 * gmxTilePoint['x']
			,'tpy': 256 *(1 + gmxTilePoint['y'])
		};
		
		var items = gmxTilePoint['items'].sort(attr['gmx'].sortItems);
		
		for (var i = 0, len = items.length; i < len; i++) {
			var it = items[i];
			var idr = it['id'];
			if(!attr.ctx) {
				var tile = attr.layer.gmxGetCanvasTile(attr.tilePoint);
				attr.ctx = tile.getContext('2d');
			}
			dattr['ctx'] = attr.ctx;
			if(gmxTilePoint['rasters'][idr]) dattr['bgImage'] = gmxTilePoint['rasters'][idr];

			var geom = it['geometry'];
			if(geom['type'].indexOf('POLYGON') !== -1) {	// Отрисовка геометрии полигона
				var coords = geom['coordinates'];
				for (var j = 0, len1 = coords.length; j < len1; j++) {
					var coords1 = coords[j];
					dattr['hideLines'] = it['hideLines'][j];
					if(geom['type'].indexOf('MULTI') !== -1) {
						for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
							dattr['coords'] = coords1[j1];
							gmxAPIutils.polygonToCanvas(dattr);
						}
					} else {
						dattr['coords'] = coords1;
						gmxAPIutils.polygonToCanvas(dattr);
					}
				}
			}
		}
	}
	,
	'imageLoader': {		// imageLoader - менеджер загрузки image
		'maxCount': 32						// макс.кол. запросов
		,'curCount': 0						// номер текущего запроса
		,'timer': null						// таймер
		,'items': []						// массив текущих запросов
		,'itemsHash': {}						// Хэш по image.src
		,'itemsCache': {}					// Кэш загруженных image по image.src
		,'emptyImageUrl': 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
		,
		'removeItemsByZoom': function(zoom)	{	// остановить и удалить из очереди запросы по zoom
			for (var key in this.itemsCache)
			{
				var q = this.itemsCache[key][0];
				if('zoom' in q && q['zoom'] != zoom && q['loaderObj']) {
					q['loaderObj'].src = this.emptyImageUrl;
				}
			}
			var arr = [];
			for (var i = 0, len = this.items.length; i < len; i++)
			{
				var q = this.items[i];
				if(!q['zoom'] || q['zoom'] === zoom) {
					arr.push(q);
				}
			}
			this.items = arr;
			return this.items.length;
		}
		,
		'callCacheItems': function(item) {		// загрузка item завершена
			if(this.itemsCache[item.src]) {
				var arr = this.itemsCache[item.src];
				var first = arr[0];
				for (var i = 0, len = arr.length; i < len; i++)
				{
					var it = arr[i];
					if(first.isError) {
						if(it.onerror) it.onerror(null);
					} else if(first.imageObj) {
						if(it.callback) it.callback(first.imageObj);
					} else if(first.svgPattern) {
						if(it.callback) it.callback(first.svgPattern, true);
					}
				}
				delete this.itemsCache[item.src];
			}
			this.nextLoad();
		}
		,
		'nextLoad': function() {			// загрузка следующего
			if(this.curCount > this.maxCount) return;
			if(this.items.length < 1) {
				this.curCount = 0;
				if(this.timer) {
					clearInterval(this.timer);
					this.timer = null;
				}
				return false;
			}
			var item = this.items.shift();

			if(this.itemsCache[item.src]) {
				var pitem = this.itemsCache[item.src][0];
				if(pitem.isError) {
					if(item.onerror) item.onerror(null);
				} else if(pitem.imageObj) {
					if(item.callback) item.callback(pitem.imageObj);
				} else {
					this.itemsCache[item.src].push(item);
				}
			} else {
				this.itemsCache[item.src] = [item];
				this.setImage(item);
			}
		}
		,
		'setImage': function(item) {			// загрузка image
            var _this = this,
                imageObj = new Image();
			item['loaderObj'] = imageObj;
			if(item['crossOrigin']) imageObj.crossOrigin = item['crossOrigin'];
			imageObj.onload = function() {
				_this.curCount--;
				item.imageObj = imageObj;
				delete item['loaderObj'];
				_this.callCacheItems(item);
			};
			imageObj.onerror = function() {
				_this.curCount--;
				item.isError = true;
				_this.callCacheItems(item);
			};
			this.curCount++;
			imageObj.src = item.src;
		}
		,
		'chkTimer': function() {			// установка таймера
            var _this = this;
			if(!this.timer) {
				this.timer = setInterval(function() {
                    _this.nextLoad();
                }, 50);
			}
		}
		,
		'push': function(item)	{			// добавить запрос в конец очереди
			this.items.push(item);
			this.chkTimer();
			return this.items.length;
		}
		,'unshift': function(item)	{		// добавить запрос в начало очереди
			this.items.unshift(item);
			this.chkTimer();
			return this.items.length;
		}
		,'getCounts': function()	{		// получить размер очереди + колич.выполняющихся запросов
			return this.items.length + (this.curCount > 0 ? this.curCount : 0);
		}
	}
	,'r_major': 6378137.000
	,'r_minor': 6356752.3142
	,'y_ex': function(lat)	{				// Вычисление y_ex 
		if (lat > 89.5)		lat = 89.5;
		if (lat < -89.5) 	lat = -89.5;
		var phi = gmxAPIutils.deg_rad(lat);
		var ts = Math.tan(0.5*((Math.PI*0.5) - phi));
		var y = -gmxAPIutils.r_major * Math.log(ts);
		return y;
	}
	,
	from_merc_y: function(y)
	{
		var temp = gmxAPIutils.r_minor / gmxAPIutils.r_major;
		var es = 1.0 - (temp * temp);
		var eccent = Math.sqrt(es);
		var ts = Math.exp(-y/gmxAPIutils.r_major);
		var HALFPI = 1.5707963267948966;

		var eccnth, Phi, con, dphi;
		eccnth = 0.5 * eccent;

		Phi = HALFPI - 2.0 * Math.atan(ts);

		var N_ITER = 15;
		var TOL = 1e-7;
		var i = N_ITER;
		dphi = 0.1;
		while ((Math.abs(dphi)>TOL)&&(--i>0))
		{
			con = eccent * Math.sin (Phi);
			dphi = HALFPI - 2.0 * Math.atan(ts * Math.pow((1.0 - con)/(1.0 + con), eccnth)) - Phi;
			Phi += dphi;
		}

		return this.deg_decimal(Phi);
	}
	,
	deg_rad: function(ang)
	{
		return ang * (Math.PI/180.0);
	}
	,
	deg_decimal: function(rad)
	{
		return (rad/Math.PI) * 180.0;
	}
}
