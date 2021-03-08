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
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell dai to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyDai to the pool

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

  describe('fyDaiOutForDaiIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.fyDaiOutForDaiIn(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the dai in, added to the dai reserves, exceed 2**128, we will have too much dai to operate
    it('Too much dai in', async () => {
      await expect(
        yieldMath.fyDaiOutForDaiIn(MAX, OneToken.mul(10), OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much dai in')
    })

    // If the fyDai to be obtained exceeds the fyDai reserves, the trade reverts
    it('Insufficient fyDai reserves', async () => {
      await expect(
        yieldMath.fyDaiOutForDaiIn(OneToken, OneToken.mul(10), OneToken.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient fyDai reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.fyDaiOutForDaiIn(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('daiOutForFYDaiIn reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.daiOutForFYDaiIn(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    // If the fyDai in, added to the fyDai reserves, exceed 2**128, we will have too much fyDai to operate
    it('Too much fyDai in', async () => {
      await expect(
        yieldMath.daiOutForFYDaiIn(OneToken.mul(10), MAX, OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much fyDai in')
    })

    // If the dai to be obtained exceeds the dai reserves, the trade reverts
    it('Insufficient dai reserves', async () => {
      await expect(
        yieldMath.daiOutForFYDaiIn(OneToken.mul(10), OneToken, OneToken.mul(20), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Insufficient dai reserves')
    })

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.daiOutForFYDaiIn(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('fyDaiInForDaiOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.fyDaiInForDaiOut(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much dai out', async () => {
      await expect(
        yieldMath.fyDaiInForDaiOut(OneToken.mul(2), OneToken, OneToken.mul(3), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much dai out')
    })

    // If the dai to be obtained exceeds the dai reserves, the trade reverts
    /* TODO: It correctly reverts, why do I get an UnhandledPromiseRejectionWarning?
    it('Resulting fyDai reserves too high', async () => {
      await expect(
        yieldMath.fyDaiInForDaiOut(OneToken.mul(10), MAX, OneToken, secondsInOneYear, k, g0),
        'YieldMath: Resulting fyDai reserves too high'
      )
    })
    */

    /* it("Rounding induced error", async () => {
      await expect(
        yieldMath.fyDaiInForDaiOut(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })

  describe('daiInForFYDaiOut reverts', () => {
    beforeEach(async () => {})

    // If time to maturity is higher than 1/k, multiplied or divided by g, we are too far from maturity.
    it('Too far from maturity', async () => {
      await expect(
        yieldMath.daiInForFYDaiOut(
          OneToken.mul(10),
          OneToken.mul(10),
          OneToken,
          secondsInFourYears.add(BigNumber.from(60 * 60)),
          k,
          g0
        )
      ).to.be.revertedWith('YieldMath: Too far from maturity')
    })

    it('Too much fyDai out', async () => {
      await expect(
        yieldMath.daiInForFYDaiOut(OneToken, OneToken, OneToken.mul(2), secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Too much fyDai out')
    })

    // If the dai to be traded in makes the dai reserves to go over 2**128, the trade reverts
    it('Resulting dai reserves too high', async () => {
      await expect(
        yieldMath.daiInForFYDaiOut(MAX.sub(OneToken), OneToken.mul(10), OneToken, secondsInOneYear, k, g0)
      ).to.be.revertedWith('YieldMath: Resulting dai reserves too high')
    })

    /* it('Rounding induced error', async () => {
      await expect(
        yieldMath.daiInForFYDaiOut(OneToken, OneToken, 0, secondsInOneYear, k, g0)
      ).to.be.revertedWith(
        'YieldMath: Rounding induced error'
      )
    }) */
  })
})
