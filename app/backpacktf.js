const requestPromise = require("request-promise");
const util = require('./util.js');

function Backpack(access_token, key) {
    this.baseUrl = 'https://backpack.tf/api/';
    this.access_token = access_token;
    this.key = key;
}

Backpack.prototype.getUserInfo = function (steamids) {
    return requestPromise({
        uri: this.baseUrl + 'users/info/v1',
        qs: {'key': this.key, 'steamids': steamids},
        json: true
    })
};

Backpack.prototype.getCurrencies = function () {
    return new Promise((resolve, reject) => {
        requestPromise({url: this.baseUrl + 'IGetCurrencies/v1', qs: {'key': this.key}, json: true})
            .then(function (body) {
                if (body.response.success === 0) reject(body.response.message);
                else resolve(body.response.currencies);
            }).catch(function (err) {
                reject(err);  //  api request error
        })
    });
};

Backpack.prototype.isBanned = function (steamid) {
    return new Promise((resolve, reject) => {
        this.getUserInfo(steamid)
            .then(function (res) {
                if (util.getSafe(() => res.users[steamid].bans)) {
                    if (util.getSafe(() => res.users[steamid].bans.steamrep_scammer) === 1) {
                        resolve(true);  //  the user is banned
                    } else if (util.getSafe(() => res.users[steamid].bans.all.end) === -1) {
                        resolve(true);  //  the user is banned
                    }
                }
                resolve(false); //  the user is not banned
            }).catch(function (err) {
            reject(err);  //  api request error
        })
    });
};

module.exports = Backpack;
