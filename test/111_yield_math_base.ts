import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'

/**
 * Throws given message unless given condition is true.
 *
 * @param message message to throw unless given condition is true
 * @param condition condition to check
 */
function assert(message: string, condition: boolean) {
  if (!condition) throw message
}

describe('YieldMath - Base', async () => {
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

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

  describe('Test pure math functions', async () => {
    it('Test `log_2` function', async () => {
      var xValues = [
        '0x0',
        '0x1',
        '0x2',
        '0xFEDCBA9876543210',
        '0xFFFFFFFFFFFFFFFF',
        '0x10000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x1000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x10000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x1000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x10000000000000000000000000000000',
        '0x3FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x40000000000000000000000000000000',
        '0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x80000000000000000000000000000000',
        '0xFEDCBA9876543210FEDCBA9876543210',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      ]

      for (var i = 0; i < xValues.length; i++) {
        var xValue = xValues[i]
        var x = BigNumber.from(xValue)
        var result
        try {
          result = await yieldMath.log_2(x.toString())
        } catch (e) {
          result = [false, undefined]
        }
        if (!x.eq(BigNumber.from('0x0'))) {
          assert('log_2 (' + xValue + ')[0]', result[0] as boolean)
          assert(
            'log_2 (' + xValue + ')[1]',
            Math.abs(
              Math.log(Number(x)) / Math.LN2 -
                Number(result[1]) / Number(BigNumber.from('0x2000000000000000000000000000000'))
            ) < 0.00000000001
          )
        } else {
          assert('!log_2 (' + xValue + ')[0]', !result[0])
        }
      }
    })

    it('Test `pow_2` function', async () => {
      var xValues = [
        '0x0',
        '0x1',
        '0x2',
        '0x1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x2000000000000000000000000000000',
        '0x2000000000000000000000000000001',
        '0x20123456789ABCDEF0123456789ABCD',
        '0x3FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x40000000000000000000000000000000',
        '0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x80000000000000000000000000000000',
        '0xFEDCBA9876543210FEDCBA9876543210',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      ]

      for (var i = 0; i < xValues.length; i++) {
        var xValue = xValues[i]
        // console.log('    pow_2 (' + xValue + ')')
        var x = BigNumber.from(xValue)
        var result
        try {
          result = await yieldMath.pow_2(x)
        } catch (e) {
          result = [false, undefined]
        }
        assert('pow_2 (' + xValue + ')[0]', result[0] as boolean)
        var expected = Math.pow(2, Number(x) / Number(BigNumber.from('0x2000000000000000000000000000000')))
        assert(
          'pow_2 (' + xValue + ')[1]',
          Math.abs(expected - Number(result[1])) <= Math.max(1.0000000000001, expected / 1000000000000.0)
        )
      }
    })

    it('Test `pow` function', async () => {
      var xValues = ['0x0', '0x1', '0x2', '0xFEDCBA9876543210', '0xFEDCBA9876543210FEDCBA9876543210']
      var yzValues = [
        ['0x0', '0x0'],
        ['0x1', '0x0'],
        ['0x0', '0x1'],
        ['0x1', '0x1'],
        ['0x2', '0x1'],
        ['0x3', '0x1'],
        ['0x7F', '0x1'],
        ['0xFEDCBA987', '0x1'],
        ['0xFEDCBA9876543210FEDCBA9876543210', '0x1'],
        ['0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', '0x1'],
        ['0x1', '0x2'],
        ['0x1', '0x3'],
        ['0x1', '0x7F'],
        ['0x1', '0xFEDCBA9876543210'],
        ['0x1', '0xFEDCBA9876543210FEDCBA9876543210'],
        ['0x1', '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'],
      ]

      for (var i = 0; i < xValues.length; i++) {
        var xValue = xValues[i]
        for (var j = 0; j < yzValues.length; j++) {
          var yValue = yzValues[j][0]
          var zValue = yzValues[j][1]
          // console.log('    pow (' + xValue + ', ' + yValue + ', ' + zValue + ')')
          var x = BigNumber.from(xValue)
          var y = BigNumber.from(yValue)
          var z = BigNumber.from(zValue)
          var result
          try {
            result = await yieldMath.pow(x, y, z)
          } catch (e) {
            result = [false, undefined]
          }

          if (!z.eq(BigNumber.from('0x0')) && (!x.eq(BigNumber.from('0x0')) || !y.eq(BigNumber.from('0x0')))) {
            assert('pow (' + xValue + ', ' + yValue + ', ' + zValue + ')[0]', result[0] as boolean)
            var expectedLog =
              (Math.log(Number(x)) * Number(y)) / Number(z) + 128 * (1.0 - Number(y) / Number(z)) * Math.LN2
            if (expectedLog < 0.0) expectedLog = -1.0
            if (x.eq(BigNumber.from('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'))) expectedLog = 128 * Math.LN2
            var resultLog = Math.log(Number(result[1]))
            if (resultLog < 0.0) resultLog = -1.0
            assert(
              'pow (' + xValue + ', ' + yValue + ', ' + zValue + ')[1]',
              Math.abs(expectedLog - resultLog) <= 0.000000001
            )
          } else {
            assert('!pow (' + xValue + ', ' + yValue + ', ' + zValue + ')[0]', !result[0])
          }
        }
      }
    })
  })
})
