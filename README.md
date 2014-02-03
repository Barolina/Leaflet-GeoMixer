Leaflet-GeoMixer
================

Leaflet plugin to add data from [GeoMixer](http://geomixer.ru) to any Leaflet map. 

[Documentation](documentation.md) is available in separate file.

Demos
------
  * [Layers integration](http://ScanEx.github.com/Leaflet-GeoMixer/examples/GMXLayerLeaflet.html) - intergrate GeoMixer layers into map. Demonstrates work with temporal layers.
  * [Animation](http://ScanEx.github.com/Leaflet-GeoMixer/examples/Animation.html) - preload data from hotspot layer and show select day to show hotspots using slider.
  * [GeoMixer map](http://ScanEx.github.com/Leaflet-GeoMixer/examples/GeoMixerMap.html) - load all the layers form GeoMixer map using one command.
  * [Plugins](http://ScanEx.github.com/Leaflet-GeoMixer/examples/Plugins.html) - integrate GeoMixer layers along with several Leaflet plugins
  * [MultipleMaps](http://ScanEx.github.com/Leaflet-GeoMixer/examples/MultipleMaps.html) - multiple maps on one page

Build
------

[NodeJS](http://nodejs.org/) is required to build the plugin.

Install `jake` (globally) and other plugins dependencies:
```
npm install -g jake
npm install
```

Run the following command to build production version:
```
jake
```

File `leaflet-geomixer.js` will appear in `dist` forder. Do not commit this file to the repository!

You can use plugin without building including file `build/leaflet-geomixer-dev.js`. Note, that this script loads all the sources dynamically and should not be used for production deployment.

List of source files is maintained in file `build/deps.js`. It should be updated properly for correct builds.
