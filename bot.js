"use strict";
global._mckay_statistics_opt_out = true; // opt out https://github.com/DoctorMcKay/node-stats-reporter
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
const chalk = require('chalk');
const figures = require('figures');

//TODO: config değiştirmek için test.js test configi argümanlarına bak
//TODO: Trade loggerında yer kaplamayı azaltmak için dosyaya yazılan formatı sadeleştir, konsol aynı kalsın

let bptfClient = new bptf(null);
let winston = require("winston");
const {format} = require('winston');

const appLogLevels = {
    levels: {
        crit: 0,
        error: 1,
        warning: 2,
        debug: 4,
        success: 5,
        info: 5,
    },
    colors: {
        crit: chalk.black.bgRed.underline.italic,
        error: chalk.black.bgRed.underline,
        warning: chalk.yellow.underline,
        debug: chalk.cyanBright.underline.bold,
        success: chalk.green.underline,
        info: chalk.cyan,
    },
    symbols: {
        crit:       figures.cross,
        error:      figures.circleCross,
        warning:    figures.warning,
        debug:      figures.bullet,
        success:    figures.tick,
        info:    figures.circlePipe,
    }
};

const tradeLogLevels = {
    levels: {
        completed: 0,
        escrowAccepted: 0,
        incoming: 1,
        noMatch: 2,
        escrowIgnore: 2,
    },
    colors: {
        completed: chalk.black.bgRed.underline.italic,
        incoming: chalk.black.bgRed.underline,
        noMatch: chalk.yellow.underline,
        escrowIgnore: chalk.cyanBright.underline.bold,
        escrowAccepted: chalk.green.underline,
    },
    symbols: {
        completed:       figures.cross,
        incoming:      figures.circleCross,
        noMatch:    figures.warning,
        escrowIgnore:      figures.bullet,
        escrowAccepted:    figures.tick,
    }
};

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

winston.loggers.add('app', {
    level: 'success',
    levels: appLogLevels.levels,
    transports: [
        new winston.transports.File({
            format: format.combine(
                format.json(),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            ),
            filename: 'log/' + config.get('configName') + '/app.log'}),
        new winston.transports.Console({
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple(),
                format.printf(msg =>
                        chalk.blue(msg.timestamp + ': ' + appLogLevels.colors[msg.level](appLogLevels.symbols[msg.level] + ' ' + msg.level) + ' ' + chalk.blue(msg.message))
                    //  colorizer.colorize(msg.level, `${msg.timestamp} - ${msg.level}: ${msg.message}`)
                )
            ),
        }),
    ],
});

winston.loggers.add('trade', {
    level: 'noMatch',
    levels: tradeLogLevels.levels,
    transports: [
        new winston.transports.File({
            format: format.combine(
                format.json(),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            ),
            filename: 'log/' + config.get('configName') + '/trade.log'}),
        new winston.transports.Console({
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple(),
                format.printf(msg =>
                        chalk.blue(msg.timestamp + ': ' + tradeLogLevels.colors[msg.level](tradeLogLevels.symbols[msg.level] + ' ' + msg.level) + ' ' + chalk.blue(msg.message))
                )
            ),
        }),
    ],
});

const logger = {
    App: winston.loggers.get('app'),
    Trade: winston.loggers.get('trade')
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

manager.on('receivedOfferChanged', function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
        // check for ref/rec/scrap(/key) storage
        manager.getInventoryContents(440, 2, false, function (err, inv) { // TODO: tradeableOnly true yap, ryuto_higashi f2p olduğu için tradeable olmayan şimdilik
            if (err) return logger.App.error(err);
            inv = inv.map(item => item.market_hash_name);
            logger.App.info('TF2 Inv. Balance: ' + inv.filter(i => i === 'Refined Metal').length + ' ref(s) ' + inv.filter(i => i === 'Reclaimed Metal').length + ' rec(s) '+ inv.filter(i => i === 'Scrap Metal').length + ' scrap(s)');
            /* Object.keys(inv).forEach(function(key) {
                logger.App.debug(inv[key].market_hash_name);
            }); */
        });
        // TODO: maintain a fixed currency storage, craft
    }
});

bpTfCache.on( "expired", function() {
    //  refresh listings cache
    bptfClient.getListings(function (err, res) {
        if (err) return logger.App.error(err);
        else bpTfCache.set('listing', res);
        logger.App.info('bp.tf Listings cache has been successfully refreshed, next expire epoch:' + bpTfCache.getTtl('listing'));
    });
});

