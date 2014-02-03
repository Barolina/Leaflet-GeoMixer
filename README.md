Leaflet-GeoMixer
================

Leaflet plugin to add data from [GeoMixer](http://geomixer.ru) to any Leaflet map.

Demos
------

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