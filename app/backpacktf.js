const request = require("request");
const util = require('./util.js');

function Backpack(access_token, key) {
    this.baseUrl = 'https://backpack.tf/api/';
    this.access_token = access_token;
    this.key = key;
}

Backpack.prototype.getUserInfo = function(steamids, callback) {
    request.get({url: this.baseUrl + 'users/info/v1', qs: {'key': this.key, 'steamids': steamids}}, function(err, response, body) {
        return callback(err, response, JSON.parse(body));
    });
};

Backpack.prototype.getCurrencies = function(callback) {
    request.get({url: this.baseUrl + 'IGetCurrencies/v1', qs: {'key': this.key}}, function(err, response, body) {
        if (err) return callback(err);
        body = JSON.parse(body).response;
        if (body.success === 0) return callback(err = body.message);
        return callback(err, body.currencies);
    });
};

Backpack.prototype.isBanned = function(steamid, callback) {
    this.getUserInfo(steamid, function (err, response, body) {
        let returnRes = false;
        if (err) return callback(err);
        if (util.getSafe(() => body.users[steamid].bans)) {
            if (util.getSafe(() => body.users[steamid].bans.steamrep_scammer) === 1) {
                returnRes = true;
            } else if (util.getSafe(() => body.users[steamid].bans.all.end) === -1) {
                returnRes = true; //  the user is banned
            } else {
                returnRes = false;
            }
        }
        return callback(err, returnRes);
    });
};

module.exports = Backpack;
