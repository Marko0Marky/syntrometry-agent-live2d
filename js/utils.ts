function displayError(message: string): void {
    console.error(message);
}

function lerp(a: number, b: number, t: number): number {
    if (t < 0) {
        t = 0;
    } else if (t > 1) {
        t = 1;
    }
    return a + (b - a) * t;
}
class Utils {
    isNullOrUndefined(obj: any): boolean {
        return obj === null || obj === undefined
    }
    isNullOrEmpty(obj: any): boolean {
        return this.isNullOrUndefined(obj) || obj === ""
    }
    isPositiveNumber(obj: any): boolean {
        return !this.isNullOrUndefined(obj) && typeof obj === 'number' && obj >= 0
    }
    isPositiveInteger(obj: any): boolean {
        return !this.isNullOrUndefined(obj) && typeof obj === 'number' && obj >= 0 && Number.isInteger(obj)
    }
    isBoolean(obj: any): boolean {
        return !this.isNullOrUndefined(obj) && typeof obj === 'boolean'
    }
    isArray(obj: any): boolean {
        return !this.isNullOrUndefined(obj) && Array.isArray(obj)
    }
    generateRandomId(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    }
}

export { displayError, lerp };

export default new Utils()