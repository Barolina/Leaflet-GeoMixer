Leaflet-GeoMixer
================

Leaflet plugin to add data from [GeoMixer](http://geomixer.ru) on any Leaflet map.

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

Files `leaflet-geomixer.js` and `leaflet-geomixer-src.js` will appear in `dist` forder. Do not commit these files to the repository!

The following command builds plugin in development mode (which loads all source files dynamically):

```
jake dev
```

List of source files is maintained in file `build/deps.js`. It should be updated properly for correct builds. Build in development mode should be performed after each change of this list.
