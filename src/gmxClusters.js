var gmxClusters = function(options) {
    if (!options) options = {};
    this.count = options.iterationCount || 1;       // K-means iteration count
    this.data = [];
};

function getCenterGeometry(arr) {
    var len = arr.length;
    if (len === 1) return arr[0];
    else if (len < 1) return null;

    var xx = 0, yy = 0,
        lastID = null,
        members = [];

    arr.forEach(function(item) {
        lastID = item.id;
        xx += item.x;
        yy += item.y;
        members.push(item);
    });
    xx /= len;
    yy /= len;

    return {
        id: lastID
        ,type: 'Point'
        ,x: xx
        ,y: yy
        ,propHiden: {
            subType: 'cluster'
            ,_members: members
        }
    };
}
// find the nearest group
function findGroup(item, centers) {
    var min = Number.MAX_VALUE,
        group = -1;
    for(var i = 0, len = centers.length; i < len; i++) {
        var it = centers[i],
            x = item.x - it.x,
            y = item.y - it.y,
            d = x * x + y * y;
        if(d < min){
            min = d;
            group = i;
        }
    }
    return group;
}

L.extend(gmxClusters.prototype, {
    add: function (data, clear) {
        if (clear) this.data = [];
        this.data.push(data);
        return this;
    },

    // remove: function (ids) {
        // return this;
    // },

    getClusters: function (radiusMerc) {
        var count = 0,
            grpCount = 0,
            grpHash = {};
        
        this.data.forEach(function(data) {
            count += data.count;
            data.added.forEach(function(it) {
                var id = it.id,
                    arr = it.properties,
                    geo = arr[arr.length - 1];
                if (geo.type === 'POINT') {
                    var coord = geo.coordinates,
                        x = coord[0],
                        y = coord[1],
                        key = Math.floor(x / radiusMerc) + '_' + Math.floor(y / radiusMerc);

                    var ph = grpHash[key];
                    if (!ph) {
                        ph = {arr:[]};
                        grpCount++;
                    }
                    it.x = x;
                    it.y = y;
                    ph.arr.push({x: x, y: y, item: it});
                    grpHash[key] = ph;
                }
            });
        });

        var _this = this,
            centersGeometry = [],
            clusterNum =  0;
        for (var key in grpHash) {
            var ph = grpHash[key],
                pt = getCenterGeometry(ph.arr);
            if (ph.arr.length > 1) {
                clusterNum++;
                pt.id = 'cl_' + clusterNum;
                pt.subType = 'cluster';
            }
            centersGeometry.push(pt);
        }

        function kmeansGroups(centers) {
            var newObjIndexes = [];
            var out = [];
            for(var i = 0, len = _this.data.length; i < len; i++) {
                for(var j = 0, arr = _this.data[i], len1 = arr.added.length; j < len1; j++) {
                    var it = arr.added[j],
                        group = findGroup(it, centers);
                    if (group === -1) {
                        out.push(it);
                    } else {
                        if (!newObjIndexes[group]) newObjIndexes[group] = [];
                        newObjIndexes[group].push(it);
                    }
                }
            }

            //centersGeometry = [];
            clusterNum =  0;
            newObjIndexes.forEach(function(it) {
                var pt = getCenterGeometry(it);
                if (it.length > 1) {
                    clusterNum++;
                    pt.id = 'cl_' + clusterNum;
                    pt.subType = 'cluster';
                    var from = pt.propHiden._members[0].arr,
                        len = from.length,
                        arr = new Array(len);
                    arr[0] = pt.id;
                    arr[len - 1] = {
                        type: 'POINT',
                        coordinates: [pt.x, pt.y]
                    };
                    pt.arr = arr;
                    pt.dataOption = {
                        boundsArr: [],
                        bounds: L.gmxUtil.bounds([[pt.x, pt.y]])
                    };
                }
                out.push(pt);
            });
            return out;
        }

        for(var i = 0; i < this.count; i++) {
            centersGeometry = kmeansGroups(centersGeometry);
        }
        return {count: centersGeometry.length, added: centersGeometry};
    }
});
L.gmx = L.gmx || {};
L.gmx.kmeansClusters = gmxClusters;
