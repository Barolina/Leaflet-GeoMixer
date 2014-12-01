var fs = require('fs'),
    UglifyJS = require('uglify-js');

function combineFiles(files, folder) {
	var content = '';
	for (var i = 0, len = files.length; i < len; i++) {
		content += fs.readFileSync(folder + '/' + files[i], 'utf8') + '\n\n';
	}
	return content;
}
function chkDistPath() {
	if(!fs.existsSync('dist')) { 
		fs.mkdirSync('dist');
	}
}

var build = function (options) {
    var deps = require(options.deps).deps;

	console.log('Concatenating ' + deps.length + ' files...');
	chkDistPath();

	var copy = fs.readFileSync('src/copyright.js', 'utf8'),
	    intro = options.intro,
	    outro = options.ontro,
	    newSrc = copy + intro + combineFiles(deps, options.src) + outro,
	    pathPart = options.dst,
	    srcPath = pathPart + '-src.js';

	console.log('\tUncompressed size: ' + newSrc.length + ' bytes');

	fs.writeFileSync(srcPath, newSrc);
	console.log('\tSaved to ' + srcPath);

	console.log('Compressing...');

	var path = pathPart + '.js',
		newCompressed = copy + UglifyJS.minify(newSrc, {
			warnings: true,
			fromString: true
		}).code;

	console.log('\tCompressed size: ' + newCompressed.length + ' bytes');
	fs.writeFileSync(path, newCompressed);
	console.log('\tSaved to ' + path);
};

exports.build = build.bind(null, {
    deps: './deps.js',
    intro: '(function () {\n"use strict";\n',
    ontro: '}());',
    dst: 'dist/leaflet-geomixer',
    src: 'src'
});

exports.node = build.bind(null, {
    deps: './deps_node.js',
    intro: '(function () {\n"use strict";\nvar L = require("./leaflet-node-src.js")\n',
    ontro: '}());',
    dst: 'dist/node-geomixer',
    src: 'src'
});

exports.leafletnode = build.bind(null, {
    deps: './deps_leaflet.js',
    intro: '(function () {\n"use strict";\nvar L = {};\n',
    ontro: '}());',
    dst: 'dist/leaflet-node',
    src: 'leaflet-node'
});

// exports.node = build.bind(null, './deps_node.js');