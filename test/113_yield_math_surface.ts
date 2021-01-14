import { artifacts, contract } from 'hardhat'

const YieldMathWrapper = artifacts.require('YieldMathWrapper')
const YieldMath = artifacts.require('YieldMath')

import * as helper from 'ganache-time-traveler'
// @ts-ignore
import { BN } from '@openzeppelin/test-helpers'
import { expect } from 'chai'
// const { bignumber, add, subtract, multiply, divide, pow, floor } = require('mathjs')
import { sellDai, sellFYDai, buyDai, buyFYDai } from './shared/yieldspace'
const { floor } = require('mathjs')
import { Contract } from './shared/fixtures'

const ONE = new BN('1')
const TWO = new BN('2')
const THREE = new BN('3')
const FOUR = new BN('4')
const TEN = new BN('10')
const TWENTY = new BN('20')

const MAX = new BN('340282366920938463463374607431768211455') // type(uint128).max
const OneToken = new BN('1000000000000000000') // 1e18
const ONE64 = new BN('18446744073709551616') // In 64.64 format
const secondsInOneYear = new BN(60 * 60 * 24 * 365) // Seconds in 4 years
const secondsInFourYears = secondsInOneYear.mul(FOUR) // Seconds in 4 years
const k = ONE64.div(secondsInFourYears)

const g0 = ONE64 // No fees
const g1 = new BN('950').mul(ONE64).div(new BN('1000')) // Sell dai to the pool
const g2 = new BN('1000').mul(ONE64).div(new BN('950')) // Sell fyDai to the pool

const PRECISION = new BN('100000000000000') // 1e14

function toBigNumber(x: any): BN {
  if (typeof x == 'object') x = x.toString()
  if (typeof x == 'number') return new BN(x)
  else if (typeof x == 'string') {
    if (x.startsWith('0x') || x.startsWith('0X')) return new BN(x.substring(2), 16)
    else return new BN(x)
  }
}

function decTo6464(x: any): BN {
  return new BN((Number(x) * 10000).toString()).mul(ONE64).div(new BN('10000'))
}

function almostEqual(x: any, y: any, p: any) {
  // Check that abs(x - y) < p:
  const xb = toBigNumber(x)
  const yb = toBigNumber(y)
  const pb = toBigNumber(p)
  const diff = xb.gt(yb) ? xb.sub(yb) : yb.sub(xb)
  expect(diff).to.be.bignumber.lt(pb)
}

contract('YieldMath - Surface', async (accounts) => {
  let snapshot: any
  let snapshotId: string

  let yieldMath: Contract

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
    const yieldMathLibrary = await YieldMath.new()
    await YieldMathWrapper.link(yieldMathLibrary)
  })

  beforeEach(async () => {
    snapshot = await helper.takeSnapshot()
    snapshotId = snapshot['result']

    // Setup YieldMathWrapper
    yieldMath = await YieldMathWrapper.new()
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
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
              const fyDaiReserve = new BN(daiReserve).add(new BN(fyDaiReserveDelta)).toString()
              let offChain, onChain
              offChain = sellFYDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.daiOutForFYDaiIn(
                daiReserve,
                fyDaiReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g2
              )
              console.log(`offChain sellFYDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain sellFYDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = sellDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyDaiOutForDaiIn(
                daiReserve,
                fyDaiReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g1
              )
              console.log(`offChain sellDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain sellDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = buyDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.fyDaiInForDaiOut(
                daiReserve,
                fyDaiReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g2
              )
              console.log(`offChain buyDai: ${floor(offChain).toFixed()}`)
              console.log(`onChain buyDai: ${onChain}`)
              almostEqual(onChain, floor(offChain).toFixed(), PRECISION)

              offChain = buyFYDai(daiReserve, fyDaiReserve, tradeSize, timeTillMaturity)
              onChain = await yieldMath.daiInForFYDaiOut(
                daiReserve,
                fyDaiReserve,
                tradeSize,
                timeTillMaturity,
                k,
                g1
              )
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
