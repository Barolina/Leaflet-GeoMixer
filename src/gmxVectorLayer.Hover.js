L.gmx.VectorLayer.include({
    _gmxFirstObjectsByPoint: function (geoItems, mercPoint) {    // Получить верхний обьект по координатам mouseClick
        var gmx = this._gmx,
            mInPixel = gmx.mInPixel,
            bounds = gmxAPIutils.bounds([mercPoint]);

        for (var i = geoItems.length - 1; i >= 0; i--) {
            var geoItem = geoItems[i].properties,
                idr = geoItem[0],
                dataOption = geoItems[i].dataOption || {},
                item = gmx.dataManager.getItem(idr),
                currentStyle = item.currentStyle || item.parsedStyleKeys,
                iconScale = currentStyle.iconScale || 1,
                sx = currentStyle.sx || 0,
                sy = currentStyle.sy || 0,
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = currentStyle.lineWidth || parsedStyle.lineWidth || 0,
                dx = (sx + lineWidth) / mInPixel,
                dy = (sy + lineWidth) / mInPixel;

            if (dx > dy) {
                dx = dy;
            } else {
                dy = dx;
            }

            if (!dataOption.bounds.intersectsWithDelta(bounds, dx, dy)) {continue;}

            var geom = geoItem[geoItem.length - 1],
                fill = currentStyle.fillStyle || currentStyle.canvasPattern || parsedStyle.bgImage,
                marker = parsedStyle && parsedStyle.image ? parsedStyle.image : null,
                type = geom.type,
                chktype = type,
                hiddenLines = dataOption.hiddenLines,
                boundsArr = dataOption.boundsArr,
                coords = geom.coordinates,
                ph = {
                    point: mercPoint,
                    bounds: bounds,
                    coords: coords,
                    boundsArr: boundsArr
                };

            if (type === 'MULTIPOLYGON' || type === 'POLYGON') {
                if (marker) {
                    chktype = 'POINT';
                } else if (!fill) {
                    if (type === 'POLYGON') {
                        chktype = 'MULTILINESTRING';
                        hiddenLines = hiddenLines[0];
                    } else {
                        chktype = 'LIKEMULTILINESTRING';
                    }
                    ph.hidden = hiddenLines;
                }
            }

            if (chktype === 'LINESTRING') {
                if (!gmxAPIutils.isPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) {continue;}
            } else if (chktype === 'LIKEMULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                var flag = false,
                    j,
                    len;
                for (j = 0, len = coords.length; j < len; j++) {
                    ph.coords = coords[j];
                    ph.hidden = hiddenLines[j];
                    ph.boundsArr = boundsArr[j];
                    if (gmxAPIutils.isPointInLines(ph)) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) {continue;}
            } else if (chktype === 'MULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                ph.hidden = hiddenLines;
                if (!gmxAPIutils.isPointInLines(ph)) {
                    continue;
                }
            } else if (chktype === 'MULTIPOLYGON' || chktype === 'POLYGON') {
                var chkPoint = mercPoint;
                flag = false;
                if (chktype === 'POLYGON') {
                    coords = [geom.coordinates];
                    boundsArr = [dataOption.boundsArr];
                }
                for (j = 0, len = coords.length; j < len; j++) {
                    var arr = coords[j],
                        bbox = boundsArr[j];
                    for (var j1 = 0, len1 = arr.length; j1 < len1; j1++) {
                        var b = bbox[j1];
                        if (b.intersects(bounds)) {
                            if (gmxAPIutils.isPointInPolygonWithHoles(chkPoint, arr)) {
                                flag = j1 === 0 ? true : false;
                                break;
                            }
                        }
                    }
                }
                if (!flag) {continue;}
            } else if (chktype === 'POINT') {
                coords = gmxAPIutils.getMarkerPolygon(dataOption.bounds, dx * iconScale, dy * iconScale);
                if (!gmxAPIutils.isPointInPolygonArr(mercPoint, coords)) {continue;}
            }

            return {
                id: idr,
                properties: item.properties,
                geometry: geom,
                bounds: item.bounds,
                parsedStyle: parsedStyle
            };
        }
        return null;
    },

    gmxEventCheck: function (ev, skipOver) {
        var layer = this,
            gmx = layer._gmx,
            type = ev.type,
            lastHover = gmx.lastHover,
            chkHover = function (evType) {
                if (lastHover && type === 'mousemove') {
                    if (evType && layer.hasEventListeners(evType)) {
                        ev.gmx = lastHover;
                        layer.fire(evType, ev);
                    }
                    if (lastHover.observersToUpdate) {
                        layer._redrawTilesHash(lastHover.observersToUpdate);
                    }
                }
            };
        if (!skipOver && ev.originalEvent &&
            (type === 'mousemove'
            || this.hasEventListeners('mouseover')
            || this.hasEventListeners('mouseout')
            || this.hasEventListeners(type)
            )) {
            var zKey = ev.originalEvent.target.id;
            if (!zKey) {
                var pos = layer._map.gmxMousePos,
                    px = pos.x + gmx.shiftX,
                    py = pos.y + gmx.shiftY;
                zKey = this._map._zoom + ':' + Math.floor(px / 256) + ':' + Math.floor(py / 256);
            }
            var observer = gmx.dataManager.getObserver(zKey);
            if (observer) {
                var lng = ev.latlng.lng % 360,
                    latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
                    point = L.Projection.Mercator.project(latlng)._subtract(
                        {x: gmx.shiftXlayer || 0, y: gmx.shiftYlayer || 0}
                    ),
                    delta = 5 / gmx.mInPixel,
                    mercatorPoint = [point.x, point.y],
                    bounds = gmxAPIutils.bounds([mercatorPoint]);
                bounds = bounds.addBuffer(delta);
                var geoItems = gmx.dataManager.getItems(zKey, bounds);

                if (geoItems && geoItems.length) {
                    if (geoItems.length > 1 && gmx.sortItems) { geoItems = geoItems.sort(gmx.sortItems); }

                    var target = this._gmxFirstObjectsByPoint(geoItems, mercatorPoint);
                    if (target) {
                        var idr = target.id,
                            item = gmx.dataManager.getItem(idr),
                            changed = !lastHover || lastHover.id !== idr;
                        if (type === 'mousemove' && lastHover) {
                            if (!changed) {
                                ev.gmx = lastHover;
                                this.fire(type, ev);
                                return idr;
                            }
                            chkHover(item.currentFilter !== lastHover.currentFilter ? 'mouseout' : '');
                            gmx.lastHover = null;
                        }

                        ev.gmx = {
                            targets: geoItems,
                            target: target,
                            balloonData: gmx.styleManager.getItemBalloon(idr),
                            properties: layer.getItemProperties(target.properties),
                            currentFilter: item.currentFilter,
                            id: idr
                        };
                        if (this.hasEventListeners(type)) { this.fire(type, ev); }
                        if (type === 'mousemove' && changed) {
                            lastHover = gmx.lastHover = ev.gmx;
                            if (item.hoverDiff) {
                                var currentStyle = gmx.styleManager.getObjStyle(item);
                                if (currentStyle) {
                                    lastHover.observersToUpdate = layer._getTilesByBounds(target.bounds, currentStyle.maxSize || 256);
                                }
                            }
                            chkHover('mouseover');
                        }
                        this._map.doubleClickZoom.disable();
                        return idr;
                    }
                }
            }
        }
        if (skipOver && type !== 'mousedown' && type !== 'mouseup') {
            gmx.lastHover = null;
            chkHover('mouseout');
        }
        this._map.doubleClickZoom.enable();
        return 0;
    }
});
