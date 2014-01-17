/** Asynchronously request session keys from GeoMixer servers (given apiKey and server host)
*/
var gmxSessionManager = {
    APIKEY_PARAM: 'key',
    SCRIPT_REGEXP: /\bleaflet-geomixer(-\w*)?\.js\b/,
    _scriptSearched: false,
    _scriptAPIKey: null,
    _searchScriptAPIKey: function() {
        var _this = this;
        if (this._scriptSearched) {
            return this._scriptAPIKey;
        }
        
        var scripts = document.getElementsByTagName("script");
		for (var i = 0; i < scripts.length; i++) {
			var src = scripts[i].getAttribute("src");
			if(this.SCRIPT_REGEXP.exec(src)) {
				var query = src.split('?')[1];
                query && query.split('&').forEach(function(param) {
                    var parsedParam = param.split('=');
                    if (parsedParam[0] === _this.APIKEY_PARAM) {
                        _this._scriptAPIKey = parsedParam[1];
                    }
                });
                break;
			}
		}
        this._scriptSearched = true;
		return this._scriptAPIKey;
    },
    
    requestSessionKey: function(serverHost, apiKey) {
        var keys = this._keys;
        if (!(serverHost in keys)) {
            apiKey = apiKey || this._searchScriptAPIKey();
            keys[serverHost] = new gmxDeferred();
            gmxAPIutils.requestJSONP(
                "http://" + serverHost + "/ApiKey.ashx",
                {
                    WrapStyle: 'func',
                    Key: apiKey,
                }
            ).done(function(response) {
                if(response && response.Status === 'ok') {
                    keys[serverHost].resolve(response.Result.Key);
                } else {
                    keys[serverHost].reject();
                }
            });
        }
        return keys[serverHost];
    },
    //get already received session key
    getSessionKey: function(serverHost) {
        return this._keys[serverHost] && this._keys[serverHost].getFulfilledData()[0];
    },
    _keys: {} //deferred for each host
}