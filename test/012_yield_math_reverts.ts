import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX128 } = constants
const MAX = MAX128

import { secondsInOneYear, secondsInTenYears, k, g0 } from '../src/constants'

import { ethers } from 'hardhat'
import { expect } from 'chai'

describe('YieldMath - Reverts', async function () {
  this.timeout(0)
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  before(async () => {
    const YieldMathFactory = await ethers.getContractFactory('YieldMath')
    yieldMathLibrary = ((await YieldMathFactory.deploy()) as unknown) as YieldMath
    await yieldMathLibrary.deployed()

    const YieldMathWrapperFactory = await ethers.getContractFactory('YieldMathWrapper', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
      },
    })

    yieldMath = ((await YieldMathWrapperFactory.deploy()) as unknown) as YieldMathWrapper
    await yieldMath.deployed()
  })

  describe('fyTokenOutForBaseIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(
          WAD.mul(10),
          WAD.mul(10),
          WAD,
          secondsInTenYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the base in, added to the base balance, exceed 2**128, we will have too much base to operate
    it('Too much base in', async () => {
      await expect(yieldMath.fyTokenOutForBaseIn(MAX, WAD.mul(10), WAD, secondsInOneYear, k, g0)).to.be.revertedWith(
        'YieldMath: Too much base in'
      )
    })

    // If the fyToken to be obtained exceeds the fyToken balance, the trade reverts
    it('Insufficient fyToken balance', async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(WAD, WAD.mul(10), WAD.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient fyToken reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(WAD, WAD, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('baseOutForFYTokenIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(
          WAD.mul(10),
          WAD.mul(10),
          WAD,
          secondsInTenYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the fyToken in, added to the fyToken balance, exceed 2**128, we will have too much fyToken to operate
    it('Too much fyToken in', async () => {
      await expect(yieldMath.baseOutForFYTokenIn(WAD.mul(10), MAX, WAD, secondsInOneYear, k, g0)).to.be.revertedWith(
        'YieldMath: Too much fyToken in'
      )
    })

    // If the base to be obtained exceeds the base balance, the trade reverts
    it('Insufficient base balance', async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(WAD.mul(10), WAD, WAD.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient base reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(MAX, WAD, WAD, 1, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('fyTokenInForBaseOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(
          WAD.mul(10),
          WAD.mul(10),
          WAD,
          secondsInTenYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much base out', async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(WAD.mul(2), WAD, WAD.mul(3), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much base out')
    })

    // If the base to be obtained exceeds the base balance, the trade reverts
    it('Resulting fyToken balance too high', async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(WAD.mul(10), MAX, WAD, secondsInOneYear.mul(4), k, g0),
        'YieldMath: Resulting fyToken balance too high'
      ).to.be.revertedWith('YieldMath: Resulting fyToken reserves too high')
    })

    it('Rounding induced error', async () => {
      await expect(yieldMath.fyTokenInForBaseOut(WAD.mul(10), MAX, WAD, 1, k, g0)).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    })
  })

  describe('baseInForFYBaseOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(
          WAD.mul(10),
          WAD.mul(10),
          WAD,
          secondsInTenYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much fyToken out', async () => {
      await expect(yieldMath.baseInForFYTokenOut(WAD, WAD, WAD.mul(2), secondsInOneYear, k, g0)).to.be.revertedWith(
        'YieldMath: Too much fyToken out'
      )
    })

    // If the base to be traded in makes the base balance to go over 2**128, the trade reverts
    it('Resulting base balance too high', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(MAX, WAD.mul(10), WAD, secondsInOneYear.mul(4), k, g0)
      ).to.be.revertedWith('YieldMath: Resulting base reserves too high')
    })

    it('Rounding induced error', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(MAX, WAD, WAD, 1, k, g0) // Why does it revert? No idea.
      ).to.be.revertedWith('YieldMath: Rounding induced error')
    })
  })
})
