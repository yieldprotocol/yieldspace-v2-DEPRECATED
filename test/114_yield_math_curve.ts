import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect, use } from 'chai'
use(require('chai-bignumber')());

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0)    // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('YieldMath - Curve', async () => {
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  const secondsInOneYear = BigNumber.from(60 * 60 * 24 * 365) // Seconds in 4 years
  const secondsInFourYears = secondsInOneYear.mul(4) // Seconds in 4 years
  const k = ONE64.div(secondsInFourYears)

  const g0 = ONE64 // No fees
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell dai to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyDai to the pool

  const values = [
    ['10000000000000000000000', '1000000000000000000000', '10000000000000000000', '1000000'],
    ['100000000000000000000000000', '10000000000000000000000000', '1000000000000000000000', '1000000'],
    ['1000000000000000000000000000000', '100000000000000000000000000000', '100000000000000000000000', '1000000'],
  ]
  const timeTillMaturity = ['0', '40', '4000', '400000', '40000000']

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

  describe('Test trading functions', async () => {
    it('A higher g means more fyDai out with `fyDaiOutForDaiIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)
        var timeTillMaturity = BigNumber.from(timeTillMaturityValue)
        var g = [
          ['9', '10'],
          ['95', '100'],
          ['950', '1000'],
        ]
        var result = BigNumber.from('0')
        var previousResult = BigNumber.from('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = BigNumber.from(g[j][0]).mul(ONE64).div(BigNumber.from(g[j][1]))
          result = await yieldMath.fyDaiOutForDaiIn(daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g_)
        }

        expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyDaiOutForDaiIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const maximum = daiAmount.sub(flatFee)
        var result = maximum
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]

          result = await yieldMath.fyDaiOutForDaiIn(daiReserves, fyDaiReserves, daiAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            almostEqual(result, maximum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result.toString()).to.be.bignumber.lt(previousResult.toString())
          }
          previousResult = result
        }
      }
    })

    it('A lower g means more Dai out with `daiOutForFYDaiIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)
        var timeTillMaturity = BigNumber.from(timeTillMaturityValue)

        var g = [
          ['950', '1000'],
          ['95', '100'],
          ['9', '10'],
        ]
        var result = BigNumber.from('0')
        var previousResult = BigNumber.from('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = BigNumber.from(g[j][0]).mul(ONE64).div(BigNumber.from(g[j][1]))
          result = await yieldMath.daiOutForFYDaiIn(daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g_)
        }

        expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `daiOutForFYDaiIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const minimum = daiAmount.sub(flatFee)
        var result = minimum
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.daiOutForFYDaiIn(daiReserves, fyDaiReserves, daiAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            almostEqual(result, minimum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
          }
          previousResult = result
        }
      }
    })

    it('A higher g means more fyDai in with `fyDaiInForDaiOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)
        var timeTillMaturity = BigNumber.from(timeTillMaturityValue)

        var g = [
          ['9', '10'],
          ['95', '100'],
          ['950', '1000'],
        ]
        var result = BigNumber.from('0')
        var previousResult = BigNumber.from('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = BigNumber.from(g[j][0]).mul(ONE64).div(BigNumber.from(g[j][1]))
          result = await yieldMath.fyDaiInForDaiOut(daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g_)
        }

        expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyDaiInForDaiOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const maximum = daiAmount.add(flatFee)
        var result = maximum
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.fyDaiInForDaiOut(daiReserves, fyDaiReserves, daiAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            almostEqual(result, maximum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result.toString()).to.be.bignumber.lt(previousResult.toString())
          }
          previousResult = result
        }
      }
    })

    it('A lower g means more Dai in with `daiInForFYDaiOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)
        var timeTillMaturity = BigNumber.from(timeTillMaturityValue)

        var g = [
          ['950', '1000'],
          ['95', '100'],
          ['9', '10'],
        ]
        var result = BigNumber.from('0')
        var previousResult = BigNumber.from('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = BigNumber.from(g[j][0]).mul(ONE64).div(BigNumber.from(g[j][1]))
          result = await yieldMath.daiInForFYDaiOut(daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g_)
        }

        expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `daiInForFYDaiOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var daiReservesValue = values[i][0]
        var fyDaiReservesValue = values[i][1]
        var daiAmountValue = values[i][2]

        var daiReserves = BigNumber.from(daiReservesValue)
        var fyDaiReserves = BigNumber.from(fyDaiReservesValue)
        var daiAmount = BigNumber.from(daiAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const minimum = daiAmount.add(flatFee)
        var result = minimum
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.daiInForFYDaiOut(daiReserves, fyDaiReserves, daiAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            almostEqual(result, minimum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result.toString()).to.be.bignumber.gt(previousResult.toString())
          }
          previousResult = result
        }
      }
    })
  })
})
