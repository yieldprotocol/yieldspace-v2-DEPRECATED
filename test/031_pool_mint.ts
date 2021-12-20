import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX256 } = constants
const MAX = MAX256

import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { PoolEstimator } from './shared/poolEstimator'
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

describe('Pool - mint', async function () {
  this.timeout(0)

  // These values impact the pool results
  const bases = WAD.mul(1000000)
  const fyTokens = bases
  const initialBase = bases
  const OVERRIDES = { gasLimit: 1_000_000 }

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let user3Acc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string
  let user3: string

  let yieldSpace: YieldSpaceEnvironment

  let pool: Pool
  let poolEstimator: PoolEstimator

  let base: Base
  let fyToken: FYToken
  let maturity: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId], BigNumber.from('0'))
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
    user3Acc = signers[3]
    user3 = user3Acc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    base = yieldSpace.bases.get(baseId) as Base
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken

    // Deploy a fresh pool so that we can test initialization
    pool = ((yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool).connect(user1Acc)
    poolEstimator = await PoolEstimator.setup(pool)

    maturity = BigNumber.from(await fyToken.maturity())
  })

  it('adds initial liquidity', async () => {
    await base.mint(pool.address, initialBase)

    await expect(pool.mint(user2, user2, 0, MAX))
      .to.emit(pool, 'Liquidity')
      .withArgs(maturity, user1, user2, ZERO_ADDRESS, initialBase.mul(-1), 0, initialBase)

    expect(await pool.balanceOf(user2)).to.equal(initialBase, 'User2 should have ' + initialBase + ' liquidity tokens')

    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  it('adds liquidity with zero fyToken', async () => {
    await base.mint(pool.address, initialBase)
    await pool.mint(ZERO_ADDRESS, ZERO_ADDRESS, 0, MAX)

    // After initializing, donate base and sync to simulate having reached zero fyToken through trading
    await base.mint(pool.address, initialBase)
    await pool.sync()

    await base.mint(pool.address, initialBase)
    await expect(pool.mint(user2, user2, 0, MAX))
      .to.emit(pool, 'Liquidity')
      .withArgs(maturity, user1, user2, ZERO_ADDRESS, initialBase.mul(-1), 0, initialBase.div(2))

    // The user got as minted tokens half of the amount he supplied as base, because supply doesn't equal base in the pool anymore
    expect(await pool.balanceOf(user2)).to.equal(
      initialBase.div(2),
      'User2 should have ' + initialBase.div(2) + ' liquidity tokens'
    )

    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  it('syncs balances after donations', async () => {
    await base.mint(pool.address, initialBase)
    await fyToken.mint(pool.address, initialBase.div(9))

    await expect(pool.sync()).to.emit(pool, 'Sync')

    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await base.mint(pool.address, initialBase)
      await pool.mint(user1, user2, 0, MAX)

      const additionalFYToken = initialBase.div(9)
      // Skew the balances without using trading functions
      await fyToken.mint(pool.address, additionalFYToken)
      await pool.sync()
    })

    it('mints liquidity tokens, returning base surplus', async () => {
      const fyTokenIn = WAD

      const [expectedMinted, expectedBaseIn] = await poolEstimator.mint(fyTokenIn)

      const baseTokensBefore = await base.balanceOf(user2)
      const poolTokensBefore = await pool.balanceOf(user2)

      await base.mint(pool.address, expectedBaseIn.add(WAD))
      await fyToken.mint(pool.address, fyTokenIn)
      await expect(pool.mint(user2, user2, 0, MAX))
        .to.emit(pool, 'Liquidity')
        .withArgs(maturity, user1, user2, ZERO_ADDRESS, expectedBaseIn.mul(-1), fyTokenIn.mul(-1), expectedMinted)

      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, fyTokenIn.div(10000))
      almostEqual(await base.balanceOf(user2), WAD, fyTokenIn.div(10000))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('mints liquidity tokens with base only', async () => {
      const fyTokenToBuy = WAD.div(1000)

      const [expectedMinted, expectedBaseIn] = await poolEstimator.mintWithBase(fyTokenToBuy)

      const poolTokensBefore = await pool.balanceOf(user2)
      const poolSupplyBefore = await pool.totalSupply()
      const baseCachedBefore = (await pool.getCache())[0]
      const fyTokenCachedBefore = (await pool.getCache())[1]

      await base.mint(pool.address, expectedBaseIn)

      await expect(pool.mintWithBase(user2, user2, fyTokenToBuy, 0, MAX, OVERRIDES))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          ZERO_ADDRESS,
          (await pool.getCache())[0].sub(baseCachedBefore).mul(-1),
          0,
          (await pool.totalSupply()).sub(poolSupplyBefore)
        )
        .to.emit(base, 'Transfer')
        .withArgs(pool.address, user2, await base.balanceOf(user2)) // Surplus base is given to the receiver of LP tokens

      const baseIn = (await pool.getCache())[0].sub(baseCachedBefore)
      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, minted.div(10000))

      almostEqual(baseIn, expectedBaseIn, baseIn.div(10000))
      expect((await pool.getCache())[0]).to.equal(baseCachedBefore.add(baseIn))
      expect((await pool.getCache())[1]).to.equal(fyTokenCachedBefore.add(minted))
    })

    it("doesn't mint if ratio drops", async () => {
      const fyTokenToBuy = WAD.div(1000)
      await base.mint(pool.address, WAD)
      const minRatio = WAD.mul(await base.balanceOf(pool.address)).div(await fyToken.balanceOf(pool.address))
      await fyToken.mint(pool.address, WAD)
      await pool.sync()
      await expect(pool.mintWithBase(user2, user2, fyTokenToBuy, minRatio, MAX, OVERRIDES)).to.be.revertedWith(
        'Pool: Reserves ratio changed'
      )
    })

    it("doesn't mint if ratio rises", async () => {
      const fyTokenToBuy = WAD.div(1000)
      await base.mint(pool.address, WAD)
      const maxRatio = WAD.mul(await base.balanceOf(pool.address)).div(await fyToken.balanceOf(pool.address))
      await base.mint(pool.address, WAD)
      await pool.sync()
      await expect(pool.mintWithBase(user2, user2, fyTokenToBuy, 0, maxRatio, OVERRIDES)).to.be.revertedWith(
        'Pool: Reserves ratio changed'
      )
    })

    it('burns liquidity tokens', async () => {
      const baseBalance = await base.balanceOf(pool.address)
      const fyTokenBalance = await fyToken.balanceOf(pool.address)
      const lpTokensIn = WAD

      const [expectedBaseOut, expectedFYTokenOut] = await poolEstimator.burn(lpTokensIn)

      await pool.transfer(pool.address, lpTokensIn)
      await expect(pool.burn(user2, user3, 0, MAX))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          user3,
          baseBalance.sub(await base.balanceOf(pool.address)),
          fyTokenBalance.sub(await fyToken.balanceOf(pool.address)),
          lpTokensIn.mul(-1)
        )

      const baseOut = baseBalance.sub(await base.balanceOf(pool.address))
      const fyTokenOut = fyTokenBalance.sub(await fyToken.balanceOf(pool.address))

      almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
      almostEqual(fyTokenOut, expectedFYTokenOut, fyTokenOut.div(10000))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())

      expect(await base.balanceOf(user2)).to.equal(baseOut)
      expect(await fyToken.balanceOf(user3)).to.equal(fyTokenOut)
    })

    it('burns liquidity tokens to Base', async () => {
      const baseBalance = await base.balanceOf(pool.address)
      const lpTokensIn = WAD.mul(2)

      const expectedBaseOut = await poolEstimator.burnForBase(lpTokensIn)

      await pool.transfer(pool.address, lpTokensIn)
      await expect(pool.burnForBase(user2, 0, MAX, OVERRIDES))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          ZERO_ADDRESS,
          baseBalance.sub(await base.balanceOf(pool.address)),
          0,
          lpTokensIn.mul(-1)
        )

      const baseOut = baseBalance.sub(await base.balanceOf(pool.address))

      almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it("doesn't burn if ratio drops", async () => {
      const lpTokensIn = WAD.mul(2)
      await pool.transfer(pool.address, lpTokensIn)
      const minRatio = WAD.mul(await base.balanceOf(pool.address)).div(await fyToken.balanceOf(pool.address))
      await fyToken.mint(pool.address, WAD)
      await pool.sync()
      await expect(pool.burnForBase(user2, minRatio, MAX, OVERRIDES)).to.be.revertedWith('Pool: Reserves ratio changed')
    })

    it("doesn't burn if ratio rises", async () => {
      const lpTokensIn = WAD.mul(2)
      await pool.transfer(pool.address, lpTokensIn)
      const maxRatio = WAD.mul(await base.balanceOf(pool.address)).div(await fyToken.balanceOf(pool.address))
      await base.mint(pool.address, WAD)
      await pool.sync()
      await expect(pool.burnForBase(user2, 0, maxRatio, OVERRIDES)).to.be.revertedWith('Pool: Reserves ratio changed')
    })
  })
})
