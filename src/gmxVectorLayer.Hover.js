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
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = (currentStyle.lineWidth || parsedStyle.lineWidth || 0) / mInPixel,
                dx = (currentStyle.sx || 0) / mInPixel + lineWidth,
                dy = (currentStyle.sy || 0) / mInPixel + lineWidth;

            if (dx > dy) {
                dx = dy;
            } else {
                dy = dx;
            }

            if (!dataOption.bounds.intersectsWithDelta(bounds, dx, dy)) { continue; }

            var geom = geoItem[geoItem.length - 1],
                type = geom.type;

            if (type === 'POINT') {
                if (!dataOption.bounds.intersectsWithDelta(bounds, dx * iconScale, dy * iconScale)) { continue; }
            } else if (type === 'POLYGON' || type === 'MULTIPOLYGON') {
                var marker = parsedStyle && parsedStyle.image ? parsedStyle.image : null,
                    fill = currentStyle.fillStyle || currentStyle.canvasPattern || parsedStyle.bgImage;
                if (marker) {           // POINT
                    if (!dataOption.bounds.intersectsWithDelta(bounds, dx * iconScale, dy * iconScale)) { continue; }
                } else if (!fill) {     // LINESTRING
                    if (!gmxAPIutils.isPointInStroke(dataOption.path, mercPoint, lineWidth)) { continue; }
                } else {                // POLYGON MULTIPOLYGON
                    if (!gmxAPIutils.isPointInPath(dataOption.pathFill, mercPoint)) { continue; }
                }
            } else if (type === 'LINESTRING' || type === 'MULTILINESTRING') {
                if (!gmxAPIutils.isPointInStroke(dataOption.path, mercPoint, lineWidth)) { continue; }
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
            var zKey = ev.originalEvent.target.zKey;
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
                            layer: this,
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
