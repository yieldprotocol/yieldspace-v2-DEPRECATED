import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect } from 'chai'

describe('YieldMath - Reverts', async () => {
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const MAX = BigNumber.from('340282366920938463463374607431768211455') // type(uint128).max
  const OneToken = BigNumber.from('1000000000000000000') // 1e18
  const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  const secondsInOneYear = BigNumber.from(60 * 60 * 24 * 365) // Seconds in 4 years
  const secondsInFourYears = secondsInOneYear.mul(4) // Seconds in 4 years
  const k = ONE64.div(secondsInFourYears)

  const g0 = ONE64 // No fees
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell base to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyToken to the pool

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

  describe('fyTokenOutForBaseIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the base in, added to the base reserves, exceed 2**128, we will have too much base to operate
    it('Too much base in', async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(MAX, OneToken.mul(10), OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much base in')
    })

    // If the fyToken to be obtained exceeds the fyToken reserves, the trade reverts
    it('Insufficient fyToken reserves', async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(OneToken, OneToken.mul(10), OneToken.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient fyToken reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.fyTokenOutForBaseIn(OneToken, OneToken, 0, secondsInOneYear, k, g0)
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
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the fyToken in, added to the fyToken reserves, exceed 2**128, we will have too much fyToken to operate
    it('Too much fyToken in', async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(OneToken.mul(10), MAX, OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much fyToken in')
    })

    // If the base to be obtained exceeds the base reserves, the trade reverts
    it('Insufficient base reserves', async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(OneToken.mul(10), OneToken, OneToken.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient base reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.baseOutForFYTokenIn(OneToken, OneToken, 0, secondsInOneYear, k, g0)
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
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much base out', async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(OneToken.mul(2), OneToken, OneToken.mul(3), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much base out')
    })

    // If the base to be obtained exceeds the base reserves, the trade reverts
    /* TODO: It correctly reverts, why do I get an UnhandledPromiseRejectionWarning?
    it('Resulting fyToken reserves too high', async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(OneToken.mul(10), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting fyToken reserves too high'
      )
    })
    */

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.fyTokenInForBaseOut(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('baseInForFYBaseOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much fyToken out', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(OneToken, OneToken, OneToken.mul(2), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much fyToken out')
    })

    // If the base to be traded in makes the base reserves to go over 2**128, the trade reverts
    it('Resulting base reserves too high', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(MAX.sub(OneToken), OneToken.mul(10), OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Resulting base reserves too high')
    })

    /* it('Rounding induced error', async () => {
      await expect(
        yieldMath.baseInForFYTokenOut(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })
})
