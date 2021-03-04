import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect } from 'chai'

import { sellDai, sellFYDai, buyDai, buyFYDai } from './shared/yieldspace'
const { floor } = require('mathjs')

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0)    // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('YieldMath - Surface', async () => {
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  const secondsInOneYear = BigNumber.from(60 * 60 * 24 * 365) // Seconds in 4 years
  const secondsInFourYears = secondsInOneYear.mul(4) // Seconds in 4 years
  const k = ONE64.div(secondsInFourYears)

  const g0 = ONE64 // No fees
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell dai to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyDai to the pool

  const daiReserves = [
    // '100000000000000000000000',
    // '1000000000000000000000000',
    '10000000000000000000000000',
    '100000000000000000000000000',
    '1000000000000000000000000000',
  ]
  const fyDaiReserveDeltas = [
    // '10000000000000000000',
    // '1000000000000000000000',
    '100000000000000000000000',
    '10000000000000000000000000',
    '1000000000000000000000000000',
  ]
  const tradeSizes = [
    // '1000000000000000000',
    // '10000000000000000000',
    '100000000000000000000',
    '1000000000000000000000',
    '10000000000000000000000',
  ]
  const timesTillMaturity = [
    // '4',
    // '40',
    '4000',
    '400000',
    '40000000',
  ]

  before(async () => {
    const YieldMathFactory = await ethers.getContractFactory("YieldMath");
    yieldMathLibrary = await YieldMathFactory.deploy() as unknown as YieldMath // TODO: Why does the Factory return a Contract and not a YieldMath?
    await yieldMathLibrary.deployed();

    const YieldMathWrapperFactory = await ethers.getContractFactory(
      "YieldMathWrapper",
      {
        libraries: {
          YieldMath: yieldMathLibrary.address
        }
      }
    );
    
    yieldMath = await YieldMathWrapperFactory.deploy() as unknown as YieldMathWrapper // TODO: See above
    await yieldMath.deployed();
  })

  describe('Test scenarios', async () => {
    it('Compare a lattice of on-chain vs off-chain yieldspace trades', async function () {
      this.timeout(0)

      for (var daiReserve of daiReserves) {
        for (var fyDaiReserveDelta of fyDaiReserveDeltas) {
          for (var tradeSize of tradeSizes) {
            for (var timeTillMaturity of timesTillMaturity) {
              console.log(`daiReserve, fyDaiReserveDelta, tradeSize, timeTillMaturity`)
              console.log(`${daiReserve}, ${fyDaiReserveDelta}, ${tradeSize}, ${timeTillMaturity}`)
              const fyDaiReserve = BigNumber.from(daiReserve).add(BigNumber.from(fyDaiReserveDelta)).toString()
              let offChain, onChain
              offChain = sellFYDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.daiOutForFYDaiIn(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity, k, g2)
              console.log(`offChain sellFYDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain sellFYDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = sellDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyDaiOutForDaiIn(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity, k, g1)
              console.log(`offChain sellDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain sellDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = buyDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyDaiInForDaiOut(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity, k, g2)
              console.log(`offChain buyDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain buyDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = buyFYDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.daiInForFYDaiOut(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity, k, g1)
              console.log(`offChain buyFYDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain buyFYDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              console.log()
            }
          }
        }
      }
    })
  })
})
