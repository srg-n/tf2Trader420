let Pricer = function(backpacktf) {
    this.backpacktf = backpacktf;
    this.currency = {
        "metal": {
            "name": "Refined Metal",
            "quality": 6,
            "priceindex": "0",
            "single": "ref",
            "plural": "ref",
            "round": 2,
            "blanket": 0,
            "craftable": "Craftable",
            "tradable": "Tradable",
            "defindex": 5002,
            "price": {
                "value": null,
                "currency": "usd",
                "difference": null,
                "last_update": null
            }
        },
        "hat": {
            "name": "Random Craft Hat",
            "quality": 6,
            "priceindex": "0",
            "single": "hat",
            "plural": "hats",
            "round": 1,
            "blanket": 1,
            "craftable": "Craftable",
            "tradable": "Tradable",
            "defindex": -2,
            "price": {
                "value": null,
                "currency": "metal",
                "difference": null,
                "last_update": null,
                "value_high": null
            }
        },
        "keys": {
            "name": "Mann Co. Supply Crate Key",
            "quality": 6,
            "priceindex": "0",
            "single": "key",
            "plural": "keys",
            "round": 2,
            "blanket": 0,
            "craftable": "Craftable",
            "tradable": "Tradable",
            "defindex": 5021,
            "price": {
                "value": null,
                "currency": "metal",
                "difference": null,
                "last_update": null,
                "value_high": null
            }
        },
        "earbuds": {
            "name": "Earbuds",
            "quality": 6,
            "priceindex": "0",
            "single": "bud",
            "plural": "buds",
            "round": 2,
            "blanket": 0,
            "craftable": "Craftable",
            "tradable": "Tradable",
            "defindex": 143,
            "price": {
                "value": null,
                "currency": null,
                "difference": null,
                "last_update": null
            }
        }
    };
};

Pricer.prototype.updateCurrencies = function(callback) {
    let that = this;
    this.backpacktf.getCurrencies(function (err, res) {
        if (err) return callback(err);
        that.currency = res;
        return callback(null, res);
    });
};

Pricer.prototype.convertKeyToRef = function(keyAmount) {
    return (this.currency.keys.price.value * keyAmount);
};

Pricer.prototype.convertRefToKey = function(refAmount) {
    return (refAmount / this.currency.keys.price.value);
};

module.exports = Pricer;
