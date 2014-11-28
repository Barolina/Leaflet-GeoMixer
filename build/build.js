var fs = require('fs'),
    UglifyJS = require('uglify-js');

function combineFiles(files) {
	var content = '';
	for (var i = 0, len = files.length; i < len; i++) {
		content += fs.readFileSync('src/' + files[i], 'utf8') + '\n\n';
	}
	return content;
}
function chkDistPath() {
	if(!fs.existsSync('dist')) { 
		fs.mkdirSync('dist');
	}
}

var build = function (depsFile) {
    var deps = require(depsFile).deps;

	console.log('Concatenating ' + deps.length + ' files...');
	chkDistPath();

	var copy = fs.readFileSync('src/copyright.js', 'utf8'),
	    intro = '(function () {\n"use strict";\n',
	    outro = '}());',
	    newSrc = copy + intro + combineFiles(deps) + outro,
	    pathPart = 'dist/leaflet-geomixer',
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

exports.build = build.bind(null, './deps.js');
exports.node = build.bind(null, './deps_node.js');