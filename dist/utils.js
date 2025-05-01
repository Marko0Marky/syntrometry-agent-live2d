function displayError(message) {
    console.error(message);
}
function lerp(a, b, t) {
    if (t < 0) {
        t = 0;
    }
    else if (t > 1) {
        t = 1;
    }
    return a + (b - a) * t;
}
class Utils {
    isNullOrUndefined(obj) {
        return obj === null || obj === undefined;
    }
    isNullOrEmpty(obj) {
        return this.isNullOrUndefined(obj) || obj === "";
    }
    isPositiveNumber(obj) {
        return !this.isNullOrUndefined(obj) && typeof obj === 'number' && obj >= 0;
    }
    isPositiveInteger(obj) {
        return !this.isNullOrUndefined(obj) && typeof obj === 'number' && obj >= 0 && Number.isInteger(obj);
    }
    isBoolean(obj) {
        return !this.isNullOrUndefined(obj) && typeof obj === 'boolean';
    }
    isArray(obj) {
        return !this.isNullOrUndefined(obj) && Array.isArray(obj);
    }
    generateRandomId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
}
export { displayError, lerp };
export default new Utils();
