L.gmx.VectorLayer.include({
    _gmxFirstObjectsByPoint: function (geoItems, mercPoint) {    // Получить верхний объект по координатам mouseClick
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
                parsedStyle = gmx.styleManager.getObjStyle(item),
                sx = parsedStyle.sx || currentStyle.sx || 0,
                sy = parsedStyle.sy || currentStyle.sy || 0,
                lineWidth = currentStyle.lineWidth || parsedStyle.lineWidth || 0,
                dx = iconScale * (sx + lineWidth / 2) / mInPixel,
                dy = iconScale * (sy + lineWidth / 2) / mInPixel;

            if (!dataOption.bounds.intersectsWithDelta(bounds, dx, dy)) { continue; }

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
                if (!gmxAPIutils.isPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) { continue; }
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
                if (!flag) { continue; }
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
                if (!flag) { continue; }
            } else if (chktype === 'POINT') {
                if (parsedStyle.type === 'circle') {
                    var x = coords[0] - mercPoint[0],
                        y = coords[1] - mercPoint[1];
                    if (x * x + y * y > dx * dx) { continue; }
                } else if (!dataOption.bounds.intersectsWithDelta(bounds, dx / 2, dy / 2)) {
                    continue;
                }
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
            (
            this.hasEventListeners('mouseover') ||
            this.hasEventListeners('mouseout') ||
            this.hasEventListeners(type) ||
            (type === 'mousemove' && gmx.properties.fromType !== 'Raster')
            )) {
            
            var lng = ev.latlng.lng % 360,
                latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
                point = L.Projection.Mercator.project(latlng)._subtract(
                    {x: gmx.shiftXlayer || 0, y: gmx.shiftYlayer || 0}
                ),
                delta = 5 / gmx.mInPixel,
                mercatorPoint = [point.x, point.y],
                bounds = gmxAPIutils.bounds([mercatorPoint]);
            bounds = bounds.addBuffer(delta);
            
            //создаём observer только для того, чтобы сделать выборку данных вокруг курсора
            var observerOptions = {
                type: 'resend',
                bbox: bounds,
                dateInterval: gmx.layerType === 'VectorTemporal' ? [gmx.beginDate, gmx.endDate] : null,
                filters: ['clipFilter', 'styleFilter', 'userFilter'],
                active: false //делаем его неактивным, так как потом будем явно выбирать данные
            };
            
            var observer = gmx.dataManager.addObserver(observerOptions, 'hover');
            
            var geoItems = gmx.dataManager.getItems('hover');
            
            gmx.dataManager.removeObserver('hover');

            if (geoItems && geoItems.length) {
                if (geoItems.length > 1 && gmx.sortItems) { geoItems = this.getSortedItems(geoItems); }

                var target = this._gmxFirstObjectsByPoint(geoItems, mercatorPoint);
                if (target) {
                    var idr = target.id,
                        item = gmx.dataManager.getItem(idr),
                        prevId = lastHover ? lastHover.id : null,
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
                        layer: this,
                        targets: geoItems,
                        target: target,
                        balloonData: gmx.styleManager.getItemBalloon(idr),
                        properties: layer.getItemProperties(target.properties),
                        currentFilter: item.currentFilter,
                        prevId: prevId,
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
        if (skipOver) {
            if (lastHover) { lastHover.prevId = null; }
            chkHover('mouseout');
            gmx.lastHover = null;
        }
        if (this._map) {
            this._map.doubleClickZoom.enable();
        }
        return 0;
    }
});
