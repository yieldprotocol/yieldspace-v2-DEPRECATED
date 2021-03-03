const { bignumber, add, subtract, multiply, divide, pow } = require('mathjs')

// https://www.desmos.com/calculator/mllhtohxfx
/* export function mint(baseReserves: any, fyTokenReserves: any, supply: any, base: any): [any, any] {
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReserves)
  const S = bignumber(supply)
  const z = bignumber(base)
  const m = divide(multiply(S, z), Z)
  const y = divide(multiply(Y, m), S)

  return [m, y]
} */

export function tradeAndMint(
  baseReserves: any,
  fyTokenReservesVirtual: any,
  fyTokenReservesReal: any,
  supply: any,
  fyTokenIn: any,
  fyTokenToBuy: any,
  timeTillMaturity: any
): [any, any] {
  const Z = bignumber(baseReserves)
  const YV = bignumber(fyTokenReservesVirtual)
  const YR = bignumber(fyTokenReservesReal)
  const S = bignumber(supply)
  const yIn = bignumber(fyTokenIn)
  const yBuy = bignumber(fyTokenToBuy)
  const T = bignumber(timeTillMaturity)

  let zSold
  if (yBuy > 0) {
    zSold = buyFYToken(Z, YV, yBuy, T)
  } else {
    zSold = bignumber(-sellFYToken(Z, YV, -yBuy, T)) // A negative yBuy (fyToken to buy) means that fyToken was actually sold to the pool
  }

  return mint(add(Z, zSold), subtract(YR, yBuy), S, add(yIn, yBuy))
}

export function mint(baseReserves: any, fyTokenReservesReal: any, supply: any, fyTokenIn: any): [any, any] {
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReservesReal)
  const S = bignumber(supply)
  const yIn = bignumber(fyTokenIn)

  // Mint specifying how much Base to take in. Reverse of `mint`.
  const m = divide(multiply(S, yIn), Y)
  const zIn = divide(multiply(Z, m), S)

  return [m, zIn]
}

// https://www.desmos.com/calculator/ubsalzunpo
export function burn(baseReserves: any, fyTokenReservesReal: any, supply: any, lpTokens: any): [any, any] {
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReservesReal)
  const S = bignumber(supply)
  const x = bignumber(lpTokens)
  const z = divide(multiply(x, Z), S)
  const y = divide(multiply(x, Y), S)

  return [z, y]
}

export function burnAndTrade(
  baseReserves: any,
  fyTokenReservesVirtual: any,
  fyTokenReservesReal: any,
  supply: any,
  lpTokens: any,
  fyTokenToSell: any,
  timeTillMaturity: any
): [any, any] {
  const Z = bignumber(baseReserves)
  const YV = bignumber(fyTokenReservesVirtual)
  const YR = bignumber(fyTokenReservesReal)
  const S = bignumber(supply)
  const x = bignumber(lpTokens)
  const y2 = bignumber(fyTokenToSell)
  const T = bignumber(timeTillMaturity)

  const [z1, y1] = burn(Z, YR, S, x)
  const z2 = sellFYToken(subtract(Z, z1), subtract(YV, y1), y2, T)

  return [add(z1, z2), subtract(y1, y2)]
}

// https://www.desmos.com/calculator/5nf2xuy6yb
export function sellBase(baseReserves: any, fyTokenReserves: any, base: any, timeTillMaturity: any): any {
  const precision = bignumber(1000000000000) // Flat fee charged to prevent issues due to low precision
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(base)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(950 / 1000)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Zxa = pow(add(Z, x), a)
  const sum = subtract(add(Za, Ya), Zxa)
  const y = subtract(Y, pow(sum, invA))
  const yFee = subtract(y, precision)

  return yFee
}

// https://www.desmos.com/calculator/6jlrre7ybt
export function sellFYToken(baseReserves: any, fyTokenReserves: any, fyToken: any, timeTillMaturity: any): any {
  const precision = bignumber(1000000000000)
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(fyToken)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(1000 / 950)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Yxa = pow(add(Y, x), a)
  const sum = add(Za, subtract(Ya, Yxa))
  const y = subtract(Z, pow(sum, invA))
  const yFee = subtract(y, precision)

  return yFee
}

// https://www.desmos.com/calculator/0rgnmtckvy
export function buyBase(baseReserves: any, fyTokenReserves: any, base: any, timeTillMaturity: any): any {
  const precision = bignumber(1000000000000)
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(base)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(1000 / 950)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Zxa = pow(subtract(Z, x), a)
  const sum = subtract(add(Za, Ya), Zxa)
  const y = subtract(pow(sum, invA), Y)
  const yFee = add(y, precision)

  return yFee
}

// https://www.desmos.com/calculator/ws5oqj8x5i
export function buyFYToken(baseReserves: any, fyTokenReserves: any, fyToken: any, timeTillMaturity: any): any {
  const precision = bignumber(1000000000000)
  const Z = bignumber(baseReserves)
  const Y = bignumber(fyTokenReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(fyToken)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(950 / 1000)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Yxa = pow(subtract(Y, x), a)
  const sum = add(Za, subtract(Ya, Yxa))
  const y = subtract(pow(sum, invA), Z)
  const yFee = add(y, precision)

  return yFee
}
