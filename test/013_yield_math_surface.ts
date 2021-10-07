import { debugLog } from './shared/helpers'

import { YieldMathWrapper } from '../typechain/YieldMathWrapper'
import { YieldMath } from '../typechain/YieldMath'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect } from 'chai'

import { ts, g1, g2 } from '../src/constants'

import { sellBase, sellFYToken, buyBase, buyFYToken } from '../src/yieldspace'

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('YieldMath - Surface', async function () {
  this.timeout(0)
  let yieldMathLibrary: YieldMath
  let yieldMath: YieldMathWrapper

  const baseBalances = [
    // BigNumber.from('100000000000000000000000'),
    // BigNumber.from('1000000000000000000000000'),
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('100000000000000000000000000'),
    BigNumber.from('1000000000000000000000000000'),
  ]
  const fyTokenBalanceDeltas = [
    // BigNumber.from('10000000000000000000'),
    // BigNumber.from('1000000000000000000000'),
    BigNumber.from('100000000000000000000000'),
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('1000000000000000000000000000'),
  ]
  const tradeSizes = [
    // BigNumber.from('1000000000000000000'),
    // BigNumber.from('10000000000000000000'),
    BigNumber.from('100000000000000000000'),
    BigNumber.from('1000000000000000000000'),
    BigNumber.from('10000000000000000000000'),
  ]
  const timesTillMaturity = [
    // BigNumber.from('4'),
    // BigNumber.from('40'),
    BigNumber.from('4000'),
    BigNumber.from('400000'),
    BigNumber.from('40000000'),
  ]

  const scaleFactor = BigNumber.from('1')

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

  describe('Test scenarios', async () => {
    it('Compare a lattice of on-chain vs off-chain yieldspace trades', async function () {
      this.timeout(0)

      for (var baseBalance of baseBalances) {
        for (var fyTokenBalanceDelta of fyTokenBalanceDeltas) {
          for (var tradeSize of tradeSizes) {
            for (var timeTillMaturity of timesTillMaturity) {
              debugLog(`baseBalance, fyTokenBalanceDelta, tradeSize, timeTillMaturity`)
              debugLog(`${baseBalance}, ${fyTokenBalanceDelta}, ${tradeSize}, ${timeTillMaturity}`)
              const fyTokenBalance = baseBalance.add(fyTokenBalanceDelta)
              let offChain, onChain
              offChain = sellFYToken(baseBalance, fyTokenBalance, tradeSize, timeTillMaturity, scaleFactor)
              onChain = await yieldMath.baseOutForFYTokenIn(
                baseBalance,
                fyTokenBalance,
                tradeSize,
                timeTillMaturity,
                ts,
                g2
              )
              debugLog(`offChain sellFYToken: ${offChain}`)
              debugLog(`onChain sellFYToken: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = sellBase(baseBalance, fyTokenBalance, tradeSize, timeTillMaturity, scaleFactor)
              onChain = await yieldMath.fyTokenOutForBaseIn(
                baseBalance,
                fyTokenBalance,
                tradeSize,
                timeTillMaturity,
                ts,
                g1
              )
              debugLog(`offChain sellBase: ${offChain}`)
              debugLog(`onChain sellBase: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = buyBase(baseBalance, fyTokenBalance, tradeSize, timeTillMaturity, scaleFactor)
              onChain = await yieldMath.fyTokenInForBaseOut(
                baseBalance,
                fyTokenBalance,
                tradeSize,
                timeTillMaturity,
                ts,
                g2
              )
              debugLog(`offChain buyBase: ${offChain}`)
              debugLog(`onChain buyBase: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              offChain = buyFYToken(baseBalance, fyTokenBalance, tradeSize, timeTillMaturity, scaleFactor)
              onChain = await yieldMath.baseInForFYTokenOut(
                baseBalance,
                fyTokenBalance,
                tradeSize,
                timeTillMaturity,
                ts,
                g1
              )
              debugLog(`offChain buyFYToken: ${offChain}`)
              debugLog(`onChain buyFYToken: ${onChain}`)
              almostEqual(onChain, offChain, PRECISION)

              debugLog()
            }
          }
        }
      }
    })
  })
})
