import { BigNumber } from 'ethers'

export const CALCULATE_FROM_BASE = true

export const OPS = {
  ROUTE: 0,
  TRANSFER_TO_POOL: 1,
  FORWARD_PERMIT: 2,
  FORWARD_DAI_PERMIT: 3,
  JOIN_ETHER: 4,
  EXIT_ETHER: 5
  }

  export const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  export const secondsInOneYear = BigNumber.from(31557600)
  export const secondsInTenYears = secondsInOneYear.mul(10) // Seconds in 10 years
  export const k = ONE64.div(secondsInTenYears)

  export const g0 = ONE64 // No fees
  export const g1 = ONE64.mul(950).div(1000) // Sell base to the pool
  export const g2 = ONE64.mul(1000).div(950) // Sell fyToken to the pool