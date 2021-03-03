import { artifacts, contract } from 'hardhat'

const YieldMathWrapper = artifacts.require('YieldMathWrapper')
const YieldMath = artifacts.require('YieldMath')

import * as helper from 'ganache-time-traveler'
// @ts-ignore
import { BN } from '@openzeppelin/test-helpers'
import { expect } from 'chai'
import { Contract } from './shared/fixtures'

/**
 * Throws given message unless given condition is true.
 *
 * @param message message to throw unless given condition is true
 * @param condition condition to check
 */
function assert(message: string, condition: boolean) {
  if (!condition) throw message
}

function toBigNumber(x: any) {
  if (typeof x == 'object') x = x.toString()
  if (typeof x == 'number') return new BN(x)
  else if (typeof x == 'string') {
    if (x.startsWith('0x') || x.startsWith('0X')) return new BN(x.substring(2), 16)
    else return new BN(x)
  }
}

contract('YieldMath - Curve', async (accounts) => {
  let snapshot: any
  let snapshotId: string

  let yieldMath: Contract

  const b = new BN('18446744073709551615')
  const k = b.div(new BN('126144000'))
  const g1 = new BN('950').mul(b).div(new BN('1000')) // Sell Base to the pool
  const g2 = new BN('1000').mul(b).div(new BN('950')) // Sell fyToken to the pool

  const values = [
    ['10000000000000000000000', '1000000000000000000000', '10000000000000000000', '1000000'],
    ['100000000000000000000000000', '10000000000000000000000000', '1000000000000000000000', '1000000'],
    ['1000000000000000000000000000000', '100000000000000000000000000000', '100000000000000000000000', '1000000'],
  ]
  const timeTillMaturity = ['0', '40', '4000', '400000', '40000000']

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

  describe('Test trading functions', async () => {
    it('A higher g means more fyToken out with `fyTokenOutForBaseIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]
        var timeTillMaturityValue = values[i][3]

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)
        var timeTillMaturity = toBigNumber(timeTillMaturityValue)
        var g = [
          ['9', '10'],
          ['95', '100'],
          ['950', '1000'],
        ]
        var previousResult = new BN('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = new BN(g[j][0]).mul(b).div(new BN(g[j][1]))
          var result = await yieldMath.fyTokenOutForBaseIn(baseReserves, fyTokenReserves, baseAmount, timeTillMaturity, k, g_)
        }

        expect(result).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyTokenOutForBaseIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)

        const flatFee = new BN('1000000000000')
        const maximum = baseAmount.sub(flatFee)
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]

          var result = await yieldMath.fyTokenOutForBaseIn(baseReserves, fyTokenReserves, baseAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            expect(result).to.be.bignumber.lt(maximum.mul(new BN('1000000')).div(new BN('999999')).toString())
            expect(result).to.be.bignumber.gt(maximum.mul(new BN('999999')).div(new BN('1000000')).toString())
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.bignumber.lt(previousResult.toString())
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

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)
        var timeTillMaturity = toBigNumber(timeTillMaturityValue)

        var g = [
          ['950', '1000'],
          ['95', '100'],
          ['9', '10'],
        ]
        var previousResult = new BN('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = new BN(g[j][0]).mul(b).div(new BN(g[j][1]))
          var result = await yieldMath.baseOutForFYTokenIn(baseReserves, fyTokenReserves, baseAmount, timeTillMaturity, k, g_)
        }

        expect(result).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `baseOutForFYTokenIn`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)

        const flatFee = new BN('1000000000000')
        const minimum = baseAmount.sub(flatFee)
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          var result = await yieldMath.baseOutForFYTokenIn(baseReserves, fyTokenReserves, baseAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 minus flat fee.
            expect(result).to.be.bignumber.gt(minimum.mul(new BN('999999')).div(new BN('1000000')).toString())
            expect(result).to.be.bignumber.lt(minimum.mul(new BN('1000000')).div(new BN('999999')).toString())
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.bignumber.gt(previousResult.toString())
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

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)
        var timeTillMaturity = toBigNumber(timeTillMaturityValue)

        var g = [
          ['9', '10'],
          ['95', '100'],
          ['950', '1000'],
        ]
        var previousResult = new BN('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = new BN(g[j][0]).mul(b).div(new BN(g[j][1]))
          var result = await yieldMath.fyTokenInForBaseOut(baseReserves, fyTokenReserves, baseAmount, timeTillMaturity, k, g_)
        }

        expect(result).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price grows to 1 for `fyTokenInForBaseOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)

        const flatFee = new BN('1000000000000')
        const maximum = baseAmount.add(flatFee)
        var previousResult = maximum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          var result = await yieldMath.fyTokenInForBaseOut(baseReserves, fyTokenReserves, baseAmount, t, k, g2)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            expect(result).to.be.bignumber.lt(maximum.mul(new BN('1000000')).div(new BN('999999')).toString())
            expect(result).to.be.bignumber.gt(maximum.mul(new BN('999999')).div(new BN('1000000')).toString())
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.bignumber.lt(previousResult.toString())
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

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)
        var timeTillMaturity = toBigNumber(timeTillMaturityValue)

        var g = [
          ['950', '1000'],
          ['95', '100'],
          ['9', '10'],
        ]
        var previousResult = new BN('0')
        for (var j = 0; j < g.length; j++) {
          var g_ = new BN(g[j][0]).mul(b).div(new BN(g[j][1]))
          var result = await yieldMath.baseInForFYTokenOut(baseReserves, fyTokenReserves, baseAmount, timeTillMaturity, k, g_)
        }

        expect(result).to.be.bignumber.gt(previousResult.toString())
        previousResult = result
      }
    })

    it('As we approach maturity, price drops to 1 for `baseInForFYTokenOut`', async () => {
      for (var i = 0; i < values.length; i++) {
        // console.log("")
        var baseReservesValue = values[i][0]
        var fyTokenReservesValue = values[i][1]
        var baseAmountValue = values[i][2]

        var baseReserves = toBigNumber(baseReservesValue)
        var fyTokenReserves = toBigNumber(fyTokenReservesValue)
        var baseAmount = toBigNumber(baseAmountValue)

        const flatFee = new BN('1000000000000')
        const minimum = baseAmount.add(flatFee)
        var previousResult = minimum
        for (var j = 0; j < timeTillMaturity.length; j++) {
          var t = timeTillMaturity[j]
          var result = await yieldMath.baseInForFYTokenOut(baseReserves, fyTokenReserves, baseAmount, t, k, g1)

          // console.log("      " + result.toString())
          if (j == 0) {
            // Test that when we are very close to maturity, price is very close to 1 plus flat fee.
            expect(result).to.be.bignumber.gt(minimum.mul(new BN('999999')).div(new BN('1000000')).toString())
            expect(result).to.be.bignumber.lt(minimum.mul(new BN('1000000')).div(new BN('999999')).toString())
          } else {
            // Easier to test prices diverging from 1
            expect(result).to.be.bignumber.gt(previousResult.toString())
          }
          previousResult = result
        }
      }
    })
  })
})
