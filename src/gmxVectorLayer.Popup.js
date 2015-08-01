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
    },

    enablePopup: function () {
        this._popupDisabled = false;
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
        if (options.originalEvent && options.originalEvent.ctrlKey) {
            this.closePopup();
        } else if (this._popup._state === 'mouseover') {
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

    _outPopup: function () {
        if (this._popup._state === 'mouseover') {
            this.closePopup();
        }
    },

    _setPopupContent: function (options) {
        var gmx = options.gmx || {},
            balloonData = gmx.balloonData || {},
            properties = gmx.properties,
            target = gmx.target,
            geometry = target.geometry,
            templateBalloon = this._popup._initContent || balloonData.templateBalloon,
            outItem = {
                id: gmx.id,
                latlng: options.latlng,
                properties: gmx.properties,
                templateBalloon: templateBalloon
            };

        if (geometry.type === 'POINT') {
            var coord = geometry.coordinates;
            outItem.latlng = L.Projection.Mercator.unproject({x: coord[0], y: coord[1]});
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
                var geometries = this._gmx.dataManager.getItemGeometries(gmx.id),
                    unitOptions = this._map ? this._map.options : {};

                outItem.summary = L.gmxUtil.getGeometriesSummary(geometries, unitOptions);
                templateBalloon = L.gmxUtil.parseBalloonTemplate(templateBalloon, {
                    properties: properties,
                    tileAttributeTypes: this._gmx.tileAttributeTypes,
                    unitOptions: unitOptions,
                    geometries: geometries
                });
            }

            this._popup.setContent(templateBalloon);
            outItem.templateBalloon = templateBalloon;
        }
        this._popup.options._gmxID = gmx.id;
        return outItem;
    },

    _openPopup: function (options) {
        var originalEvent = options.originalEvent || {},
            skip = this._popupDisabled ||
                    originalEvent.ctrlKey || originalEvent.altKey || originalEvent.shiftKey;

        if (!skip) {
            var type = options.type,
                gmx = options.gmx || {},
                balloonData = gmx.balloonData || {};

            this._popup._state = type;
            if (type === 'click') {
                if (balloonData.DisableBalloonOnClick && !this.hasEventListeners('popupopen')) { return; }
                this._popup.options.closeButton = this._popup.options.autoPan = true;
            } else if (type === 'mouseover') {
                if (balloonData.DisableBalloonOnMouseMove) {
                    this._popup._state = '';
                    return;
                }
                this._popup.options.closeButton = this._popup.options.autoPan = false;
            } else {
                return;
            }
            var outItem = this._setPopupContent(options);
            this._popup.setLatLng(outItem.latlng);

            this.fire('popupopen', {
                popup: this._popup,
                gmx: outItem
            });
            this._popup._initLayout();
            if (type === 'mouseover') {
                this._popup._container.style.marginBottom = '7px';
            }
            this._map.openPopup(this._popup);
        }
    }
});
