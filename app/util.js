module.exports = {
    getSafe: function (fn) {
        try {
            return fn();
        } catch (e) {
            return undefined;
        }
    }
};
