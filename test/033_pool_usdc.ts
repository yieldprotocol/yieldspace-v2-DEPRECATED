import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX128, USDC } = constants
const MAX = MAX128

import { CALCULATE_FROM_BASE } from '../src/constants'

import { PoolEstimator } from './shared/poolEstimator'
import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('Pool - usdc', async function () {
  this.timeout(0)

  const baseTokens = WAD.mul(1000000)
  const fyTokens = baseTokens
  const initialBase = baseTokens
  const OVERRIDES = { gasLimit: 1_000_000 }

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string

  let yieldSpace: YieldSpaceEnvironment

  let pool: Pool
  let poolEstimator: PoolEstimator

  let base: Base
  let fyToken: FYToken
  let maturity: BigNumber

  const baseId = USDC
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [], [maturityId], BigNumber.from('0'))
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
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolEstimator = await PoolEstimator.setup(pool)
    maturity = BigNumber.from(await fyToken.maturity())

    await base.mint(pool.address, initialBase)
    await pool.connect(user1Acc).mint(user1, CALCULATE_FROM_BASE, 0)
  })

  it('sells fyToken', async () => {
    const fyTokenIn = WAD
    const baseBefore = await base.balanceOf(user2)

    await fyToken.mint(pool.address, fyTokenIn)

    const baseOutPreview = await pool.connect(user1Acc).sellFYTokenPreview(fyTokenIn)
    const expectedBaseOut = await poolEstimator.sellFYToken()

    await expect(pool.connect(user1Acc).sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

    expect(await fyToken.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyToken tokens")

    const baseOut = (await base.balanceOf(user2)).sub(baseBefore)

    almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
    almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('buys base', async () => {
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]
    const baseOut = WAD
    const baseBefore = await base.balanceOf(user2)

    const fyTokenInPreview = await pool.connect(user1Acc).buyBaseTokenPreview(baseOut)
    const expectedFYTokenIn = await poolEstimator.buyBaseToken(baseOut)

    await fyToken.mint(pool.address, fyTokens)

    await expect(pool.connect(user1Acc).buyBaseToken(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getStoredReserves())[1].sub(fyTokenStoredBefore).mul(-1))

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseOut.add(baseBefore), 'Receiver account should have 1 base token')

    almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))

    almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())
  })

  describe('with extra fyToken reserves', () => {
    beforeEach(async () => {
      const additionalFYTokenReserves = WAD.mul(30)
      await fyToken.mint(pool.address, additionalFYTokenReserves)
      await pool.sellFYToken(owner, 0)
    })

    it('mints liquidity tokens', async () => {
      const fyTokenStoredReservesBefore = (await pool.getStoredReserves())[1]
      const baseIn = WAD

      let [expectedMinted, expectedFYTokenIn] = await poolEstimator.mint(baseIn, CALCULATE_FROM_BASE)

      await base.mint(pool.address, baseIn)
      await fyToken.mint(pool.address, fyTokens)

      const poolTokensBefore = await pool.balanceOf(user2)

      await expect(pool.connect(user1Acc).mint(user2, CALCULATE_FROM_BASE, 0))
        .to.emit(pool, 'Liquidity')
        .withArgs(maturity, user1, user2, WAD.mul(-1), expectedFYTokenIn.mul(-1), expectedMinted) // TODO: Rounding

      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, baseIn.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(
        fyTokenStoredReservesBefore.add(expectedFYTokenIn).add(expectedMinted)
      )
    })

    it('burns liquidity tokens', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReserves = await fyToken.balanceOf(pool.address)
      const lpTokensIn = WAD

      const [expectedBaseOut, expectedFYTokenOut] = await poolEstimator.burn(lpTokensIn)

      await pool.connect(user1Acc).transfer(pool.address, lpTokensIn)
      await expect(pool.connect(user1Acc).burn(user2, 0, 0))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          baseReserves.sub(await base.balanceOf(pool.address)),
          fyTokenReserves.sub(await fyToken.balanceOf(pool.address)),
          lpTokensIn.mul(-1)
        )

      const baseOut = baseReserves.sub(await base.balanceOf(pool.address))
      const fyTokenOut = fyTokenReserves.sub(await fyToken.balanceOf(pool.address))

      almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
      almostEqual(fyTokenOut, expectedFYTokenOut, fyTokenOut.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('sells base', async () => {
      const baseIn = WAD
      const fyTokenBalanceBefore = await fyToken.balanceOf(user2)

      await base.mint(pool.address, baseIn)

      const fyTokenOutPreview = await pool.sellBaseTokenPreview(baseIn)
      const expectedFYTokenOut = await poolEstimator.sellBaseToken()

      await expect(pool.connect(user1Acc).sellBaseToken(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

      const fyTokenOut = (await fyToken.balanceOf(user2)).sub(fyTokenBalanceBefore)

      almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('buys fyToken', async () => {
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]
      const fyTokenOut = WAD
      const fyTokenBalanceBefore = await fyToken.balanceOf(user2)

      const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut)
      const expectedBaseIn = await poolEstimator.buyFYToken(fyTokenOut)

      await base.mint(pool.address, baseTokens)

      await expect(pool.connect(user1Acc).buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity,
          user1,
          user2,
          (await pool.getStoredReserves())[0].sub(baseTokenStoredBefore).mul(-1),
          fyTokenOut
        )

      const baseTokenStoredCurrent = (await pool.getStoredReserves())[0]
      const baseTokenIn = baseTokenStoredCurrent.sub(baseTokenStoredBefore)
      const baseTokenChange = (await pool.getBaseTokenReserves()).sub(baseTokenStoredCurrent)

      expect(await fyToken.balanceOf(user2)).to.equal(
        fyTokenOut.add(fyTokenBalanceBefore),
        "'User2' wallet should have 1 fyToken token"
      )

      almostEqual(baseTokenIn, expectedBaseIn, baseTokenIn.div(1000000))
      almostEqual(baseInPreview, expectedBaseIn, baseTokenIn.div(1000000))
      expect((await pool.getStoredReserves())[0].add(baseTokenChange)).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })
  })
})
