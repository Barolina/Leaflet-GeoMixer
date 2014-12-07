var ModisPixelDimensions = [];

function buildModisPixelDimensionsTable()
{
	// Don't rebuild the table if it was already built
	if(ModisPixelDimensions.length > 0){
		return;
	}

	var h = 705.0;		// Terra/Aqua orbit altitude [km]
	var p = 1.0;		// nadir pixel resolution [km]
	var EARTH_RADIUS = 6371.0;
    var SAMPLES = 1354;

	var r = EARTH_RADIUS + h;	/* [km] */
	var s = p / h;                  /* [rad] */

	for(var sample = 0;sample<1354;sample++){
		var theta = sample * s + 0.5 * s - (0.5*SAMPLES) * s;
		var cos_theta = Math.cos(theta);

		var temp = Math.pow((EARTH_RADIUS/r),2.0) - Math.pow(Math.sin(theta),2.0);
		var sqrt_temp = Math.sqrt(temp);

		var DS = EARTH_RADIUS * s * (cos_theta/sqrt_temp - 1.0)*1000;
		var DT = r*s*(cos_theta - sqrt_temp)*1000;
		ModisPixelDimensions[sample] = [DS,DT];
	}
}

var _hq = {
	getDistant: function(cpt, bl) {
		var Vy = bl[1][0] - bl[0][0];
		var Vx = bl[0][1] - bl[1][1];
		return (Vx * (cpt[0] - bl[0][0]) + Vy * (cpt[1] -bl[0][1]))
	},
	findMostDistantPointFromBaseLine: function(baseLine, points) {
		var maxD = 0;
		var maxPt = new Array();
		var newPoints = new Array();
		for (var idx in points) {
			var pt = points[idx];
			var d = this.getDistant(pt, baseLine);
			
			if ( d > 0) {
				newPoints.push(pt);
			} else {
				continue;
			}
			
			if ( d > maxD ) {
				maxD = d;
				maxPt = pt;
			}
		
		} 
		return {'maxPoint':maxPt, 'newPoints':newPoints}
	},

	buildConvexHull: function(baseLine, points) {
		
		var convexHullBaseLines = new Array();
		var t = this.findMostDistantPointFromBaseLine(baseLine, points);
		if (t.maxPoint.length) {
			convexHullBaseLines = convexHullBaseLines.concat( this.buildConvexHull( [baseLine[0],t.maxPoint], t.newPoints) );
			convexHullBaseLines = convexHullBaseLines.concat( this.buildConvexHull( [t.maxPoint,baseLine[1]], t.newPoints) );
			return convexHullBaseLines;
		} else {       
			return [baseLine];
		}    
	},
	getConvexHull: function(points) {	

		if (points.length == 1)
			return [[points[0], points[0]]];
			
		//find first baseline
		var maxX, minX;
		var maxPt, minPt;
		for (var idx in points) {
			var pt = points[idx];
			if (pt[0] > maxX || !maxX) {
				maxPt = pt;
				maxX = pt[0];
			}
			if (pt[0] < minX || !minX) {
				minPt = pt;
				minX = pt[0];
			}
		}
		var ch = [].concat(this.buildConvexHull([minPt, maxPt], points),
						   this.buildConvexHull([maxPt, minPt], points))
		return ch;
	},
	MultiPolygonUnion: function(multiPolygon)
	{
		var matrixMultiPolygon = [];
		var unitedMultiPolygon = [];
		var nStartPolygons = 0;
		
		do {
			nStartPolygons = multiPolygon.length;
			unitedMultiPolygon = [];
			
			while(multiPolygon.length > 0){
				currentPolygon = multiPolygon.pop()
				var iOther = 0;
				
				// Check if it overlaps with any remaining polygons
				while(iOther < multiPolygon.length) {
				
					var unionResults = currentPolygon.union(multiPolygon[iOther]);
					
					if(unionResults != null){
						currentPolygon = unionResults;
						multiPolygon.splice(iOther,1);
					} else {
						iOther++;
					}					
				}			
				unitedMultiPolygon.push(currentPolygon)				
			}
			multiPolygon = unitedMultiPolygon;
		}while(multiPolygon.length < nStartPolygons);
		
		for(var i = 0; i < unitedMultiPolygon.length;i++) {
			var poly = unitedMultiPolygon[i].to_point_array_2d();
			poly.push(poly[0]); 
			
			matrixMultiPolygon.push([poly]);
		}	
		
		return matrixMultiPolygon;
	},
	getPixelMultiPolygon: function(points) {
		results = [];
		
		for(var i = 0;i < points.length;i++) {
			var pt = points[i];
			var dims = ModisPixelDimensions[pt[2]];

            var merc = L.Projection.Mercator.project(new L.LatLng(pt[1], pt[0]));

			var X1 = merc.x;
			var Y1 = merc.y;
            //var latlng = L.Projection.Mercator.unproject({y: pt[1], x: pt[0]});
			// var X1 = merc_x(pt[0]);
			// var Y1 = merc_y(pt[1]);
			
			var X2 = X1 + 1000;
			var Y2 = Y1;
			
			var newLat = pt[1];
			//var newLon = from_merc_x(X2);
            var latlng = L.Projection.Mercator.unproject({y: Y2, x: X2});
			var newLon = latlng.lng;
			
			var mdelta = gmxAPIutils.distVincenty(pt[0],pt[1],newLon,newLat);

			var h_scale = dims[0] / mdelta;
			var v_scale = dims[1] / mdelta;
			
					
			var h_dx = 0.5*(X2 - X1)*h_scale;
			var h_dy = 0.5*(Y2 - Y1)*h_scale;
			
			var v_dx = 0.5*(Y2-Y1)*v_scale;
			var v_dy = 0.5*(X2-X1)*v_scale;
			
			var frontX = X1 + h_dx;
			var frontY = Y1 + h_dy;
			
			var backX = X1 - h_dx;
			var backY = Y1 - h_dy;
		
			var corner1x =  frontX + v_dx;
			var corner1y =  frontY + v_dy;
		
			var corner2x =  frontX - v_dx;
			var corner2y =  frontY - v_dy;
		
			var corner3x =  backX - v_dx;
			var corner3y =  backY - v_dy;
			
			var corner4x =  backX + v_dx;
			var corner4y =  backY + v_dy;    
			results.push( SpatialQuery.$p([
				[corner1x, corner1y],
				[corner2x, corner2y],
				[corner3x, corner3y],
				[corner4x, corner4y]
				]));

			// results.push( SpatialQuery.$p([
				// [from_merc_x(corner1x),from_merc_y(corner1y)],
				// [from_merc_x(corner2x),from_merc_y(corner2y)],
				// [from_merc_x(corner3x),from_merc_y(corner3y)],
				// [from_merc_x(corner4x),from_merc_y(corner4y)]
				// ]));
		}
		
		return results;
	}
}; 

        var updateClustersByObject = function(layer, estimeteGeometry, clusterAttr, hotspotAttr, countAttr, dateAttr, fromLayer) {
            var clusters = {};
            return function( data ) {
                var objects = [];
                var clustersToRepaint = {};
                var indexes = fromLayer._gmx.tileAttributeIndexes;
                var parseItem = function(item) {
                    return {
                        properties: gmxAPIutils.getPropertiesHash(item.properties, indexes),
                        geometry: item.properties[item.properties.length - 1]
                    };
                };
                (data.added || []).map(function(it) {
                    objects.push({ onExtent: true, item: parseItem(it) });
                });
                (data.removed || []).map(function(it) {
                    objects.push({ onExtent: false, item: parseItem(it) });
                });
                for (var k = 0; k < objects.length; k++)
                {
                    var props = objects[k].item.properties;
                    var mult = objects[k].onExtent ? 1 : -1;
                    var count = (countAttr ? props[countAttr] : 1) * mult;
                    
                    if (!props[clusterAttr])
                        continue;
                        
                    var clusterId = '_' + props[clusterAttr];
                    var hotspotId = '_' + props[hotspotAttr];
                    
                    if (!clusters[clusterId]) {
                        clusters[clusterId] = {
                            spots: {},
                            lat: 0, 
                            lng: 0, 
                            count: 0,
                            startDate: Number.POSITIVE_INFINITY,
                            endDate: Number.NEGATIVE_INFINITY,
                            isIndustrial: false
                        };
                    }
                    var cluster = clusters[clusterId];
                    
                    //два раза одну и ту же точку не добавляем
                    if (hotspotId in cluster.spots && objects[k].onExtent)
                        continue;
                    
                    var coords = objects[k].item.geometry.coordinates,
                        latlng = L.Projection.Mercator.unproject({y: coords[1], x: coords[0]});
                    
                    if (objects[k].onExtent)
                        cluster.spots[hotspotId] = [latlng.lng, latlng.lat, 250]; //TODO: выбрать правильный номер sample
                    else
                        delete cluster.spots[hotspotId];
                        
                    //var hotspotDate = parseServerDateTime(props[dateAttr]);
                    var hotspotDate = props[dateAttr];
                    
                    cluster.lat += count * coords[1];
                    cluster.lng += count * coords[0];
                    cluster.count += count;
                    cluster.startDate = Math.min(cluster.startDate, hotspotDate);
                    cluster.endDate   = Math.max(cluster.endDate,   hotspotDate);
                    cluster.isIndustrial = cluster.isIndustrial || (Number(props.FireType) & 1);
                    
                    clustersToRepaint[clusterId] = true;
                }
                
                var clustersToAdd = []
                itemIDsToRemove = [];
                
                for (var k in clustersToRepaint)
                {
                    var cluster = clusters[k],
                        count = cluster.count;
                    if (count)
                    {
                        // var strStartDate = $.datepicker.formatDate('dd.mm.yy', new Date(cluster.startDate));
                        // var strEndDate = $.datepicker.formatDate('dd.mm.yy', new Date(cluster.endDate));
                        var strStartDate = ddt1.toString();
                        var strEndDate = ddt2.toString();
/*
                        var newItem = {
                            id: k,
                            properties: {
                                scale: String(Math.pow(Math.log(count+1), 1.3)/3.5),
                                // scale: Math.floor(Math.sqrt(count)/5),
                                count: count,
                                label: count >= 10 ? count : null,
                                startDate: strStartDate,
                                endDate: strEndDate,
                                dateRange: cluster.startDate === cluster.endDate ? strEndDate : strStartDate + '-' + strEndDate,
                                isIndustrial: Number(cluster.isIndustrial)
                            }
                        };*/
                        var newItem = [
                            k,
                            String(Math.pow(Math.log(count+1), 1.3)/3.5),
                            count,
                            count >= 10 ? count : null,
                            cluster.startDate,
                            cluster.endDate,
                            cluster.startDate === cluster.endDate ? strEndDate : strStartDate + '-' + strEndDate,
                            Number(cluster.isIndustrial)
                        ];
                        
                        if (estimeteGeometry) {
                            var points = [];
                            for (var p in clusters[k].spots)
                                points.push(clusters[k].spots[p]);
                                
                            var multiPolygon = _hq.getPixelMultiPolygon(points);
                            var tmpPolygon = _hq.MultiPolygonUnion(multiPolygon);
                            
                            newItem.push({
                                type: 'MULTIPOLYGON',
                                coordinates: tmpPolygon
                            });
                        } else {
                            newItem.push({
                                type: 'POINT',
                                coordinates: [clusters[k].lng / count, clusters[k].lat / count]
                            });
                        }
                        
                        clustersToAdd.push(newItem);               
                    } else {
                        itemIDsToRemove.push(k);
                        delete clusters[k];
                        
                    }
                }
                
                layer.addData(clustersToAdd);
                layer.removeData(itemIDsToRemove);
            }
        }
