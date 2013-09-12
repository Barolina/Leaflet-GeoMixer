var gmxStyleManager = function(styleDescription, type) {

    var MAX_STYLE_SIZE = 256;

    var defaultStyle = {lineWidth: 1, strokeStyle: 'rgba(0, 0, 255, 1)'};
    var styles = [];
    
    if (styleDescription) {
        for (var i = 0, len = styleDescription.length; i < len; i++)
        {
            var it = styleDescription[i];
            var pt = {};
            var renderStyle = it['RenderStyle'];
            if(renderStyle['outline']) {
                var outline = renderStyle['outline'];
                pt['lineWidth'] = outline.thickness || 0;
                var color = outline.color || 255;
                var opacity = ('opacity' in outline ? outline['opacity']/100 : 1);
                pt['strokeStyle'] = gmxAPIutils.dec2rgba(color, opacity);
            }
            
            if(renderStyle['marker']) {
                var marker = renderStyle.marker;
                if(type === 'point') {
                    if(marker['size']) {
                        pt['sx'] = pt['sy'] = marker['size'];
                    } else {
                        pt['circle'] = 4;
                        pt['sx'] = pt['sy'] = 2 * pt['circle'];
                    }
                }
            }
            
            if(renderStyle['fill']) {
                var fill = renderStyle.fill;
                var color = fill.color || 255;
                var opacity = ('opacity' in fill ? fill['opacity']/100 : 1);
                pt['fillStyle'] = gmxAPIutils.dec2rgba(color, opacity);
            }
            styles.push(pt);
        }
    } else {
        styles.push(defaultStyle);
    }

    this.getObjStyle = function(obj, zoom) {
        return styles[0];
    }
    
    //obj can be "null" - estimete style size for arbitrary object
    this.getStyleSize = function(obj, zoom) {
        if ('sx' in styles[0]) {
            return {sx: styles[0].sx, sy: styles[0].sy};
        } else {
            return {sx: 0, sy: 0};
        }
    }
}