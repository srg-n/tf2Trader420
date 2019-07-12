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
    }
};

let config;
let SteamUser;
let SteamCommunity;
let SteamTotp;
let TeamFortress2;
let TradeOfferManager;
let fs;
let steamid;
let bptf;
let events;
let nodeCache;
const util = require('./app/util.js');

try {
    config = require('./config.js');
    SteamUser = require('steam-user');
    SteamCommunity = require('steamcommunity');
    SteamTotp = require('steam-totp');
    TeamFortress2 = require('tf2');
    TradeOfferManager = require('steam-tradeoffer-manager');
    fs = require('fs');
    steamid = require('steamid');
    bptf = require("bptf-listings");
    events = require('events');
    nodeCache = require("node-cache");
} catch (exception) {
    console.log(exception);
    console.error('missing dependencies, use npm install');
    process.exit(1); // fatal error
}
//TODO: config değiştirmek için bot.js test configi argümanlarına bak
//TODO: Trade loggerında yer kaplamayı azaltmak için dosyaya yazılan formatı sadeleştir, konsol aynı kalsın

let bptfClient = new bptf(null);

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
BackpackAPI = new BackpackAPI(config.get('backpacktf').accessToken, config.get('backpacktf').key);

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


eventEmitter.on('init', function (initName, status, dontRetry = false) {
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
    client.gamesPlayed([]); //  reset the running games in order to restart tf2 game coordinator in case if tf2 gc got disconnected somehow
    client.gamesPlayed(['testing', 440], true);
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
            logger.App.error(err);
            process.exit(1); // fatal error, cannot continue without api key
            return;
        }
        if (fs.existsSync('./cache/' + client.steamID.getSteamID64() + '/polldata.json')) {
            manager.pollData = JSON.parse(fs.readFileSync('./cache/' + config.get('configName') + '/polldata.json').toString('utf8'));
        }
        community.setCookies(cookies);
        //  got api key
        bptfClient = new bptf({
            'accessToken': config.get('backpacktf').accessToken,
            'apiKey': manager.apiKey,
            'waitTime': 1000,
            'steamid64': client.steamID.getSteamID64()
        });
        eventEmitter.emit('init', 'Steam', true);
        eventEmitter.emit('bpTf');
    });
});

bptfClient.on('heartbeat', function (bumped) {
    logger.App.success('Heartbeat sent to backpack.tf, bumped ' + bumped + ' listings');
});

eventEmitter.on('bpTf', function () {
    bptfClient.init(function (err) {
        if (err) {
            eventEmitter.emit('init', 'bpTf', false);
            logger.App.error(err);
        }
        //  bptf client init successful
        eventEmitter.emit('init', 'bpTf', true);

        bpTfCache.emit('expired', 'bpTf', true);
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
    logger.App.error('TF2 Item Schema: ' + err);
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

manager.on('newOffer', function (offer) {
    let offerDetails = {};
    logger.Trade.incoming('New offer #' + offer.id + ' from ' + offer.partner.getSteamID64());

    if (offer.isGlitched()) {
        offer.decline(function (err) {
            if (err) reject(logger.App.error('Could not decline glitched offer #' + offer.id));
            else resolve(logger.Trade.glitchedDeclined('#' + offer.id + ' got declined due to being glitched'));
        });
    } else {
        offer.getUserDetails(function (err, me, them) {
            if (err) {
                logger.App.info('Could not get additional info for offer #' + offer.id + ', will try to continue without additional info');
                logger.App.error(JSON.stringify(err, ["message", "arguments", "type", "name"]));
            } else {
                offerDetails.me = me;
                offerDetails.them = them;
            }
            BackpackAPI.isBanned(offer.partner.getSteamID64())
                .then(function (res) {
                    if (res) {
                        offer.decline(function (err) {
                            if (err) logger.App.error(JSON.stringify(err, ["message", "arguments", "type", "name"]));
                            logger.Trade.scammerDeclined('#' + offer.id + ' got declined because sender ' + offer.partner.getSteamID64() + ' is a scammer.');
                        });
                    } else {
                        //  continue handling, not banned
                        if (offer.itemsToGive.length === 0 && offer.itemsToReceive.length > 0) { //    is a donations
                            if (config.get('app').behaviour.acceptDonations) {
                                offer.accept(false, function (err, status) {
                                    if (err) logger.App.error(JSON.stringify(err, ["message", "arguments", "type", "name"]));
                                    if (status === 'accepted') logger.Trade.donationAccepted('#' + offer.id + ' is a donation from ' + offer.partner.getSteamID64() + ', ' + util.getSafe(() => offerDetails.them.personaName) + '; got accepted.');
                                    if (status === 'escrow') logger.Trade.donationAccepted('#' + offer.id + ' is a donation with escrow for ' + offerDetails.them.escrowDays + ' day(s) from ' + offer.partner.getSteamID64() + ', ' + util.getSafe(() => offerDetails.them.personaName) + '; got accepted.');
                                });
                            }
                        }
                    }
                }).catch(function (err) {
                logger.App.error(JSON.stringify(err, ["message", "arguments", "type", "name"]));
            });
        });
    }
});

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
    bptfClient.getListings(function (err, res) {
        if (err) return logger.App.error(err);
        else bpTfCache.set('listing', res);
        logger.App.info('bp.tf Listings cache has been successfully refreshed, next expire epoch: ' + bpTfCache.getTtl('listing'));
    });
});
