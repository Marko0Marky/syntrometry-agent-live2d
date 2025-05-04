// chartjs-adapter-shim.js
console.log("Loading Chart.js adapter shim...");

// Check if real adapter is available
const hasRealAdapter = window._adapters && window._adapters._date;

// Create adapter if not available
if (!hasRealAdapter && window.luxon && window.Chart) {
    console.log("Creating Luxon adapter for Chart.js");
    
    // Ensure _adapters exists
    window._adapters = window._adapters || {};
    window._adapters._date = {
        _id: 'luxon',
        
        formats: function() {
            return { 
                datetime: 'MMM d, yyyy, h:mm:ss a',
                millisecond: 'h:mm:ss.SSS a',
                second: 'h:mm:ss a',
                minute: 'h:mm a',
                hour: 'ha',
                day: 'MMM d',
                week: 'DD',
                month: 'MMM yyyy',
                quarter: 'QQQ - yyyy',
                year: 'yyyy'
            };
        },
        
        parse: function(value) {
            const dt = typeof value === 'string' 
                ? window.luxon.DateTime.fromISO(value)
                : window.luxon.DateTime.fromMillis(value);
            return dt.isValid ? dt.valueOf() : null;
        },
        
        format: function(time, format) {
            const dt = window.luxon.DateTime.fromMillis(time);
            return dt.toFormat(format);
        },
        
        add: function(time, amount, unit) {
            const dt = window.luxon.DateTime.fromMillis(time);
            return dt.plus({ [unit]: amount }).valueOf();
        },
        
        diff: function(max, min, unit) {
            const dtMax = window.luxon.DateTime.fromMillis(max);
            const dtMin = window.luxon.DateTime.fromMillis(min);
            return dtMax.diff(dtMin, unit).get(unit);
        },
        
        startOf: function(time, unit) {
            const dt = window.luxon.DateTime.fromMillis(time);
            return dt.startOf(unit).valueOf();
        },
        
        endOf: function(time, unit) {
            const dt = window.luxon.DateTime.fromMillis(time);
            return dt.endOf(unit).valueOf();
        }
    };
    
    console.log("Luxon adapter loaded successfully");
}

// Export a dummy object for ES modules
export default {};