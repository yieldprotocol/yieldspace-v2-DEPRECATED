import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants, id } from '@yield-protocol/utils-v2'
const { WAD, MAX128 } = constants
const MAX = MAX128

import { PoolEstimator } from './shared/poolEstimator'
import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'
import { fyDaiForMint } from '../src/yieldspace'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('Pool - mintWithBase', async function () {
  this.timeout(0)

  const initialBase = BigNumber.from(0)
  const OVERRIDES = { gasLimit: 1_000_000 }

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string

  let yieldSpace: YieldSpaceEnvironment
  let poolEstimator: PoolEstimator
  let pool: Pool
  let base: Base
  let fyToken: FYToken
  let maturity: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId

  const poolSupplies = [
    BigNumber.from('10000000000000000000'),
    // BigNumber.from('1000000000000000000000'),
    // BigNumber.from('100000000000000000000000'),
    // BigNumber.from('10000000000000000000000000'),
    // BigNumber.from('1000000000000000000000000000'),
  ]
  const baseReserves = [
    // Multiplier on the supply
    BigNumber.from('1'),
    BigNumber.from('10'),
    BigNumber.from('100'),
  ]
  const fyTokenVirtualReservesDeltas = [
    // Multiplier on the supply
    BigNumber.from('1'),
    BigNumber.from('10'),
    BigNumber.from('100'),
  ]
  const tradeSizes = [
    // Divisor on the reserves delta
    BigNumber.from('1'),
    BigNumber.from('2'),
    BigNumber.from('10'),
    BigNumber.from('100'),
  ]
  const timesTillMaturity = [30, 30000, 30000000]

  const scaleFactor = BigNumber.from('1')

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId])
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    base = yieldSpace.bases.get(baseId) as Base
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    pool = ((yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool).connect(user1Acc)
    poolEstimator = await PoolEstimator.setup(pool)
    maturity = BigNumber.from(await pool.maturity())
  })

  it('mintWithBase', async () => {
    for (var poolSupply of poolSupplies) {
      for (var baseReserveMultiplier of baseReserves) {
        for (var fyTokenVirtualReservesDeltaMultiplier of fyTokenVirtualReservesDeltas) {
          for (var tradeSizeDivisor of tradeSizes) {
            for (var timeTillMaturity of timesTillMaturity) {
              const snapshotId = await ethers.provider.send('evm_snapshot', [])
              await ethers.provider.send('evm_mine', [maturity.toNumber() - timeTillMaturity])

              const baseReserve = baseReserveMultiplier.mul(poolSupply)
              const reservesDelta = fyTokenVirtualReservesDeltaMultiplier.mul(poolSupply)
              const fyTokenVirtualReserve = reservesDelta.add(baseReserve)
              const fyTokenRealReserve = fyTokenVirtualReserve.sub(poolSupply)
              const trade = reservesDelta.div(tradeSizeDivisor)

              // Initialize to supply
              await base.mint(pool.address, poolSupply)
              await pool.connect(ownerAcc).init(owner)

              // Donate to reserves
              const baseDonation = baseReserve.sub(poolSupply)
              await base.mint(pool.address, baseDonation)
              await fyToken.mint(pool.address, fyTokenRealReserve)
              await pool.sync()

              let fyTokenToBuy: BigNumber
              try {
                fyTokenToBuy = BigNumber.from(
                  fyDaiForMint(
                    baseReserve,
                    fyTokenRealReserve,
                    fyTokenVirtualReserve,
                    trade,
                    BigNumber.from(timeTillMaturity)
                  )
                )
              } catch (e) {
                // A number of trades will revert, in very unusual conditions such as very unbalanced trades, or seconds to maturity. That's fine.
                /* console.log(`
                  Aborted trade:
                  supply:           ${await pool.totalSupply()}
                  baseReserves:     ${await pool.getBaseBalance()}
                  fyTokenReserves:  ${await fyToken.balanceOf(pool.address)}
                  fyTokenVirtual:   ${await pool.getFYTokenBalance()}
                  trade:            ${trade}
                  timeTillMaturity: ${timeTillMaturity}
                `) */
                await ethers.provider.send('evm_revert', [snapshotId])
                continue
              }
              /* console.log(`
                supply:           ${await pool.totalSupply()}
                baseReserves:     ${await pool.getBaseBalance()}
                fyTokenReserves:  ${await fyToken.balanceOf(pool.address)}
                fyTokenVirtual:   ${await pool.getFYTokenBalance()}
                trade:            ${trade}
                timeTillMaturity: ${timeTillMaturity}
                fyTokenToBuy:     ${fyTokenToBuy.toString()}
                baseSold (off):   ${await poolEstimator.buyFYToken(fyTokenToBuy)}
                baseUsed:         ${(await poolEstimator.mintWithBase(fyTokenToBuy))[1]}
              `) */

              await base.mint(pool.address, trade)
              /* console.log(`
                baseSold (on):    ${await pool.buyFYTokenPreview(fyTokenToBuy)}
              `) */
              const result = await pool.callStatic.mintWithBase(owner, owner, fyTokenToBuy, 0, MAX, OVERRIDES)
              /* console.log(`
                baseIn:           ${result[0]}
                surplus:          ${trade.sub(result[0])}
              `) */
              // TODO: Verify that the surplus is below a 0.005% of the trade (fyDaiForMint targets 0.001% to 0.002%)

              await ethers.provider.send('evm_revert', [snapshotId])
            }
          }
        }
      }
    }
  })
})
