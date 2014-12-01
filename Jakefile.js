/*
Leaflet-GeoMixer building scripts.
*/

var build = require('./build/build.js');

desc('Combine and compress Leaflet-GeoMixer source files');
task('build', build.build);
task('leafletnode', build.leafletnode);
task('node', ['leafletnode'], build.node);

task('default', ['build']);
