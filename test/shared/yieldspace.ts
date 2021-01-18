const { bignumber, add, subtract, multiply, divide, pow } = require('mathjs')

// https://www.desmos.com/calculator/mllhtohxfx
export function mint(daiReserves: any, fyDaiReserves: any, supply: any, dai: any): [any, any] {
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const S = bignumber(supply)
  const z = bignumber(dai)
  const m = divide(multiply(S, z), Z)
  const y = divide(multiply(Y, m), S)

  return [m, y]
}

export function mintWithDai(
  daiReserves: any,
  fyDaiReservesVirtual: any,
  fyDaiReservesReal: any,
  supply: any,
  fyDai: any,
  timeTillMaturity: any
): [any, any] {
  const Z = bignumber(daiReserves)
  const YV = bignumber(fyDaiReservesVirtual)
  const YR = bignumber(fyDaiReservesReal)
  const S = bignumber(supply)
  const y = bignumber(fyDai)
  const T = bignumber(timeTillMaturity)

  const z1 = buyFYDai(Z, YV, y, T) // Buy fyDai
  // Mint specifying how much fyDai to take in. Reverse of `mint`.
  const m = divide(multiply(S, y), subtract(YR, y))
  const z2 = divide(multiply(add(Z, z1), m), S)

  return [m, add(z1, z2)]
}

// https://www.desmos.com/calculator/ubsalzunpo
export function burn(daiReserves: any, fyDaiReserves: any, supply: any, lpTokens: any): [any, any] {
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const S = bignumber(supply)
  const x = bignumber(lpTokens)
  const z = divide(multiply(x, Z), S)
  const y = divide(multiply(x, Y), S)

  return [z, y]
}

export function burnForDai(
  daiReserves: any,
  fyDaiReservesVirtual: any,
  fyDaiReservesReal: any,
  supply: any,
  lpTokens: any,
  timeTillMaturity: any
): any {
  const Z = bignumber(daiReserves)
  const YV = bignumber(fyDaiReservesVirtual)
  const YR = bignumber(fyDaiReservesReal)
  const S = bignumber(supply)
  const x = bignumber(lpTokens)
  const T = bignumber(timeTillMaturity)

  const [z1, y] = burn(Z, YR, S, x)
  const z2 = sellFYDai(Z, YV, y, T)

  return add(z1, z2)
}

// https://www.desmos.com/calculator/5nf2xuy6yb
export function sellDai(daiReserves: any, fyDaiReserves: any, dai: any, timeTillMaturity: any): any {
  const fee = bignumber(1000000000000)
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(dai)
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
  const yFee = subtract(y, fee)

  return yFee
}

// https://www.desmos.com/calculator/6jlrre7ybt
export function sellFYDai(daiReserves: any, fyDaiReserves: any, fyDai: any, timeTillMaturity: any): any {
  const fee = bignumber(1000000000000)
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(fyDai)
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
  const yFee = subtract(y, fee)

  return yFee
}

// https://www.desmos.com/calculator/0rgnmtckvy
export function buyDai(daiReserves: any, fyDaiReserves: any, dai: any, timeTillMaturity: any): any {
  const fee = bignumber(1000000000000)
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(dai)
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
  const yFee = add(y, fee)

  return yFee
}

// https://www.desmos.com/calculator/ws5oqj8x5i
export function buyFYDai(daiReserves: any, fyDaiReserves: any, fyDai: any, timeTillMaturity: any): any {
  const fee = bignumber(1000000000000)
  const Z = bignumber(daiReserves)
  const Y = bignumber(fyDaiReserves)
  const T = bignumber(timeTillMaturity)
  const x = bignumber(fyDai)
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
  const yFee = add(y, fee)

  return yFee
}
