// js/scripts/fix-chartjs-adapter.js
// Script to fix Chart.js adapter

const fs = require('fs');
const path = require('path');

// Fix Chart.js adapter
function fixChartJsAdapter() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'chartjs-adapter-shim.js');
  try {
    const newContent = `// chartjs-adapter-shim.js
console.log("Loading Chart.js adapter shim...");

// Ensure Chart.js and Luxon are available
if (typeof Chart === 'undefined') {
  console.error("Chart.js is not loaded!");
}

if (typeof luxon === 'undefined') {
  console.error("Luxon is not loaded!");
}

// Check if real adapter is available
const hasRealAdapter = window._adapters && window._adapters._date;

// Create adapter if not available
if (!hasRealAdapter && window.luxon && window.Chart) {
  console.log("Creating Luxon adapter for Chart.js");
  
  // Ensure _adapters exists on Chart
  window.Chart._adapters = window.Chart._adapters || {};
  
  // Create the adapter
  window.Chart._adapters._date = {
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
    
    startOf: function(time, unit, weekday) {
      const dt = window.luxon.DateTime.fromMillis(time);
      const options = unit === 'isoWeek' ? { weekday: weekday || 1 } : {};
      const startOf = unit === 'isoWeek' ? 'week' : unit;
      return dt.startOf(startOf).set(options).valueOf();
    },
    
    endOf: function(time, unit) {
      const dt = window.luxon.DateTime.fromMillis(time);
      return dt.endOf(unit).valueOf();
    }
  };
  
  // Also set it on window._adapters for compatibility
  window._adapters = window._adapters || {};
  window._adapters._date = window.Chart._adapters._date;
  
  console.log("Luxon adapter loaded successfully");
}
`;
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed Chart.js adapter');
    return true;
  } catch (error) {
    console.error('Error fixing Chart.js adapter:', error);
    return false;
  }
}

// Run the fix
fixChartJsAdapter();