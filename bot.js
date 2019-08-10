/*
	* Jetbrains Webstorm
	* author: sergun
*/
"use strict";
global._mckay_statistics_opt_out = true; // opt out https://github.com/DoctorMcKay/node-stats-reporter
let App = {
    user: {
        tf2: {
            currencies: {
                ref: 0,
                rec: 0,
                scrap: 0,
                key: 0
            }
        }
    },
    bptf: {
        lastBump: 0,
    },
    reloginAllowed: 0,
};

let config;
let SteamUser;
let SteamCommunity;
let SteamTotp;
let TeamFortress2;
let TradeOfferManager;
let fs;
let steamid;
let events;
let nodeCache;
let Pricer;
const util = require('./app/util.js');

try {
    config = require('./config.js');
    Pricer = require('./app/pricer.js');
    SteamUser = require('steam-user');
    SteamCommunity = require('steamcommunity');
    SteamTotp = require('steam-totp');
    TeamFortress2 = require('tf2');
    TradeOfferManager = require('steam-tradeoffer-manager');
    fs = require('fs');
    steamid = require('steamid');
    events = require('events');
    nodeCache = require("node-cache");
} catch (exception) {
    console.log(exception);
    console.error('missing dependencies, use npm install');
    process.exit(1); // fatal error
}

//TODO: config değiştirmek için bot.js test configi argümanlarına bak
//TODO: Trade loggerında yer kaplamayı azaltmak için dosyaya yazılan formatı sadeleştir, konsol aynı kalsın

let bpTfCache = new nodeCache({
    stdTTL: config.get('app').cache.listingsRefreshInterval, // in seconds
    checkperiod: 1,
    errorOnMissing: true,
    useClones: true,
    deleteOnExpire: true
});
let eventEmitter = new events.EventEmitter();
let client = new SteamUser({
    dataDirectory: 'cache/' + config.get('configName') + '/',
    autoRelogin: true,

});
let manager = new TradeOfferManager({
    steam: client,
});
let community = new SteamCommunity();
let tf2 = new TeamFortress2(client);

const logger = require('./app/logger.js');
let BackpackAPI = require('./app/backpacktf.js');
BackpackAPI = new BackpackAPI(config.get('backpacktf').accessToken, config.get('backpacktf').key, config.get('backpacktf').cookie, config.get('backpacktf').userid);
Pricer = new Pricer(BackpackAPI);

let initSeq = {
    Steam: {
        Client: false,
        try: {}
    },
    bpTf: {
        Client: false,
        try: {}
    },
    tf2: {
        Client: false,
        try: {}
    },
};


eventEmitter.on('init', function (initName, status, dontRetry = true) {
    initSeq[initName].try[(new Date).getTime()] = status;
    if (status) {
        initSeq[initName].Client = true;
        logger.App.success(initName + ' initialized');
    } else {
        if (!dontRetry) eventEmitter.emit(initName); // let the initialized client handle the error
        initSeq[initName].Client = false;
    }
});

client.logOn({
    "accountName": config.get('steam').accountName,
    "password": config.get('steam').password,
    "twoFactorCode": SteamTotp.generateAuthCode(config.get('steam').sharedSecret),
    "rememberPassword": true,
    "autoRelogin": true
});

client.on('loggedOn', function () {
    //  steam client log in successful
    logger.App.success('Logged into Steam');
    client.setPersona(SteamUser.EPersonaState.Online);
    // noinspection JSCheckFunctionSignatures
    tf2 = new TeamFortress2(client);
    /*client.gamesPlayed([]); //  reset the running games in order to restart tf2 game coordinator in case if tf2 gc got disconnected somehow
    //client.gamesPlayed(['testing', 440], true);
    client.gamesPlayed([440], true);
    client.uploadRichPresence(440, {
        "steam_display": "#TF_RichPresence_Display",
        "state": "PlayingMatchGroup",
        "matchgrouploc": "bootcamp",
        "currentmap": 'https://backpack.tf/u/' + client.steamID.getSteamID64()
    });
     */
});

community.on('sessionExpired', function (err) {
    if (Math.floor((new Date).getTime() / 1000) - App.reloginAllowed > 20) {
        App.reloginAllowed = Math.floor((new Date).getTime() / 1000);
        //  session expired, allowed to relogin every 20 secs
        logger.App.info('Steam web session got expired, will try to get a new session for every 20 secs: ' + err.toString());
        client.webLogOn();
    }
});

client.on('disconnected', function (eresult, msg) {
    if (!eresult) eresult = '';
    else eresult = ' - ' + SteamUser.EResult.eresult;
    logger.App.warning('Got disconnected from Steam, will relogin automatically once available' + eresult + ' - ' + msg);
    eventEmitter.emit('init', 'Steam', false, true);
});

client.on('webSession', function (sessionID, cookies) {
    manager.setCookies(cookies, function (err) {
        if (err) {
            eventEmitter.emit('init', 'Steam', false);
            logger.App.error(err.toString());
            process.exit(1); // fatal error, cannot continue without api key
            return;
        }
        if (fs.existsSync('./cache/' + client.steamID.getSteamID64() + '/polldata.json')) {
            manager.pollData = JSON.parse(fs.readFileSync('./cache/' + config.get('configName') + '/polldata.json').toString('utf8'));
        }
        community.setCookies(cookies);
        //  got api key
        eventEmitter.emit('init', 'Steam', true);
        eventEmitter.emit('bpTf');
    });
});

eventEmitter.on('bpTf', function () {
    getBpTfListings().then(function() {
        //  bptf client init successful
        logger.App.info('bp.tf Listings cache has been successfully refreshed, next expire epoch: ' + bpTfCache.getTtl('listing'));
        eventEmitter.emit('init', 'bpTf', true);
    }, function(err) {
        eventEmitter.emit('init', 'bpTf', false, true);
        logger.App.error('bpTf refreshListings error, might be caused by wrong bp.tf access token: ' + err.toString());
    });
});

