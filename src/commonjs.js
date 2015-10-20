var L;
if (module && module.exports) {
    L = require('leaflet');
    L.gmx = {};
    module.exports = L.gmx;
} else {
    L = window.L;
}