let convict = require('convict');

// define a schema
let config = convict({
    env: {
        doc: "The application environment.",
        format: ["production", "development", "test"],
        default: "development",
        env: "NODE_ENV",
    },
    configName: {
        doc: "The config name to execute with. Path starts with current working directory.",
        format: String,
        arg: "config",
        default: "ryuto_higashi",
    },
    app: {
        cache: {
            listingsRefreshInterval: {
                doc: "backpack.tf listings cache lifetime (in seconds)",
                format: "int",
                default: 300,
            }
        },
        behaviour: {
            escrow: {
                accept: {
                    doc: "Accept trades with escrow or not",
                    format: 'Boolean',
                    default: false,
                },
                maxDays: {
                    doc: "Maximum escrow days to get accepted (escrow.days must be true)",
                    format: 'int',
                    default: 0,
                }
            },
        },
        currencyMaintain: {
            sellKeys: {
                doc: "Sell keys automatically to maintain currency storage",
                format: 'Boolean',
                default: false,
            }
        }
    },
    steam: {
        accountName: {
            doc: "Steam login username",
            format: "*",
            default: "anonymous",
        },
        password: {
            doc: "Steam login password",
            sensitive: true,
            format: String,
            default: "anonymous",
        },
        identitySecret: {
            doc: "Steam 2fa identity secret",
            sensitive: true,
            format: String,
            default: "",
        },
        sharedSecret: {
            doc: "Steam 2fa shared secret",
            sensitive: true,
            format: String,
            default: "",
        },
    },
    backpacktf: {
        accessToken: {
            doc: "backpack.tf access token https://backpack.tf/developer/apikey/view",
            format: String,
            default: "",
        },
        key: {
            doc: "backpack.tf api key",
            format: String,
            default: "",
        }
    }
});

// load environment dependent configuration
/*
var env = config.get('env');
config.loadFile('./config/' + env + '.json');
*/

// load user dependent configuration
config.loadFile('./config/' + config.get('configName') + '.json');

// perform validation
config.validate({allowed: 'strict'});

module.exports = config;
