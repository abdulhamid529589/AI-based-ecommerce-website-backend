// Currency configuration for backend

export const CURRENCY_CONFIG = {
  PRIMARY: {
    code: 'BDT',
    name: 'Bangladeshi Taka',
    symbol: '৳',
  },
  SUPPORTED: {
    BDT: {
      code: 'BDT',
      name: 'Bangladeshi Taka',
      symbol: '৳',
    },
    USD: {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
    },
    EUR: {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
    },
    GBP: {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
    },
  },
  EXCHANGE_RATES: {
    // 1 BDT to other currencies (update these rates regularly)
    BDT_TO_USD: 1 / 83, // Approximate rate
    BDT_TO_EUR: 1 / 90,
    BDT_TO_GBP: 1 / 105,
  },
}

export const formatPriceForDB = (price) => {
  if (!price || price < 0) {
    return 0
  }
  return parseFloat(price).toFixed(2)
}

export const validatePrice = (price) => {
  const parsedPrice = parseFloat(price)
  return !isNaN(parsedPrice) && parsedPrice >= 0
}

export default CURRENCY_CONFIG
