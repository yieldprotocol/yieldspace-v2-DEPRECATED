import { artifacts, contract } from 'hardhat'

const YieldMathWrapper = artifacts.require('YieldMathWrapper')
const YieldMath = artifacts.require('YieldMath')

import * as helper from 'ganache-time-traveler'
// @ts-ignore
import { BN, expectRevert } from '@openzeppelin/test-helpers'
import { Contract } from './shared/fixtures'

function toBigNumber(x: any) {
  if (typeof x == 'object') x = x.toString()
  if (typeof x == 'number') return new BN(x)
  else if (typeof x == 'string') {
    if (x.startsWith('0x') || x.startsWith('0X')) return new BN(x.substring(2), 16)
    else return new BN(x)
  }
}

contract('YieldMath - Base', async (accounts) => {
  let snapshot: any
  let snapshotId: string

  let yieldMath: Contract

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

  before(async () => {
    const yieldMathLibrary = await YieldMath.new()
    await YieldMathWrapper.link(yieldMathLibrary)
  })

  beforeEach(async () => {
    snapshot = await helper.takeSnapshot()
    snapshotId = snapshot['result']

    // Setup YieldMathDAIWrapper
    yieldMath = await YieldMathWrapper.new()
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  describe('fyDaiOutForDaiIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.fyDaiOutForDaiIn(
          OneToken.mul(TEN),
          OneToken.mul(TEN),
          OneToken,
          secondsInFourYears.add(new BN(60 * 60)),
          k,
          g0
        ),
        'YieldMath: Too far from maturity'
      )
    })

    // If the dai in, added to the dai reserves, exceed 2**128, we will have too much dai to operate
    it('Too much dai in', async () => {
      await expectRevert(
        yieldMath.fyDaiOutForDaiIn(MAX, OneToken.mul(TEN), OneToken, secondsInOneYear, k, g0),
        'YieldMath: Too much dai in'
      )
    })

    // If the fyDai to be obtained exceeds the fyDai reserves, the trade reverts
    it('Insufficient fyDai reserves', async () => {
      await expectRevert(
        yieldMath.fyDaiOutForDaiIn(OneToken, OneToken.mul(TEN), OneToken.mul(TWENTY), secondsInOneYear, k, g0),
        'YieldMath: Insufficient fyDai reserves'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.fyDaiOutForDaiIn(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('daiOutForFYDaiIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.daiOutForFYDaiIn(
          OneToken.mul(TEN),
          OneToken.mul(TEN),
          OneToken,
          secondsInFourYears.add(new BN(60 * 60)),
          k,
          g0
        ),
        'YieldMath: Too far from maturity'
      )
    })

    // If the fyDai in, added to the fyDai reserves, exceed 2**128, we will have too much fyDai to operate
    it('Too much fyDai in', async () => {
      await expectRevert(
        yieldMath.daiOutForFYDaiIn(OneToken.mul(TEN), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Too much fyDai in'
      )
    })

    // If the dai to be obtained exceeds the dai reserves, the trade reverts
    it('Insufficient dai reserves', async () => {
      await expectRevert(
        yieldMath.daiOutForFYDaiIn(OneToken.mul(TEN), OneToken, OneToken.mul(TWENTY), secondsInOneYear, k, g0),
        'YieldMath: Insufficient dai reserves'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.daiOutForFYDaiIn(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('fyDaiInForDaiOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.fyDaiInForDaiOut(
          OneToken.mul(TEN),
          OneToken.mul(TEN),
          OneToken,
          secondsInFourYears.add(new BN(60 * 60)),
          k,
          g0
        ),
        'YieldMath: Too far from maturity'
      )
    })

    it('Too much dai out', async () => {
      await expectRevert(
        yieldMath.fyDaiInForDaiOut(OneToken.mul(TWO), OneToken, OneToken.mul(THREE), secondsInOneYear, k, g0),
        'YieldMath: Too much dai out'
      )
    })

    // If the dai to be obtained exceeds the dai reserves, the trade reverts
    it('Resulting fyDai reserves too high', async () => {
      await expectRevert(
        yieldMath.fyDaiInForDaiOut(OneToken.mul(TEN), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting fyDai reserves too high'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.fyDaiInForDaiOut(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('daiInForFYDaiOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.daiInForFYDaiOut(
          OneToken.mul(TEN),
          OneToken.mul(TEN),
          OneToken,
          secondsInFourYears.add(new BN(60 * 60)),
          k,
          g0
        ),
        'YieldMath: Too far from maturity'
      )
    })

    it('Too much fyDai out', async () => {
      await expectRevert(
        yieldMath.daiInForFYDaiOut(OneToken, OneToken, OneToken.mul(TWO), secondsInOneYear, k, g0),
        'YieldMath: Too much fyDai out'
      )
    })

    // If the dai to be traded in makes the dai reserves to go over 2**128, the trade reverts
    it('Resulting dai reserves too high', async () => {
      await expectRevert(
        yieldMath.daiInForFYDaiOut(MAX.sub(OneToken), OneToken.mul(TEN), OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting dai reserves too high'
      )
    })

    /* it('Rounding induced error', async () => {
      await expectRevert(
        yieldMath.daiInForFYDaiOut(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })
})
