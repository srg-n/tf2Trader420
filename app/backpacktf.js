const requestPromise = require("request-promise");
const fetch = require('node-fetch');
const util = require('./util.js');

function Backpack(access_token, key, cookie = '', userid = '') {
    this.baseUrl = 'https://backpack.tf/api/';
    this.access_token = access_token;
    this.key = key;
    this.cookie = cookie;
    this.userid = userid;
}

Backpack.prototype.getOwnListings = function (inactive = 0) {
    return requestPromise({
        uri: this.baseUrl + 'classifieds/listings/v1',
        qs: {'key': this.key, 'inactive': inactive, token: this.access_token},
        json: true
    })
};

Backpack.prototype.getUserInfo = function (steamids) {
    return requestPromise({
        uri: this.baseUrl + 'users/info/v1',
        qs: {'key': this.key, 'steamids': steamids},
        json: true
    })
};

Backpack.prototype.bumpListing = function (listingID) {
    return fetch("https://backpack.tf/classifieds/bump/" + listingID, {
        "credentials": "include",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:68.0) Gecko/20100101 Firefox/68.0",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Cookie": this.cookie,
        },
        "body": "user-id=" + this.userid,
        "method": "POST",
        "mode": "cors"
    });
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
                        /* } else if (util.getSafe(() => res.users[steamid].bans.all.end) === -1) { // https://steamcommunity.com/groups/meetthestats/announcements/detail/1619520028832924307 bp.tf ban policy change
                            resolve(true);  //  the user is banned
                        } */
                    }
                }
                resolve(false); //  the user is not banned
            }).catch(function (err) {
            reject(err);  //  api request error
        })
    });
};

module.exports = Backpack;
