import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { MAX128, USDC } = constants
const MAX = MAX128

import { PoolEstimator } from './shared/poolEstimator'
import { Pool } from '../typechain'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

const ZERO_ADDRESS = '0x' + '00'.repeat(20)

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('Pool - usdc', async function () {
  this.timeout(0)

  const oneUSDC = BigNumber.from(1000000)
  const bases = oneUSDC.mul(1000000)
  const fyTokens = bases
  const initialBase = bases
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
    await pool.connect(user1Acc).mint(user1, user1, 0, MAX)
  })

  it('sells fyToken', async () => {
    const fyTokenIn = oneUSDC
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
    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  it('buys base', async () => {
    const fyTokenCachedBefore = (await pool.getCache())[1]
    const baseOut = oneUSDC
    const baseBefore = await base.balanceOf(user2)

    const fyTokenInPreview = await pool.connect(user1Acc).buyBasePreview(baseOut)
    const expectedFYTokenIn = await poolEstimator.buyBase(baseOut)

    await fyToken.mint(pool.address, fyTokenInPreview)

    await expect(pool.connect(user1Acc).buyBase(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getCache())[1].sub(fyTokenCachedBefore).mul(-1))

    const fyTokenCachedCurrent = (await pool.getCache())[1]
    const fyTokenIn = fyTokenCachedCurrent.sub(fyTokenCachedBefore)
    const fyTokenChange = (await pool.getFYTokenBalance()).sub(fyTokenCachedCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseOut.add(baseBefore), 'Receiver account should have 1 base token')

    almostEqual(fyTokenIn, expectedFYTokenIn, BigNumber.from(1))

    almostEqual(fyTokenInPreview, expectedFYTokenIn, BigNumber.from(1))
    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenBalance())
  })

  describe('with extra fyToken balance', () => {
    beforeEach(async () => {
      const additionalFYTokenBalance = oneUSDC.mul(30)
      await fyToken.mint(pool.address, additionalFYTokenBalance)
      await pool.sellFYToken(owner, 0)
    })

    it('mints liquidity tokens', async () => {
      const fyTokenIn = oneUSDC
      const [expectedMinted, expectedBaseIn] = await poolEstimator.mint(fyTokenIn)
      const poolTokensBefore = await pool.balanceOf(user2)

      await base.mint(pool.address, expectedBaseIn.add(oneUSDC))
      await fyToken.mint(pool.address, fyTokenIn)
      await expect(pool.connect(user1Acc).mint(user2, user2, 0, MAX))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          ZERO_ADDRESS,
          expectedBaseIn.sub(1).mul(-1),
          fyTokenIn.mul(-1),
          expectedMinted
        )

      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, fyTokenIn.div(10000))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('burns liquidity tokens', async () => {
      const baseBalance = await base.balanceOf(pool.address)
      const fyTokenBalance = await fyToken.balanceOf(pool.address)
      const lpTokensIn = oneUSDC

      const [expectedBaseOut, expectedFYTokenOut] = await poolEstimator.burn(lpTokensIn)

      await pool.connect(user1Acc).transfer(pool.address, lpTokensIn)
      await expect(pool.connect(user1Acc).burn(user2, user2, 0, MAX))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          user2,
          baseBalance.sub(await base.balanceOf(pool.address)),
          fyTokenBalance.sub(await fyToken.balanceOf(pool.address)),
          lpTokensIn.mul(-1)
        )

      const baseOut = baseBalance.sub(await base.balanceOf(pool.address))
      const fyTokenOut = fyTokenBalance.sub(await fyToken.balanceOf(pool.address))

      almostEqual(baseOut, expectedBaseOut, BigNumber.from(1))
      almostEqual(fyTokenOut, expectedFYTokenOut, BigNumber.from(1))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('sells base', async () => {
      const baseIn = oneUSDC
      const userFYTokenBefore = await fyToken.balanceOf(user2)

      await base.mint(pool.address, baseIn)

      const fyTokenOutPreview = await pool.sellBasePreview(baseIn)
      const expectedFYTokenOut = await poolEstimator.sellBase()

      await expect(pool.connect(user1Acc).sellBase(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

      const fyTokenOut = (await fyToken.balanceOf(user2)).sub(userFYTokenBefore)

      almostEqual(fyTokenOut, expectedFYTokenOut, BigNumber.from(1))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, BigNumber.from(1))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('buys fyToken', async () => {
      const baseCachedBefore = (await pool.getCache())[0]
      const fyTokenOut = oneUSDC
      const userFYTokenBefore = await fyToken.balanceOf(user2)

      const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut)
      const expectedBaseIn = await poolEstimator.buyFYToken(fyTokenOut)

      await base.mint(pool.address, baseInPreview)

      await expect(pool.connect(user1Acc).buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, (await pool.getCache())[0].sub(baseCachedBefore).mul(-1), fyTokenOut)

      const baseCachedCurrent = (await pool.getCache())[0]
      const baseIn = baseCachedCurrent.sub(baseCachedBefore)
      const baseChange = (await pool.getBaseBalance()).sub(baseCachedCurrent)

      expect(await fyToken.balanceOf(user2)).to.equal(
        fyTokenOut.add(userFYTokenBefore),
        "'User2' wallet should have 1 fyToken token"
      )

      almostEqual(baseIn, expectedBaseIn, BigNumber.from(1))
      almostEqual(baseInPreview, expectedBaseIn, BigNumber.from(1))
      expect((await pool.getCache())[0].add(baseChange)).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })
  })
})