"use strict";
global._mckay_statistics_opt_out = true; // opt out https://github.com/DoctorMcKay/node-stats-reporter
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
const chalk = require('chalk');
const figures = require('figures');

//TODO: config değiştirmek için test.js test configi argümanlarına bak
//TODO: Trade loggerında yer kaplamayı azaltmak için dosyaya yazılan formatı sadeleştir, konsol aynı kalsın

let bptfClient = new bptf(null);
let winston = require("winston");
const {format} = require('winston');

const appLogLevels = {
    levels: {
        crit: 0,
        error: 1,
        warning: 2,
        debug: 4,
        success: 5,
        info: 5,
    },
    colors: {
        crit: chalk.black.bgRed.underline.italic,
        error: chalk.black.bgRed.underline,
        warning: chalk.yellow.underline,
        debug: chalk.cyanBright.underline.bold,
        success: chalk.green.underline,
        info: chalk.cyan,
    },
    symbols: {
        crit:       figures.cross,
        error:      figures.circleCross,
        warning:    figures.warning,
        debug:      figures.bullet,
        success:    figures.tick,
        info:    figures.circlePipe,
    }
};

const tradeLogLevels = {
    levels: {
        completed: 0,
        escrowAccepted: 0,
        incoming: 1,
        noMatch: 2,
        escrowIgnore: 2,
    },
    colors: {
        completed: chalk.black.bgRed.underline.italic,
        incoming: chalk.black.bgRed.underline,
        noMatch: chalk.yellow.underline,
        escrowIgnore: chalk.cyanBright.underline.bold,
        escrowAccepted: chalk.green.underline,
    },
    symbols: {
        completed:       figures.cross,
        incoming:      figures.circleCross,
        noMatch:    figures.warning,
        escrowIgnore:      figures.bullet,
        escrowAccepted:    figures.tick,
    }
};

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

winston.loggers.add('app', {
    level: 'success',
    levels: appLogLevels.levels,
    transports: [
        new winston.transports.File({
            format: format.combine(
                format.json(),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            ),
            filename: 'log/' + config.get('configName') + '/app.log'}),
        new winston.transports.Console({
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple(),
                format.printf(msg =>
                        chalk.blue(msg.timestamp + ': ' + appLogLevels.colors[msg.level](appLogLevels.symbols[msg.level] + ' ' + msg.level) + ' ' + chalk.blue(msg.message))
                    //  colorizer.colorize(msg.level, `${msg.timestamp} - ${msg.level}: ${msg.message}`)
                )
            ),
        }),
    ],
});

winston.loggers.add('trade', {
    level: 'noMatch',
    levels: tradeLogLevels.levels,
    transports: [
        new winston.transports.File({
            format: format.combine(
                format.json(),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            ),
            filename: 'log/' + config.get('configName') + '/trade.log'}),
        new winston.transports.Console({
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple(),
                format.printf(msg =>
                        chalk.blue(msg.timestamp + ': ' + tradeLogLevels.colors[msg.level](tradeLogLevels.symbols[msg.level] + ' ' + msg.level) + ' ' + chalk.blue(msg.message))
                )
            ),
        }),
    ],
});

const logger = {
    App: winston.loggers.get('app'),
    Trade: winston.loggers.get('trade')
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

manager.on('receivedOfferChanged', function (offer, oldState) {
    if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
        // check for ref/rec/scrap(/key) storage
        manager.getInventoryContents(440, 2, false, function (err, inv) { // TODO: tradeableOnly true yap, ryuto_higashi f2p olduğu için tradeable olmayan şimdilik
            if (err) return logger.App.error(err);
            inv = inv.map(item => item.market_hash_name);
            logger.App.info('TF2 Inv. Balance: ' + inv.filter(i => i === 'Refined Metal').length + ' ref(s) ' + inv.filter(i => i === 'Reclaimed Metal').length + ' rec(s) '+ inv.filter(i => i === 'Scrap Metal').length + ' scrap(s)');
            /* Object.keys(inv).forEach(function(key) {
                logger.App.debug(inv[key].market_hash_name);
            }); */
        });
        // TODO: maintain a fixed currency storage, craft
    }
});

bpTfCache.on( "expired", function() {
    //  refresh listings cache
    bptfClient.getListings(function (err, res) {
        if (err) return logger.App.error(err);
        else bpTfCache.set('listing', res);
        logger.App.info('bp.tf Listings cache has been successfully refreshed, next expire epoch:' + bpTfCache.getTtl('listing'));
    });
});
