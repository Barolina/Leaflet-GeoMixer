var gmxSessionManager = (function(){
    var keys = {}; //deferred for each host
    return {
        getSessionKey: function(host, apiKey) {
            if (!(host in keys)) {
                keys[host] = new gmxDeferred();
                gmxAPIutils.getSessionKey(
                    {
                        url: "http://" + host + "/ApiKey.ashx?WrapStyle=None&Key=" + apiKey
                    },
                    function(ph) {
                        //TODO: check ph.Result.Status
                        if(ph && ph.Status === 'ok') {
                            keys[host].resolve(ph.Result.Key);
                        } else {
                            keys[host].reject();
                        }
                    }
                );
            }
            return keys[host];
        }
    }
})()