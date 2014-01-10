// Плагин векторного слоя
L.gmxWebGLLayer = L.Class.extend({
    initialize: function(options) {
        options = L.setOptions(this, options);
        this.initPromise = new gmxDeferred();
        
        this._drawQueue = [];
        this._drawQueueHash = {};
        
        this._gmx = {
            hostName: options.hostName || 'maps.kosmosnimki.ru'
            ,mapName: options.mapName
            ,layerName: options.layerName
            ,beginDate: options.beginDate
            ,endDate: options.endDate
            ,sortItems: options.sortItems || function(a, b) { return Number(a.id) - Number(b.id); }
            ,styles: options.styles || []
            ,tileSubscriptions: []
        };
    },

    _zoomStart: function() {
        this._gmx.zoomstart = true;
    },
    
    _zoomEnd: function() {
        this._gmx.zoomstart = false;
        this._prpZoomData(this._map._zoom);
        this._refreshPositionArray();
    },
	_refreshPositionArray: function () {
		var gmx = this._gmx,
            webGL = this._webGL;

        if(!webGL.image) return;
        var ww = webGL.image.width / gmx.mInPixel,
            hh = webGL.image.height / gmx.mInPixel;

console.log('bbbbbbb', this._map._zoom, gmx.currentZoom, gmx.mInPixel);
        for (var i = 0, len = webGL.positionArray.length; i < len; i+=12) {
            webGL.positionArray[i + 2] = 
            webGL.positionArray[i + 8] = 
            webGL.positionArray[i + 10] = webGL.positionArray[i] + ww;
            webGL.positionArray[i + 5] = 
            webGL.positionArray[i + 7] = 
            webGL.positionArray[i + 11] = webGL.positionArray[i + 1] + hh;
        }
        this._render();
	}
	,
    _drawScene: function (tex) {
		var gmx = this._gmx,
            map = this._map,
            webGL = this._webGL,
            gl = webGL._gl,
            glProgram = webGL.glProgram;

		if (!webGL || !this._map || this._gmx.zoomstart) return;
//if(!webGL.image) return;
gmx.tileSize = gmxAPIutils.tileSizes[this._map._zoom];
gmx.mInPixel = 256 / gmx.tileSize;
//this._refreshPositionArray();

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var positionLocation = gl.getAttribLocation(glProgram, "a_position");
        // provide texture coordinates for the rectangle.
        var texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, webGL.texCoordArray, gl.STATIC_DRAW);

        // look up where the vertex data needs to go.
        var texCoordLocation = gl.getAttribLocation(glProgram, "a_texCoord");
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // передача в вершинный шейдер коэф. метров Меркатора в пикселе
        var u_mInPixel = gl.getUniformLocation(glProgram, "u_mInPixel");
        gl.uniform1f(u_mInPixel, gmx.mInPixel);

        // размер иконки
        var u_imageSize = gl.getUniformLocation(glProgram, "u_imageSize");
        gl.uniform2f(u_imageSize, tex.width, tex.height);

        var point1 = map.project(map.getBounds().getNorthWest());
        var point = map.project(map.getCenter());
        var pos1 = L.DomUtil.getPosition(map._mapPane);
        //var pixelOrigin = map.getPixelOrigin();
        if(!gmx.pixelOrigin) gmx.pixelOrigin = map.getPixelOrigin();
//        var pixelOrigin1 = map.latLngToLayerPoint(map.getBounds().getNorthWest());
//console.log('_drawScene', gmx.zoomstart, this._map._zoom, point, pixelOrigin1, pixelOrigin);
        // текущий центр карты
        var position = {
            //x: gmx.canvas.width - point.x + pixelOrigin.x + gmx.canvasPos.x
            x: gmx.canvas.width/2 - point.x // + gmx.canvasPos.x
            ,y: gmx.canvas.height - point.y + point1.y - pos1.y
            //,y: gmx.canvas.height/2 - map._mapPane._leaflet_pos.y
            //,y: -gmx.canvas.height/2 + point.y - gmx.canvasPos.y
            //,y: point.y + pixelOrigin.y //+ gmx.canvasPos.y
        };
        var u_shift = gl.getUniformLocation(glProgram, "u_shift");
        gl.uniform2f(u_shift, position.x, position.y);
//console.log('position', gmx.zoomstart, this._map._zoom, map.getSize(), position.y, point.y, pixelOrigin.y, gmx.canvasPos.y);
console.log('position1', map.getSize(), gmx.currentZoom, position.y, point1.y, point.y, gmx.pixelOrigin.y, pos1.y, map._mapPane._leaflet_pos.y, gmx.canvas.height/2);
/*
        // сдвиг левого верхнего угла карты
        var u_leftTop = gl.getUniformLocation(glProgram, "u_leftTop");
        gl.uniform2f(u_leftTop, pixelOrigin.x, pixelOrigin.y);
*/

        // размеры canvas
        var resolutionLocation = gl.getUniformLocation(glProgram, "u_resolution");
        gl.uniform2f(resolutionLocation, gmx.canvas.width, gmx.canvas.height);

        // Create a buffer for the position of the rectangle corners.
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        // Set a rectangle the same size as the image.
        gl.bufferData(gl.ARRAY_BUFFER, webGL.positionArray, gl.STATIC_DRAW);
        // Draw the rectangle.
        gl.drawArrays(gl.TRIANGLES, 0, webGL.texCoordArray.length/2);
        //gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    ,
    _render: function () {
		var gmx = this._gmx,
            map = this._map,
            webGL = this._webGL,
            image = webGL.image,
            gl = webGL._gl;

        if(!webGL.image) return;
        if(webGL.glProgram) {
            gl.deleteProgram(webGL.glProgram);
        }
            // setup GLSL program
            //vertexShader = createShaderFromScriptElement(gl, "2d-vertex-shader");
            var vertexShader = webGL.getShader('vert', 'icon');
            //fragmentShader = createShaderFromScriptElement(gl, "2d-fragment-shader");
            var fragmentShader = webGL.getShader('fragment', 'icon');
            var program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            // Check the link status
            var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
            if (!linked) {
              // something went wrong with the link
              console.log("Error in program linking:" + gl.getProgramInfoLog(program));
              gl.deleteProgram(program);
              return null;
            }

            gl.useProgram(program);
            webGL.glProgram = program;
            // Create a texture.
            var texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // Set the parameters so we can render any size image.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            // Upload the image into the texture.
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        //}
        this._drawScene(image);
    }
	,
    putToWebGL: function (data) {
		var gmx = this._gmx,
            webGL = this._webGL,
            arrays = this._prpArrays(data);

        if(!webGL.positionArray) {
//if(!webGL.image) return;
var tdata = [
    {geometry: {coordinates: [20037508, 0]}}
    //,{geometry: {coordinates: [0, 0]}}
    //,{geometry: {coordinates: [20037508/2, 0]}}
    //,{geometry: {coordinates: [-20037508/2, 0]}}
];
arrays = this._prpArrays(tdata);
/*
*/
            webGL.positionArray = arrays.positionArray;
            webGL.texCoordArray = arrays.texCoordArray;
        } else {
/*
            var len12 = webGL.positionArray.length + arrays.positionArray.length;
            var texCoordArray = new Float32Array(len12);
            var positionArray = new Float32Array(len12);
            positionArray.set(webGL.positionArray, 0, webGL.positionArray.length);
            positionArray.set(arrays.positionArray, webGL.positionArray.length, arrays.positionArray.length);
            texCoordArray.set(webGL.texCoordArray, 0, webGL.texCoordArray.length);
            texCoordArray.set(arrays.texCoordArray, webGL.texCoordArray.length, arrays.texCoordArray.length);
            webGL.positionArray = positionArray;
            webGL.texCoordArray = texCoordArray;
*/
        }
/*
var texCoordArray = new Float32Array(len12);
var positionArray = new Float32Array(len12);
var addPoint = function (x, y, width, height) {
    var x1 = x,
        x2 = x + width / gmx.mInPixel,
        y1 = y,
        y2 = y + height / gmx.mInPixel;
    
    //var byteOffset = positionArray.byteOffset;
    //var len = positionArray.length;
    var arr = new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2
    ]);
    positionArray.set(arr, bufferLength);
    texCoordArray.set(polygon, bufferLength);
    bufferLength += 12;
};
webGL.positionArray = new Float32Array(len12);
    // addPoint(20037508, 0, image.width, image.height);
    // addPoint(-20037508/2, 20037508/2, image.width, image.height);
    // addPoint(-20037508/2, 0, image.width, image.height);
    // addPoint(20037508/2, -20037508/2, image.width, image.height);
    // addPoint(0, 0, image.width, image.height);
 */       
        this._render();
    },
	_prpArrays: function (data) {
		var gmx = this._gmx,
            len = data.length,
            len12 = len * 12,
            webGL = this._webGL,
            polygon = new Float32Array([
                0.0, 1.0,
                1.0, 1.0,
                0.0, 0.0,
                0.0, 0.0,
                1.0, 1.0,
                1.0, 0.0
            ]),
            _this = this;

        if(!gmx.mInPixel) this._prpZoomData(this._map._zoom);
        var texCoordArray = new Float32Array(len12);
        var positionArray = new Float32Array(len12);
console.log('sss', gmx.zoomstart, this._map._zoom, data.length);
        if(len < 1) return;
        var geo = data[0];
        if(!webGL.image) {
            webGL.image = geo.item.propHiden.parsedStyleKeys.image;
        }
        var ww = webGL.image.width / gmx.mInPixel,
            hh = webGL.image.height / gmx.mInPixel;

        var bufferLength = 0;
        for (var i = 0; i < len; i++) {
            var geo = data[i];
            var point = geo.geometry.coordinates;
            var x1 = point[0],
                y1 = point[1],
                x2 = x1 + ww,
                y2 = y1 + hh;
            
            var arr = new Float32Array([
                x1, y1,
                x2, y1,
                x1, y2,
                x1, y2,
                x2, y1,
                x2, y2
            ]);
            positionArray.set(arr, bufferLength);
            texCoordArray.set(polygon, bufferLength);
            bufferLength += 12;
        }
        return { tex: webGL.image, positionArray: positionArray, texCoordArray: texCoordArray }
	}
	,

    _chkCanvasSize: function(map) {
		var gmx = this._gmx,
            map = this._map;

        if (!gmx.canvas) {
            var mapsize = map.getSize();
            var options = this.options;
            var canvas = document.createElement("canvas");
            canvas.id = 'webgl-leaflet';
            canvas.width = mapsize.x;
            canvas.height = mapsize.y;
            //canvas.style.opacity = options.opacity || 1;
//canvas.style.zIndex = 1000;
            //canvas.style.position = 'absolute';
canvas.style.opacity = 0.5;
canvas.style.backgroundColor = 'red';
            gmx.canvas = canvas;
            
            //var div = document.createElement("div");
            //div.appendChild(canvas);
            //map._mapPane.insertBefore(div, map._mapPane.firstChild);
            map.getPanes().overlayPane.appendChild(canvas);
        }
	}
	,

    onAdd: function(map) {
		var gmx = this._gmx;

		this._map = map;
		gmx.applyShift = map.options.crs === L.CRS.EPSG3857;

		this._chkCanvasSize();
        var webGL = gmxAPIutils.getWebGL({canvas: gmx.canvas});
        this._webGL = webGL;
        var gl = webGL._gl;
        gl.viewportWidth = gmx.canvas.width;
        gl.viewportHeight = gmx.canvas.height;
        
        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
		map.on('moveend', this._updateShiftY, this);
    },
    
    onRemove: function(map) {
        if(gmx.canvas.parentNode) gmx.canvas.parentNode.removeChild(gmx.canvas);
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
		map.off('moveend', this._updateShiftY, this);
    },
    
    //public interface
    initFromDescription: function(ph) {
        var apikeyRequestHost = this.options.apikeyRequestHost || this._gmx.hostName;
        var sk = gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        this._gmx.sessionKey = sk;
        this._gmx.tileSenderPrefix = "http://" + this._gmx.hostName + "/" + 
            "TileSender.ashx?WrapStyle=None" + 
            "&key=" + encodeURIComponent(sk);
    
        this._gmx.properties = ph.properties;
        this._gmx.geometry = ph.geometry;
        this._gmx.attr = this.initLayerData(ph);
        this._gmx.vectorTilesManager = new gmxVectorTilesManager(this._gmx, ph);
        this._gmx.styleManager = new gmxStyleManager(this._gmx);
        this._gmx.ProjectiveImage = new ProjectiveImage();
        this._update();
                
        this.initPromise.resolve();
    },

	setStyle: function (style, num) {
		var gmx = this._gmx;
        this.initPromise.done(function() {
            gmx.styleManager.setStyle(style, num);
        });
	}
	,

	setFilter: function (func) {
        this._gmx.vectorTilesManager.setFilter('userFilter', func);
		this._update();
	}
	,
	setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;
		gmx.beginDate = beginDate;
		gmx.endDate = endDate;
        gmx.vectorTilesManager.setDateInterval(beginDate, endDate);
		this._update();
	},
    
    addTo: function (map) {
		map.addLayer(this);
		return this;
	},
    
    _drawTileAsync: function (tilePoint, zoom) {
        var queue = this._drawQueue,
            isEmpty = queue.length === 0,
            gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom),
            key = zoom + '_' + tilePoint.x + '_' + tilePoint.y,
            _this = this
            
        if ( key in this._drawQueueHash ) {
            return;
        }
            
        var drawNextTile = function() {
            if (!queue.length) {
//				_this.fire('doneDraw');
                return;
            }
            
            var bbox = queue.shift();
            delete _this._drawQueueHash[bbox.key];
            _this.gmxDrawTile(bbox.tp, bbox.z);
            
            setTimeout(drawNextTile, 0);
        }
            
        queue.push({gtp: gtp, tp: tilePoint, z: zoom, key: key});
        this._drawQueueHash[key] = true;
		if (isEmpty) {
			//this.fire('startDraw');
			setTimeout(drawNextTile, 0);
		}
		
    },
	
	_updateShiftY: function() {
        var gmx = this._gmx,
            map = this._map;

        var pos = map.getCenter();
        var lat = L.Projection.Mercator.unproject({x: 0, y: gmxAPIutils.y_ex(pos.lat)}).lat;
        var p1 = map.project(new L.LatLng(lat, pos.lng), gmx.currentZoom);
        var point = map.project(pos);
        gmx.shiftY = point.y - p1.y;
        //var bounds = map.getBounds();
var pixelOrigin = map.getPixelOrigin();
//console.log('sdddddddd ', pixelOrigin, L.point(200, 300));
//L.DomUtil.setPosition(gmx.canvas, pixelOrigin);
//L.DomUtil.setPosition(gmx.canvas, pixelOrigin, L.Browser.chrome || L.Browser.android23);
		gmx.canvasPos = map.latLngToLayerPoint(map.getBounds().getNorthWest());
var p1 = new L.Point(gmx.canvasPos.x, gmx.canvasPos.y - 0);
        L.DomUtil.setPosition(gmx.canvas, p1);
        this._update();
	},
    
    _prpZoomData: function(zoom) {
        var gmx = this._gmx,
            map = this._map;
        gmx.tileSize = gmxAPIutils.tileSizes[zoom];
        gmx.mInPixel = 256 / gmx.tileSize;
        gmx._tilesToLoad = 0;
        gmx.currentZoom = map._zoom;
    },
	_update: function () {
		if (!this._map || this._gmx.zoomstart) return;

		var bounds = this._map.getPixelBounds(),
		    zoom = this._map.getZoom(),
		    tileSize = 256;

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			// clearTimeout(this._clearBgBufferTimer);
			// this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			return;
		}

		var shiftY = this._gmx.shiftY || 0;		// Сдвиг к OSM
		bounds.min.y += shiftY;
		bounds.max.y += shiftY;

		var nwTilePoint = new L.Point(
		        Math.floor(bounds.min.x / tileSize),
		        Math.floor(bounds.min.y / tileSize)),

		    seTilePoint = new L.Point(
		        Math.floor(bounds.max.x / tileSize),
		        Math.floor(bounds.max.y / tileSize)),

		    tileBounds = new L.Bounds(nwTilePoint, seTilePoint);

		var j, i, point;

		for (j = tileBounds.min.y; j <= tileBounds.max.y; j++) {
			for (i = tileBounds.min.x; i <= tileBounds.max.x; i++) {
                this._addTile({x: i, y: j});
			}
		}
        //if(!this._gmx._tilesToLoad) 
        //this._render();
        this._refreshPositionArray();
        
	}
	,
    _addTile: function (tilePoint) {
        //console.log('addTile', tilePoint);
		var myLayer = this,
            zoom = this._map._zoom,
            gmx = this._gmx;

		if (!gmx.attr || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            return;
        }

		var gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var key = zoom + '_' + tilePoint.x + '_' + tilePoint.y;
        if (!gmx.tileSubscriptions[key]) {
            gmx._tilesToLoad++;
            var subscrID = gmx.vectorTilesManager.on(gmxTilePoint, function() {
                myLayer._drawTileAsync(tilePoint, zoom);
            });
            gmx.tileSubscriptions[key] = {id: subscrID, gtp: gmxTilePoint};
        }
	},
	gmxDrawTile: function (tilePoint, zoom) {
		var gmx = this._gmx,
            _this = this;

        if(gmx.zoomstart) return;

		var gtp = gmxAPIutils.getTileNumFromLeaflet(tilePoint, zoom);
        var geoItems = gmx.vectorTilesManager.getItems(gtp, zoom); //call each time because of possible items updates
        //var screenTile = new gmxScreenVectorTile(this, tilePoint, zoom);
        this._gmx.styleManager.deferred.done(function () {
            //screenTile.drawTile();
            if(geoItems.length) _this.putToWebGL(geoItems);
            if (gmx.vectorTilesManager.getNotLoadedTileCount(gtp) === 0) {
                gmx._tilesToLoad--;
                _this._tileLoaded();
            }
        });
	}
	,
	_tileLoaded: function () {
        if (this._gmx._tilesToLoad === 0) {
//			this.fire('load');

		}
	}
	,
    initLayerData: function(layerDescription) {					// построение списка тайлов
        var gmx = this._gmx,
            res = {items:{}, tileCount:0, itemCount:0},
            prop = layerDescription.properties,
            type = prop.type + (prop.Temporal ? 'Temporal' : '');

		var cnt;
		if(type === 'VectorTemporal') {
            cnt = prop.TemporalTiles;
			
			res.TemporalColumnName = prop.TemporalColumnName;
			res.TemporalPeriods = prop.TemporalPeriods;
			
			var ZeroDateString = prop.ZeroDate || '01.01.2008';	// нулевая дата
			var arr = ZeroDateString.split('.');
			var zn = new Date(					// Начальная дата
				(arr.length > 2 ? arr[2] : 2008),
				(arr.length > 1 ? arr[1] - 1 : 0),
				(arr.length > 0 ? arr[0] : 1)
				);
			res.ZeroDate = new Date(zn.getTime()  - zn.getTimezoneOffset()*60000);	// UTC начальная дата шкалы
			res.ZeroUT = res.ZeroDate.getTime() / 1000;
		}
        
		res.tileCount = cnt;
		res.layerType = type;						// VectorTemporal Vector
		res.identityField = prop.identityField;	// ogc_fid
		res.GeometryType = prop.GeometryType;		// тип геометрий обьектов в слое
		res.minZoomRasters = prop.RCMinZoomForRasters;// мин. zoom для растров
		return res;
	}
});