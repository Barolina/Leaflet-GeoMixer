# GeoMixer-Leaflet Plugin Documentation

## Simple example

```html
	<div id="map"></div>
 
	<script src="http://cdn.leafletjs.com/leaflet-0.6.4/leaflet-src.js"></script>
	<script src="leaflet-geomixer.js?key=U92596WMIH"></script>
	<script>
		var map = L.map('map').setView([60, 50], 3);
		
		L.gmx.loadLayer('7VKHM', '295894E2A2F742109AB112DBFEAEFF09').then(function(satelliteLayer) {
		    satelliteLayer.addTo(map);
		});
		
        L.gmx.loadMap('AZR6A', {leafletMap: map});
	</script>
```

## Adding plugin
To add the plugin just add plugin's script to your page:

```html
<script src="leaflet-geomixer.js?key=GeoMixerAPIKey"></script>
```

`GeoMixerAPIKey` is the special key, that should be obtained for each domain to use data from GeoMixer. This key can be added as parameter of script or set as an option during layers loading.

## GeoMixer Data Structure

The main entity in GeoMixer in **layer**. Each layer has several properties including `ID`, `type` and `title`.
Layer IDs are unique inside one server. The main layer types are **vector** and **raster**.

Each vector layer consists of geometry items. Item has `type`, `geometry` and `properties`.

Layers are combined into **maps**.

## Layer Factories

Layers are created using factory functions in asynchronous manner. 

### L.gmx.loadLayer
```js
 L.gmx.loadLayer(mapID, layerID, options): promise
```

`mapID` is ID GeoMixer's map and `layerID` is ID of layer to load. `params` is a hash with the following possible keys.

Option|Description|Type|Default value
------|-----------|:--:|-------------
hostName| Host name of the GeoMixer server without `http://` and terminal `/`|`String`|maps.kosmosnimki.ru
apiKey|GeoMixer API key for host. If not given, it will be extracted from the script parameters (see above). No key is required to work from `localhost`|`String`|
beginDate|Start date for time interval (only for temporal layers)|`Date`|
endDate|End date for time interval (only for temporal layers)|`Date`|

Function returns promise, which is fulfilled with an instance of GeoMixer layer (see description below)

### L.gmx.loadLayers
```js
 L.gmx.loadLayers(layers, commonOptions): promise
```

Helper function to load several layers at once. `layer` is the array of the hashes with the following keys:
  * mapID - ID of GeoMixer map
  * layerID - ID of layer
  * options - layer options

Each element of array corresponds to single `L.gmx.loadLayer` call. `commonOptions` are applied to all the layers.

Returned promise if fulfilled when all the layers are loaded. Layers are passed as separate arguments to fulfillment functions.

### L.gmx.loadMap
```js
 L.gmx.loadMap(mapID, options): promise
```

Loads all the layers from the GeoMixer's map. 

`options` can have only one key: `leafletMap` - instance of `L.Map`. If Leaflet map is defined, all visible (in original GeoMixer map) layers will be added to the map. Function returns a promise, that is fulfilled after all the layers are loaded with the `L.gmxMap`.

## Class L.gmx.VectorLayer

`gmxVectorLayer` class provides interface for drawing GeoMixer vector layers on Leaflet map.

Layers can be added to Leaflet map by calling `L.Map.addLayer()` or `L.gmx.VectorLayer.addTo()`.

### Methods
Method|Syntax|Return type|Description
------|------|:---------:|-----------
setFilter|`setFilter(function(item)->Boolean)`|`this`|set function to filter out items before rendering. The only argument is the function, that receives an item and return boolean value (`false` means filter out)
setDateInterval|`setDateInterval(beginDate, endDate)`|`this`|Set date interval for temporal layers. Only items within date interval will be rendered on map. `beginDate` and `endDate` are of type `Date`
addTo|`addTo(map)`|`this`|Add layer to given Leaflet map. `map` argument is of type `L.Map`.

## Class L.gmx.RasterLayer

`gmxVectorLayer` class is used to render raster GeoMixer layer.

Method|Syntax|Return type|Description
------|------|:---------:|-----------
addTo|`addTo(map)`|`this`|Add layer to given Leaflet map. `map` argument is of type `L.Map`.

## Class L.gmx.Map
`L.gmx.Map` is used to work with GeoMixer map (collection of layers).

###Properties
Property|Type|Description
------|:---------:|-----------
layers|Array of `L.gmx.VectorLayer` or `L.gmx.RasterLayer`| Array of all the layers in GeoMixer map
layersByID|Object| Hash of layers in GeoMixer map with layer ID as key
layersByTitle|Object| Hash of layers in GeoMixer map with layer title as key
