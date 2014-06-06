var translationsHash = function()
{
	this.hash = {};

	this.flags = {};

	this.titles = {};
}

translationsHash.DEFAULT_LANGUAGE = "rus";

translationsHash.prototype._addTextWithPrefix = function(prefix, lang, newHash) {
	var res = true;
	
	if ( !(lang in this.hash) ) this.hash[lang] = {};

	for ( var k in newHash ) {
        var fullKey = prefix + k;
		if ( fullKey in this.hash[lang] )
			res = false;
		else {
            if (typeof newHash[k] === 'string') {
                this.hash[lang][fullKey] = newHash[k];
            } else {
                this._addTextWithPrefix(fullKey + '.', lang, newHash[k]);
            }
        }
	}
    
	return res;
}

translationsHash.prototype.addtext = function(lang, newHash) {
    this._addTextWithPrefix('', lang, newHash);
}

translationsHash.prototype.getLanguage = function(){
	return this._language || window.language || translationsHash.DEFAULT_LANGUAGE;
}

translationsHash.prototype.setLanguage = function(lang){
	this._language = lang;
}

translationsHash.prototype.gettext = function()
{
	var lang = this.getLanguage(),
		text = arguments[0],
		args = arguments,
		getNextValue = function(i)
		{
			if (i + 1 < args.length)
				return args[i + 1];
			else
				return '';
		};
	
	if (!this.hash[lang])
	{
		//showErrorMessage("Не заданы значения для языка \"" + lang + "\"");
		
		return '';
	}
	else if (!this.hash[lang][text])
	{
		//showErrorMessage("Не найдено тектовое описание для \"" + text + "\"");
		
		return '';
	}
	else
	{
		return this.hash[lang][text].replace(/\[value(\d)\]/g, function()
		{
			return getNextValue(Number(arguments[1]))
		})
	}
}

var _translationsHash = new translationsHash();
L.Util.gmxLocale = {
    getText: function () {
        return _translationsHash.gettext.apply(_translationsHash, arguments);
    },

    addText: function (lang, newHash) {
        return _translationsHash.addtext.apply(_translationsHash, lang, newHash);
    }
};