tf2.on('connectedToGC', function () {
    eventEmitter.emit('init', 'tf2', true);
    tf2.sortBackpack(4);
});

tf2.on('disconnectedFromGC', function (reason) {
    let reasonEnumerated = reason;
    if (reason === TeamFortress2.GCGoodbyeReason.GC_GOING_DOWN) reasonEnumerated = 'GC servers are going down for a maintenance';
    if (reason === TeamFortress2.GCGoodbyeReason.NO_SESSION) reasonEnumerated = 'Unexpected GC crash';
    eventEmitter.emit('init', 'tf2', false);
    logger.App.warning('TF2 Client got disconnected from the game coordinator, ' + reasonEnumerated + '. The client will reconnect automatically when available.');
});

tf2.on('itemSchemaLoaded', function () {
    logger.App.info('TF2 item schema got updated from the GC');
});

tf2.on('itemSchemaError', function (err) {
    logger.App.error('TF2 Item Schema: ' + err.toString());
});

function currencyMaintain() {
    if (initSeq.tf2.Client && initSeq.Steam.Client && tf2.backpack) {
        App.user.tf2.currencies.key = tf2.backpack.filter(obj => obj.def_index === 5021).length;
        App.user.tf2.currencies.scrap = tf2.backpack.filter(obj => obj.def_index === 5000).length;
        App.user.tf2.currencies.ref = tf2.backpack.filter(obj => obj.def_index === 5002).length;
        App.user.tf2.currencies.rec = tf2.backpack.filter(obj => obj.def_index === 5001).length;
        logger.App.info('TF2 Inv. Balance: ' + App.user.tf2.currencies.key + ' key(s) ' + App.user.tf2.currencies.ref + ' ref(s) ' + App.user.tf2.currencies.rec + ' rec(s) ' + App.user.tf2.currencies.scrap + ' scrap(s)');
    }
    // TODO: maintain a fixed currency storage, craft
    if (App.user.tf2.currencies.scrap < config.get('app').behaviour.currencyMaintain.tf2.ref.minAmount) {

    }
}

/*
setInterval(function () {   //  TODO: remove debuggers
    currencyMaintain();
}, 2000);
*/

manager.on('newOffer', function (offer) {
    let offerDetails = {};
    logger.Trade.incoming('New offer #' + offer.id + ' from ' + offer.partner.getSteamID64());

    if (offer.isGlitched()) {
        offer.decline(function (err) {
            if (err) reject(logger.App.error('Could not decline glitched offer #' + offer.id + ' ' + err.toString()));
            else logger.Trade.glitchedDeclined('#' + offer.id + ' got declined due to being glitched');
        });
    } else {
        offer.getUserDetails(function (err, me, them) {
            if (err) {
                logger.App.info('Could not get additional info for offer #' + offer.id + ', will try to continue without additional info');
                logger.App.error('Offer handler getUserDetails error: ' + err.toString());
            } else {
                offerDetails.me = me;
                offerDetails.them = them;
            }
            BackpackAPI.isBanned(offer.partner.getSteamID64())
                .then(function (res) {
                    if (res) {
                        offer.decline(function (err) {
                            if (err) logger.App.error('Scammer mark offer decline error ' + err.toString());
                            else logger.Trade.scammerDeclined('#' + offer.id + ' got declined because sender ' + offer.partner.getSteamID64() + ', ' + util.getSafe(() => offerDetails.them.personaName) + ' is a scammer.');
                        });
                    } else {
                        //  TODO: continue handling, not banned
                        //	
                }).catch(function (err) {
                logger.App.error(err.toString());
            });
        });
    }
});

function bumpBpTfListings() {
    bpTfCache.get('listing', function (err, res) {
        if (!err) {
            let bumpCount = 0;
            if (Math.floor((new Date).getTime() / 1000) - App.bptf.lastBump > 1800) {
                res.forEach(listing => {
                    if (Math.floor((new Date).getTime() / 1000) - App.bptf.lastBump > 1800) {
                        if (Math.floor((new Date).getTime() / 1000) - listing.bump > 1800) {
                            BackpackAPI.bumpListing(listing.id);
                            bumpCount++;
                            listing.bump = Math.floor((new Date).getTime() / 1000);
                        }
                    }
                });
            }
            logger.App.info('Bumped ' + bumpCount + ' out of ' + res.length + ' bp.tf listing(s)');
        }
    });
}


function getBpTfListings(force = false) {
    return new Promise(function (resolve, reject) {
        bpTfCache.get('listing', function (err, value) {
            if (err || force) {
                //  listings are not ready yet, expired or forced refresh, get them
                BackpackAPI.getOwnListings()
                    .then(function (res) {
                        bpTfCache.set('listing', res.listings);
                        bumpBpTfListings();
                        resolve(res);
                    }).catch(function (err) {
                        reject(err);
                    });
            } else {
                resolve(value);
            }
        });
    });
}

manager.on('receivedOfferChanged', function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
        // check for ref/rec/scrap(/key) storage
        currencyMaintain();
    }
});

manager.on('pollData', function (pollData) {
    fs.mkdirSync('./cache/' + config.get('configName'), {recursive: true});
    fs.writeFileSync('./cache/' + config.get('configName') + '/polldata.json', JSON.stringify(pollData), {flag: 'w'});
});

bpTfCache.on("expired", function () {
    //  refresh listings cache
    logger.App.info('bp.tf Listings cache got expired, refreshing...');
    getBpTfListings().then(function (res) {

    }, function (err) {
        logger.App.error('bp.tf listing cache expire refresh error: ' + err.toString());
    })
});
