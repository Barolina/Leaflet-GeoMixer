var fs = require('fs'),
    UglifyJS = require('uglify-js'),
    deps = require('./deps.js').deps;

function combineFiles(files) {
	var content = '';
	for (var i = 0, len = files.length; i < len; i++) {
		content += fs.readFileSync('src/' + files[i], 'utf8') + '\n\n';
	}
	return content;
}

exports.build = function () {

	console.log('Concatenating ' + deps.length + ' files...');

	var copy = fs.readFileSync('src/copyright.js', 'utf8'),
	    intro = '(function (window, document, undefined) {\n',
	    outro = '}(window, document));',
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