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
const logger = require('./app/logger.js');
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const TeamFortress2 = require('tf2');
const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('fs');
const steamid = require('steamid');
const bptf = require("bptf-listings");
const events = require('events');
const nodeCache = require("node-cache");

//TODO: config değiştirmek için bot.js test configi argümanlarına bak
//TODO: Trade loggerında yer kaplamayı azaltmak için dosyaya yazılan formatı sadeleştir, konsol aynı kalsın

let bptfClient = new bptf(null);

let config = require('./config.js');
let bpTfCache = new nodeCache({
    stdTTL: config.get('app').cache.listingsRefreshInterval, // in seconds
    checkperiod: 1,
    errorOnMissing: true,
    useClones: true,
    deleteOnExpire: true
});
let eventEmitter = new events.EventEmitter();
let client = new SteamUser();
let manager = new TradeOfferManager({
    steam: client,
});
let community = new SteamCommunity();
let tf2 = new TeamFortress2(client);

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
    }
});

client.logOn({
    "accountName": config.get('steam').accountName,
    "password": config.get('steam').password,
    "twoFactorCode": SteamTotp.generateAuthCode(config.get('steam').sharedSecret)
});

client.on('loggedOn', function () {
    //  steam client log in successful
    logger.App.success('Logged into Steam');
    client.setPersona(SteamUser.EPersonaState.Offline);
    // noinspection JSCheckFunctionSignatures
    client.gamesPlayed(440);
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

tf2.on('connectedToGC', function () {
    eventEmitter.emit('init', 'tf2', true);
    tf2.sortBackpack(4);
    currencyMaintain();
});

tf2.on('disconnectedFromGC', function (reason) {
    let reasonEnumerated = reason;
    if (reason === TeamFortress2.GCGoodbyeReason.GC_GOING_DOWN) reasonEnumerated = 'GC servers are going down for a maintenance';
    if (reason === TeamFortress2.GCGoodbyeReason.NO_SESSION) reasonEnumerated = 'Unexpected GC crash';
    logger.App.warning('TF2 Client got disconnected from the game coordinator, ' + reasonEnumerated + '. The client will reconnect automatically when available.');
    eventEmitter.emit('init', 'tf2', false);
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

function currencyMaintain() {
    manager.getInventoryContents(440, 2, false, function (err, inv) { // TODO: tradeableOnly true yap, ryuto_higashi f2p olduğu için tradeable olmayan şimdilik
        if (err) return logger.App.error(err);
        inv = inv.map(item => item.market_hash_name);
        logger.App.debug(inv.join(', '));
        App.user.tf2.currencies.key = inv.filter(i => i === 'Mann Co. Supply Crate Key').length;
        App.user.tf2.currencies.scrap = inv.filter(i => i === 'Scrap Metal').length;
        App.user.tf2.currencies.ref = inv.filter(i => i === 'Refined Metal').length;
        App.user.tf2.currencies.rec = inv.filter(i => i === 'Reclaimed Metal').length;
        logger.App.info('TF2 Inv. Balance: ' + App.user.tf2.currencies.key + ' key(s) ' + App.user.tf2.currencies.ref + ' ref(s) ' + App.user.tf2.currencies.rec + ' rec(s) '+ App.user.tf2.currencies.scrap + ' scrap(s)');
        /* Object.keys(inv).forEach(function(key) {
            logger.App.debug(inv[key].market_hash_name);
        }); */
    });
    // TODO: maintain a fixed currency storage, craft
}

manager.on('receivedOfferChanged', function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
        // check for ref/rec/scrap(/key) storage
        currencyMaintain();
    }
});

manager.on('pollData', function (pollData) {
    fs.writeFileSync('./cache/' + config.get('configName') + '/polldata.json', JSON.stringify(pollData), { flag: 'w' });
});

bpTfCache.on( "expired", function() {
    //  refresh listings cache
    bptfClient.getListings(function (err, res) {
        if (err) return logger.App.error(err);
        else bpTfCache.set('listing', res);
        logger.App.info('bp.tf Listings cache has been successfully refreshed, next expire epoch: ' + bpTfCache.getTtl('listing'));
    });
});