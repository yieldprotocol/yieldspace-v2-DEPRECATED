import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect } from 'chai'

import { sellBase, sellFYToken, buyBase, buyFYToken } from './shared/yieldspace'

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('YieldMath - Surface', async function () {
  this.timeout(0)
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  const secondsInOneYear = BigNumber.from(60 * 60 * 24 * 365) // Seconds in 4 years
  const secondsInFourYears = secondsInOneYear.mul(4) // Seconds in 4 years
  const k = ONE64.div(secondsInFourYears)

  const g0 = ONE64 // No fees
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell base to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyToken to the pool

  const baseReserves = [
    // BigNumber.from('100000000000000000000000'),
    // BigNumber.from('1000000000000000000000000'),
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('100000000000000000000000000'),
    BigNumber.from('1000000000000000000000000000'),
  ]
  const fyTokenReserveDeltas = [
    // BigNumber.from('10000000000000000000'),
    // BigNumber.from('1000000000000000000000'),
    BigNumber.from('100000000000000000000000'),
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('1000000000000000000000000000'),
  ]
  const tradeSizes = [
    // BigNumber.from('1000000000000000000'),
    // BigNumber.from('10000000000000000000'),
    BigNumber.from('100000000000000000000'),
    BigNumber.from('1000000000000000000000'),
    BigNumber.from('10000000000000000000000'),
  ]
  const timesTillMaturity = [
    // BigNumber.from('4'),
    // BigNumber.from('40'),
    BigNumber.from('4000'),
    BigNumber.from('400000'),
    BigNumber.from('40000000'),
  ]

  before(async () => {
    const YieldMathFactory = await ethers.getContractFactory('YieldMath')
    yieldMathLibrary = ((await YieldMathFactory.deploy()) as unknown) as YieldMath // TODO: Why does the Factory return a Contract and not a YieldMath?
    await yieldMathLibrary.deployed()

    const YieldMathWrapperFactory = await ethers.getContractFactory('YieldMathWrapper', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
      },
    })

    yieldMath = ((await YieldMathWrapperFactory.deploy()) as unknown) as YieldMathWrapper // TODO: See above
    await yieldMath.deployed()
  })

  describe('Test scenarios', async () => {
    it('Compare a lattice of on-chain vs off-chain yieldspace trades', async function () {
      this.timeout(0)

      for (var baseReserve of baseReserves) {
        for (var fyTokenReserveDelta of fyTokenReserveDeltas) {
          for (var tradeSize of tradeSizes) {
            for (var timeTillMaturity of timesTillMaturity) {
              console.log(`baseReserve, fyTokenReserveDelta, tradeSize, timeTillMaturity`)
              console.log(`${baseReserve}, ${fyTokenReserveDelta}, ${tradeSize}, ${timeTillMaturity}`)
              const fyTokenReserve = baseReserve.add(fyTokenReserveDelta)
              let offChain, onChain
              offChain = sellFYToken(baseReserve, fyTokenReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.baseOutForFYTokenIn(
                baseReserve,
                fyTokenReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g2
              )
              console.log(`offChain sellFYToken: ${offChain}`)
              console.log(`onChain sellFYToken: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = sellBase(baseReserve, fyTokenReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyTokenOutForBaseIn(
                baseReserve,
                fyTokenReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g1
              )
              console.log(`offChain sellBase: ${offChain}`)
              console.log(`onChain sellBase: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = buyBase(baseReserve, fyTokenReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyTokenInForBaseOut(
                baseReserve,
                fyTokenReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g2
              )
              console.log(`offChain buyBase: ${offChain}`)
              console.log(`onChain buyBase: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = buyFYToken(baseReserve, fyTokenReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.baseInForFYTokenOut(
                baseReserve,
                fyTokenReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g1
              )
              console.log(`offChain buyFYToken: ${offChain}`)
              console.log(`onChain buyFYToken: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              console.log()
            }
          }
        }
      }
    })
  })
})
