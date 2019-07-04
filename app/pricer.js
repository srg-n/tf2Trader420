function Pricer(backpacktf) {
    this.backpacktf = backpacktf;
    this.currency = {};
}

Pricer.prototype.updateCurrencies = function(callback) {
    this.backpacktf.getCurrencies(function (err, res) {
        if (err) return callback(err);
        if (res) this.currency = res;
        return callback(null, this.currency);
    });
};

module.exports = Pricer;
