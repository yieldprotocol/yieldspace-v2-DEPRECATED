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
  const g1 = new BN('950').mul(ONE64).div(new BN('1000')) // Sell base to the pool
  const g2 = new BN('1000').mul(ONE64).div(new BN('950')) // Sell fyToken to the pool

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

  describe('fyTokenOutForBaseIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.fyTokenOutForBaseIn(
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

    // If the base in, added to the base reserves, exceed 2**128, we will have too much base to operate
    it('Too much base in', async () => {
      await expectRevert(
        yieldMath.fyTokenOutForBaseIn(MAX, OneToken.mul(TEN), OneToken, secondsInOneYear, k, g0),
        'YieldMath: Too much base in'
      )
    })

    // If the fyToken to be obtained exceeds the fyToken reserves, the trade reverts
    it('Insufficient fyToken reserves', async () => {
      await expectRevert(
        yieldMath.fyTokenOutForBaseIn(OneToken, OneToken.mul(TEN), OneToken.mul(TWENTY), secondsInOneYear, k, g0),
        'YieldMath: Insufficient fyToken reserves'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.fyTokenOutForBaseIn(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('baseOutForFYTokenIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.baseOutForFYTokenIn(
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

    // If the fyToken in, added to the fyToken reserves, exceed 2**128, we will have too much fyToken to operate
    it('Too much fyToken in', async () => {
      await expectRevert(
        yieldMath.baseOutForFYTokenIn(OneToken.mul(TEN), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Too much fyToken in'
      )
    })

    // If the base to be obtained exceeds the base reserves, the trade reverts
    it('Insufficient base reserves', async () => {
      await expectRevert(
        yieldMath.baseOutForFYTokenIn(OneToken.mul(TEN), OneToken, OneToken.mul(TWENTY), secondsInOneYear, k, g0),
        'YieldMath: Insufficient base reserves'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.baseOutForFYTokenIn(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('fyTokenInForBaseOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.fyTokenInForBaseOut(
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

    it('Too much base out', async () => {
      await expectRevert(
        yieldMath.fyTokenInForBaseOut(OneToken.mul(TWO), OneToken, OneToken.mul(THREE), secondsInOneYear, k, g0),
        'YieldMath: Too much base out'
      )
    })

    // If the base to be obtained exceeds the base reserves, the trade reverts
    it('Resulting fyToken reserves too high', async () => {
      await expectRevert(
        yieldMath.fyTokenInForBaseOut(OneToken.mul(TEN), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting fyToken reserves too high'
      )
    })

    /* it("Rounding induced error", async () => {
      await expectRevert(
        yieldMath.fyTokenInForBaseOut(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('baseInForFYTokenOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expectRevert(
        yieldMath.baseInForFYTokenOut(
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

    it('Too much fyToken out', async () => {
      await expectRevert(
        yieldMath.baseInForFYTokenOut(OneToken, OneToken, OneToken.mul(TWO), secondsInOneYear, k, g0),
        'YieldMath: Too much fyToken out'
      )
    })

    // If the base to be traded in makes the base reserves to go over 2**128, the trade reverts
    it('Resulting base reserves too high', async () => {
      await expectRevert(
        yieldMath.baseInForFYTokenOut(MAX.sub(OneToken), OneToken.mul(TEN), OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting base reserves too high'
      )
    })

    /* it('Rounding induced error', async () => {
      await expectRevert(
        yieldMath.baseInForFYTokenOut(OneToken, OneToken, 0, secondsInOneYear, k, g0),
        'YieldMath: Rounding induced error'
      )
    }) */
  })
})
