import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { solidity } from 'ethereum-waffle'
import { expect, use } from 'chai'
use(solidity)

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('YieldMath - Curve', async () => {
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const ONE64 = BigNumber.from('18446744073709551616') // In 64.64 format
  const secondsInOneYear = BigNumber.from(60 * 60 * 24 * 365) // Seconds in 4 years
  const secondsInFourYears = secondsInOneYear.mul(4) // Seconds in 4 years
  const k = ONE64.div(secondsInFourYears)

  const g0 = ONE64 // No fees
  const g1 = BigNumber.from('950').mul(ONE64).div(BigNumber.from('1000')) // Sell base to the pool
  const g2 = BigNumber.from('1000').mul(ONE64).div(BigNumber.from('950')) // Sell fyToken to the pool

  const values = [
    ['10000000000000000000000', '1000000000000000000000', '10000000000000000000', '1000000'],
    ['100000000000000000000000000', '10000000000000000000000000', '1000000000000000000000', '1000000'],
    ['1000000000000000000000000000000', '100000000000000000000000000000', '100000000000000000000000', '1000000'],
  ]
  const timeTillMaturity = ['0', '40', '4000', '400000', '40000000']

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

  describe('Test trading functions', async () => {
    it('A higher g means more fyToken out with `fyTokenOutForBaseIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)
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
          result = await yieldMath.fyTokenOutForBaseIn(
            baseReserves,
            fyTokenReserves,
            baseAmount,
            timeTillMaturity,
            k,
            g_
          )
        }

        expect(result).to.be.gt(previousResult)
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyTokenOutForBaseIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const maximum = baseAmount.sub(flatFee)
        var result = maximum
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]

          result = await yieldMath.fyTokenOutForBaseIn(baseReserves, fyTokenReserves, baseAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            almostEqual(result, maximum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.lt(previousResult)
          }
          previousResult = result
        }
      }
    })

    it('A lower g means more Base out with `baseOutForFYTokenIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)
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
          result = await yieldMath.baseOutForFYTokenIn(
            baseReserves,
            fyTokenReserves,
            baseAmount,
            timeTillMaturity,
            k,
            g_
          )
        }

        expect(result).to.be.gt(previousResult)
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `baseOutForFYTokenIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const minimum = baseAmount.sub(flatFee)
        var result = minimum
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.baseOutForFYTokenIn(baseReserves, fyTokenReserves, baseAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            almostEqual(result, minimum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.gt(previousResult)
          }
          previousResult = result
        }
      }
    })

    it('A higher g means more fyToken in with `fyTokenInForBaseOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)
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
          result = await yieldMath.fyTokenInForBaseOut(
            baseReserves,
            fyTokenReserves,
            baseAmount,
            timeTillMaturity,
            k,
            g_
          )
        }

        expect(result).to.be.gt(previousResult)
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyTokenInForBaseOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const maximum = baseAmount.add(flatFee)
        var result = maximum
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.fyTokenInForBaseOut(baseReserves, fyTokenReserves, baseAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            almostEqual(result, maximum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.lt(previousResult)
          }
          previousResult = result
        }
      }
    })

    it('A lower g means more Base in with `baseInForFYTokenOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)
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
          result = await yieldMath.baseInForFYTokenOut(
            baseReserves,
            fyTokenReserves,
            baseAmount,
            timeTillMaturity,
            k,
            g_
          )
        }

        expect(result).to.be.gt(previousResult)
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `baseInForFYTokenOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = BigNumber.from(baseReservesValue)
        var fyTokenReserves = BigNumber.from(fyTokenReservesValue)
        var baseAmount = BigNumber.from(baseAmountValue)

        const flatFee = BigNumber.from('1000000000000')
        const minimum = baseAmount.add(flatFee)
        var result = minimum
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          result = await yieldMath.baseInForFYTokenOut(baseReserves, fyTokenReserves, baseAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            almostEqual(result, minimum, PRECISION)
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.gt(previousResult)
          }
          previousResult = result
        }
      }
    })
  })
})
