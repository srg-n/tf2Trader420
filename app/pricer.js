function Pricer(backpacktf) {
    this.backpacktf = backpacktf;
    this.currency = {
        "response": {
            "success": 1,
            "currencies": {
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
                        "last_update": null,
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
            },
            "name": "Team Fortress 2",
            "url": "https://backpack.tf"
        }
    };
}

Pricer.prototype.updateCurrencies = function(callback) {
    this.backpacktf.getCurrencies(function (err, res) {
        if (err) return callback(err);
        if (res) this.currency = res;
        return callback(null, this.currency);
    });
};

module.exports = Pricer;
