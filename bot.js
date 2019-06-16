/*
	* Jetbrains Webstorm
	* author: sergun
*/
"use strict";
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const TeamFortress2 = require('tf2');
const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('fs');
const steamid = require('steamid');
const bptf = require('bptf-listings');
const tf2items = require('tf2-items');
const events = require('events');
const nodeCache = require("node-cache");
const chalk = require('chalk');
const figures = require('figures');

//TODO: config değiştirmek için test.js test configi argümanlarına bak

let bptfClient = new bptf(null);
let winston = require("winston");
const {format} = require('winston');

const customLogLevels = {
    levels: {
        crit: 0,
        error: 1,
        warning: 2,
        debug: 4,
        success: 5,
        trade: 5
    },
    /* colors: {
        crit: 'red bold underline',
        error: 'magenta bold redBG',
        warning: 'yellow',
        debug: 'cyan',
        success: 'green',
        trade: 'white',
    }, */
    colors: {
        crit: chalk.black.bgRed.underline.italic,
        error: chalk.black.bgRed.underline,
        warning: chalk.yellow.underline,
        debug: chalk.cyanBright.underline.bold,
        success: chalk.green.underline,
        trade: chalk.whiteBright.underline,
    },
    symbols: {
        crit:       figures.cross,
        error:      figures.circleCross,
        warning:    figures.warning,
        debug:      figures.bullet,
        success:    figures.tick,
        trade:      figures.pointer
    }
};

let logger = winston.createLogger();
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
let manager = new TradeOfferManager({client}, );
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
    tf2Items: {
        Client: false,
        try: {}
    },
    tf2: {
        Client: false,
        try: {}
    },
};

logger = winston.createLogger({
    levels: customLogLevels.levels,
    format: format.combine(
        format.json(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    ),
    transports: [
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'crit'}),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'error'}),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'warning' }),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'info' }),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'debug' }),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/app.log', level: 'trade' }),
        new winston.transports.File({ filename: 'log/' + config.get('configName') + '/trade.log', level: 'tradelog'})
    ],
});

logger.add(new winston.transports.Console({
    level: 'success',
    format: winston.format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.simple(),
        format.printf(msg =>
                chalk.blue(msg.timestamp + ': ' + customLogLevels.colors[msg.level](customLogLevels.symbols[msg.level] + ' ' + msg.level) + ' ' + chalk.blue(msg.message))
            //  colorizer.colorize(msg.level, `${msg.timestamp} - ${msg.level}: ${msg.message}`)
        )
    ),
    transports: [
        new winston.transports.Console(),
    ]
}));

eventEmitter.on('init', function (initName, status, dontRetry = false) {
    initSeq[initName].try[(new Date).getTime()] = status;
    if (status) {
        initSeq[initName].Client = true;
        logger.success(initName + ' initialized');
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
    logger.success('Logged into Steam');
    client.setPersona(SteamUser.EPersonaState.Offline);
    // noinspection JSCheckFunctionSignatures
    client.gamesPlayed(440);
});

client.on('webSession', function (sessionID, cookies) {
    manager.setCookies(cookies, function (err) {
        if (err) {
            eventEmitter.emit('init', 'Steam', false);
            logger.error(err);
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
        eventEmitter.emit('tf2Items');
    });
});


bptfClient.on('heartbeat', function (bumped) {
    logger.success('Heartbeat sent to backpack.tf, bumped ' + bumped + ' listings');
});

tf2.on('connectedToGC', function () {
    eventEmitter.emit('init', 'tf2', true);
});

tf2.on('disconnectedFromGC', function (reason) {
    let reasonEnumerated = reason;
    if (reason === TeamFortress2.GCGoodbyeReason.GC_GOING_DOWN) reasonEnumerated = 'GC servers are going down for a maintenance';
    if (reason === TeamFortress2.GCGoodbyeReason.NO_SESSION) reasonEnumerated = 'Unexpected GC crash';
    logger.warning('TF2 Client got disconnected from the game coordinator, ' + reasonEnumerated + '. The client will reconnect automatically when available.');
    eventEmitter.emit('init', 'tf2', false);
});

eventEmitter.on('tf2Items', function () {
    const tf2Items = new tf2items({
        "apiKey": manager.apiKey,
        "updateTime": 86400000, //  in ms
    });
    tf2Items.init(function (err) {
        if (err) {
            eventEmitter.emit('init', 'tf2Items', false);
            return logger.error(err);
        }
        eventEmitter.emit('init', 'tf2Items', true);
    });
});


eventEmitter.on('bpTf', function () {
    bptfClient.init(function (err) {
        if (err) {
            eventEmitter.emit('init', 'bpTf', false);
            logger.error(err);
        }
        //  bptf client init successful
        eventEmitter.emit('init', 'bpTf', true);
        bpTfCache.emit('expired', 'bpTf', true);
    });
});

bpTfCache.on( "expired", function() {
    //  refresh listings cache
    bptfClient.getListings(function (err, res) {
        if (err) logger.error(err);
        else bpTfCache.set('listing', res);
    });
});

manager.on('pollData', function (pollData) {
    fs.writeFileSync('./cache/' + config.get('configName') + '/polldata.json', JSON.stringify(pollData), { flag: 'w' });
});