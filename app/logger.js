const winston = require("winston");
const {format} = require("winston");
const chalk = require('chalk');
const figures = require('figures');
let config = require('../config.js');

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
        crit:       chalk.black.bgRed.underline.italic,
        error:      chalk.black.bgRed.underline,
        warning:    chalk.yellow.underline,
        debug:      chalk.cyanBright.underline.bold,
        success:    chalk.green.underline,
        info:       chalk.cyan,
    },
    symbols: {
        crit:       figures.cross,
        error:      figures.circleCross,
        warning:    figures.warning,
        debug:      figures.bullet,
        success:    figures.tick,
        info:       figures.circlePipe,
    }
};

const tradeLogLevels = {
    levels: {
        accepted: 0,
        declined: 0,
        glitchedDeclined: 0,
        scammerDeclined: 1,
        completed: 1,
        escrowAccepted: 0,
        incoming: 0,
        noMatch: 0,
        escrowIgnore: 0,
    },
    colors: {   //TODO: change the styles for the trade logger
        accepted:               chalk.black.bgRed.underline.italic,
        declined:               chalk.black.bgRed.underline.italic,
        glitchedDeclined:       chalk.black.bgRed.underline.italic,
        scammerDeclined:        chalk.black.bgRed.underline.italic,
        completed:              chalk.black.bgRed.underline.italic,
        incoming:               chalk.black.bgRed.underline,
        noMatch:                chalk.yellow.underline,
        escrowIgnore:           chalk.cyanBright.underline.bold,
        escrowAccepted:         chalk.green.underline,
    },
    symbols: {
        accepted: figures.bullet,
        declined: figures.cross,
        glitchedDeclined: figures.bullet,
        scammerDeclined: figures.warning,
        completed: figures.tick,
        escrowAccepted: figures.tick,
        incoming: figures.circleCross,
        noMatch: figures.warning,
        escrowIgnore: figures.bullet,
    }
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
module.exports = logger;
