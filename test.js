const { tradeStore } = require('./backend/services/tradeStore.js');
console.log('TradeStore created');
// Wait a bit for the first poll
setTimeout(() => {
  const state = tradeStore.getState();
  console.log('State:', JSON.stringify(state, null, 2));
}, 3000);