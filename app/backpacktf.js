const request = require("request");

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

Backpack.prototype.isBanned = function(steamid, callback) {
    this.getUserInfo(steamid, function (err, response, body) {
        if (err) return callback(err);
        console.log(JSON.stringify(body));
        if (body.users[steamid].bans.hasOwnProperty('all')) {
            return callback(err, true); //  the user is banned
        } else {
            return callback(err, false);
        }
    });
};

module.exports = Backpack;
