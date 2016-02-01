L.gmx.VectorLayer.include({
    bindPopup: function (content, options) {
        var popupOptions = L.extend({maxWidth: 10000, className: 'gmxPopup'}, options);

        if (this._popup) { this.unbindPopup(); }
        if (content instanceof L.Popup) {
            this._popup = content;
        } else {
            if (!this._popup || options) {
                this._popup = new L.Popup(popupOptions);
            }
            this._popup.setContent(content);
        }
        this._popup._initContent = content;
        this._popup._state = '';

        if (!this._popupHandlersAdded) {
            this
                .on('click', this._openPopup, this)
                .on('mousemove', this._movePopup, this)
                .on('mouseover', this._overPopup, this)
                .on('mouseout', this._outPopup, this)
                .on('remove', this.closePopup, this);

            this._popupHandlersAdded = true;
        }
        if (popupOptions && popupOptions.popupopen) {
            this._popupopen = popupOptions.popupopen;
        }

        this._popup.updateLayout = this._popup._updateLayout;

        return this;
    },

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this._openPopup, this)
                .off('mousemove', this._movePopup, this)
			    .off('mouseover', this._overPopup, this)
                .off('mouseout', this._outPopup, this)
			    .off('remove', this.closePopup, this);

            this._popupopen = null;
			this._popupHandlersAdded = false;
		}
        this._gmx.balloonEnable = false;
		return this;
	},

    disablePopup: function () {
        this._popupDisabled = true;
		return this;
    },

    enablePopup: function () {
        this._popupDisabled = false;
		return this;
    },

	openPopup: function (latlng, options) {

		if (this._popup) {
			// open the popup from one of the path's points if not specified
			latlng = latlng || this._latlng ||
			         this._latlngs[Math.floor(this._latlngs.length / 2)];

			options = options || {};
            options.latlng = latlng;
            this._openPopup(options);
		}

		return this;
	},

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
            this.fire('popupclose', {popup: this._popup});
		}
		return this;
	},

    _movePopup: function (options) {
        if (this._popup._state === 'mouseover') {
            var id = this._popup.options._gmxID || -1;
            if (id !== options.gmx.id) {
                this._setPopupContent(options);
            }
            this._popup.setLatLng(options.latlng);
        }
    },

    _overPopup: function (options) {
        if (!this._popup._map) {
            this._openPopup(options);
        }
        if (this._popup._state === 'mouseover') {
            this._popup.setLatLng(options.latlng);
        }
    },

    _outPopup: function (ev) {
        if (this._popup._state === 'mouseover' && !ev.gmx.prevId) {
        // if (this._popup._state === 'mouseover') {
            this.closePopup();
        }
    },

    _callBalloonHook: function (props, div) {

        var spans = div.getElementsByTagName('span'),
            hooksCount = {},
            key, i, len;
        for (key in this._balloonHook) {    // collect hook counts
            var hookID = this._balloonHook[key].hookID;
            hooksCount[key] = 0;
            for (i = 0, len = spans.length; i < len; i++) {
                if (spans[i].id === hookID) {
                    hooksCount[key]++;
                }
            }
        }

        for (key in this._balloonHook) {
            var hook = this._balloonHook[key],
                fid = hook.hookID,
                notFound = true;

            for (i = 0, len = spans.length; i < len; i++) {
                var node = spans[i];
                if (node.id === fid) {
                    notFound = false;
                    node.id += '_' + i;
                    hook.callback(props, div, node, hooksCount);
                }
            }
            if (notFound) {
                hook.callback(props, div, null, hooksCount);
            }
        }
    },

    _setPopupContent: function (options) {
        var gmx = options.gmx || {},
            balloonData = gmx.balloonData || {},
            properties = L.extend({}, gmx.properties),
            target = gmx.target,
            geometry = target.geometry,
            offset = target.offset,
            templateBalloon = this._popup._initContent || balloonData.templateBalloon || '',
            outItem = {
                id: gmx.id,
                latlng: options.latlng,
                properties: properties,
                templateBalloon: templateBalloon
            };

        if (geometry.type === 'POINT') {
            var coord = geometry.coordinates;
            outItem.latlng = L.Projection.Mercator.unproject({x: coord[0], y: coord[1]});
        }
        if (offset) {
            var protoOffset = L.Popup.prototype.options.offset;
            this._popup.options.offset = [-protoOffset[0] - offset[0], protoOffset[1] - offset[1]];
        }

        if (this._popupopen) {
            this._popupopen({
                popup: this._popup,
                latlng: outItem.latlng,
                layerPoint: options.layerPoint,
                contentNode: this._popup._contentNode,
                containerPoint: options.containerPoint,
                originalEvent: options.originalEvent,
                gmx: outItem
            });
        } else if (!(templateBalloon instanceof L.Popup)) {
            if (!(templateBalloon instanceof HTMLElement)) {
                var geometries = null,
                    unitOptions = this._map ? this._map.options : {};
                if(!this.options.isGeneralized) {
                    geometries = this._gmx.dataManager.getItemGeometries(gmx.id);
                    outItem.summary = L.gmxUtil.getGeometriesSummary(geometries, unitOptions);
                }
                if (this._balloonHook) {
                    if (!templateBalloon) {
                        templateBalloon = gmxAPIutils.getDefaultBalloonTemplate(properties);
                    }
                    for (var key in this._balloonHook) {
                        properties[key] = gmxAPIutils.parseTemplate(this._balloonHook[key].resStr, properties);
                    }
                }
                templateBalloon = L.gmxUtil.parseBalloonTemplate(templateBalloon, {
                    properties: properties,
                    tileAttributeTypes: this._gmx.tileAttributeTypes,
                    unitOptions: unitOptions,
                    geometries: geometries
                });
            }

            var contentDiv = L.DomUtil.create('div', '');
            contentDiv.innerHTML = templateBalloon;
            this._popup.setContent(contentDiv);
            if (this._balloonHook) {
                this._callBalloonHook(gmx.properties, this._popup.getContent());
            }
            //outItem.templateBalloon = templateBalloon;
        }
        this._popup.options._gmxID = gmx.id;
        return outItem;
    },

    _openPopup: function (options) {
        var originalEvent = options.originalEvent || {},
            skip = this._popupDisabled || originalEvent.ctrlKey || originalEvent.altKey || originalEvent.shiftKey;

        if (!skip) {
            var type = options.type,
                _popup = this._popup,
                gmx = options.gmx || {},
                balloonData = gmx.balloonData || {};

            if (type === 'click') {
                if (balloonData.DisableBalloonOnClick && !this.hasEventListeners('popupopen')) { return; }
                _popup.options.autoPan = true;
            } else if (type === 'mouseover') {
                if (balloonData.DisableBalloonOnMouseMove) {
                    _popup._state = '';
                    return;
                }
                _popup.options.autoPan = false;
            } else {
                return;
            }
            _popup._state = type;
            var outItem = this._setPopupContent(options);
            _popup.setLatLng(outItem.latlng);

            this.fire('popupopen', {
                popup: _popup,
                gmx: outItem
            });
            this._map.openPopup(_popup);
            if (_popup._closeButton) {
                var closeStyle = _popup._closeButton.style;
                if (type === 'mouseover' && closeStyle !== 'hidden') {
                    closeStyle.visibility = 'hidden';
                    _popup._container.style.marginBottom = '7px';
                    _popup._container.style.pointerEvents = 'none';
                } else if (type === 'click' && closeStyle !== 'inherit') {
                    closeStyle.visibility = 'inherit';
                    _popup._container.style.marginBottom = '';
                    _popup._container.style.pointerEvents = '';
                }
            }
        }
    },

    addPopupHook: function (key, callback) {
        if (!this._balloonHook) { this._balloonHook = {}; }
        if (!this._balloonHook[key]) {
            var hookID = '_' + L.stamp({});
            this._balloonHook[key] = {
                key: key,
                hookID: hookID,
                resStr: '<span id="' + hookID + '"></span>',
                callback: callback
            };
        }
        return this;
    },

    removePopupHook: function(key) {
        if (this._balloonHook) { delete this._balloonHook[key]; }
        return this;
    }
});
