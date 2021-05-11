import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX128 } = constants
const MAX = MAX128

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

describe('Pool - trade', async function () {
  this.timeout(0)

  const bases = WAD.mul(1000000)
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
  let poolEstimator: PoolEstimator
  let pool: Pool
  let base: Base
  let fyToken: FYToken
  let maturity: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId], initialBase)
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

  it('sells fyToken', async () => {
    const fyTokenIn = WAD
    const userBaseBefore = await base.balanceOf(user2)

    // Transfer fyToken for sale to the pool
    await fyToken.mint(pool.address, fyTokenIn)

    const baseOutPreview = await pool.sellFYTokenPreview(fyTokenIn)
    const expectedBaseOut = await poolEstimator.sellFYToken()

    await expect(pool.sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

    const baseOut = (await base.balanceOf(user2)).sub(userBaseBefore)

    almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
    almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  it('does not sell fyToken beyond slippage', async () => {
    const fyTokenIn = WAD

    await fyToken.mint(pool.address, fyTokenIn)
    await expect(pool.sellFYToken(user2, MAX, OVERRIDES)).to.be.revertedWith('Pool: Not enough base obtained')
  })

  it('donates base and sells fyToken', async () => {
    const baseDonation = WAD
    const fyTokenIn = WAD

    await base.mint(pool.address, baseDonation)
    await fyToken.mint(pool.address, fyTokenIn)

    await pool.sellFYToken(user2, 0)

    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
  })

  it('buys base', async () => {
    const fyTokenCachedBefore = (await pool.getCache())[1]
    const userBaseBefore = await base.balanceOf(user2)
    const baseOut = WAD

    const fyTokenInPreview = await pool.buyBasePreview(baseOut)
    const expectedFYTokenIn = await poolEstimator.buyBase(baseOut)

    await fyToken.mint(pool.address, fyTokens)

    await expect(pool.buyBase(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getCache())[1].sub(fyTokenCachedBefore).mul(-1))

    const fyTokenCachedCurrent = (await pool.getCache())[1]
    const fyTokenIn = fyTokenCachedCurrent.sub(fyTokenCachedBefore)
    const fyTokenChange = (await pool.getFYTokenBalance()).sub(fyTokenCachedCurrent)

    expect(await base.balanceOf(user2)).to.equal(
      userBaseBefore.add(baseOut),
      'Receiver account should have 1 base token'
    )

    almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))
    almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenBalance())
  })

  it('does not buy base beyond slippage', async () => {
    const baseOut = WAD

    await fyToken.mint(pool.address, fyTokens)
    await expect(pool.buyBase(user2, baseOut, 0, OVERRIDES)).to.be.revertedWith('Pool: Too much fyToken in')
  })

  it('buys base and retrieves change', async () => {
    const userBaseBefore = await base.balanceOf(user2)
    const baseOut = WAD

    const expectedFYTokenIn = await poolEstimator.buyBase(baseOut)

    await fyToken.mint(pool.address, fyTokens)

    await pool.buyBase(user2, baseOut, MAX, OVERRIDES)

    const fyTokenCachedCurrent = (await pool.getCache())[1]
    const fyTokenChange = (await pool.getFYTokenBalance()).sub(fyTokenCachedCurrent)

    expect(await base.balanceOf(user2)).to.equal(
      userBaseBefore.add(baseOut),
      'Receiver account should have 1 base token'
    )
    almostEqual(fyTokenChange, fyTokens.sub(expectedFYTokenIn), baseOut.div(1000000))

    expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
    expect((await pool.getCache())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenBalance())

    await expect(pool.retrieveFYToken(user1)).to.emit(fyToken, 'Transfer').withArgs(pool.address, user1, fyTokenChange)

    expect(await fyToken.balanceOf(user1)).to.equal(fyTokenChange)
  })

  it('donates fyToken and buys base', async () => {
    const baseBalances = await pool.getBaseBalance()
    const fyTokenBalances = await pool.getFYTokenBalance()
    const fyTokenCachedBefore = (await pool.getCache())[1]

    const baseOut = WAD
    const fyTokenDonation = WAD

    await fyToken.mint(pool.address, fyTokens.add(fyTokenDonation))

    await pool.buyBase(user2, baseOut, MAX, OVERRIDES)

    const fyTokenCachedCurrent = (await pool.getCache())[1]
    const fyTokenIn = fyTokenCachedCurrent.sub(fyTokenCachedBefore)

    expect((await pool.getCache())[0]).to.equal(baseBalances.sub(baseOut))
    expect((await pool.getCache())[1]).to.equal(fyTokenBalances.add(fyTokenIn))
  })

  describe('with extra fyToken', () => {
    beforeEach(async () => {
      const additionalFYToken = WAD.mul(30)
      await fyToken.mint(owner, additionalFYToken)
      await fyToken.transfer(pool.address, additionalFYToken)
      await pool.sellFYToken(owner, 0)
    })

    it('sells base', async () => {
      const baseIn = WAD
      const userFYTokenBefore = await fyToken.balanceOf(user2)

      // Transfer base for sale to the pool
      await base.mint(pool.address, baseIn)

      const fyTokenOutPreview = await pool.sellBasePreview(baseIn)
      const expectedFYTokenOut = await poolEstimator.sellBase()

      await expect(pool.sellBase(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

      const fyTokenOut = (await fyToken.balanceOf(user2)).sub(userFYTokenBefore)

      expect(await base.balanceOf(user1)).to.equal(0, "'From' wallet should have no base tokens")

      almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('does not sell base beyond slippage', async () => {
      const baseIn = WAD

      await base.mint(pool.address, baseIn)
      await expect(pool.sellBase(user2, MAX, OVERRIDES)).to.be.revertedWith('Pool: Not enough fyToken obtained')
    })

    it('donates fyToken and sells base', async () => {
      const baseIn = WAD
      const fyTokenDonation = WAD

      await fyToken.mint(pool.address, fyTokenDonation)
      await base.mint(pool.address, baseIn)

      await pool.sellBase(user2, 0, OVERRIDES)

      expect((await pool.getCache())[0]).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('buys fyToken', async () => {
      const baseCachedBefore = (await pool.getCache())[0]
      const userFYTokenBefore = await fyToken.balanceOf(user2)
      const fyTokenOut = WAD

      const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut)
      const expectedBaseIn = await poolEstimator.buyFYToken(fyTokenOut)

      await base.mint(pool.address, bases)

      await expect(pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, (await pool.getCache())[0].sub(baseCachedBefore).mul(-1), fyTokenOut)

      const baseCachedCurrent = (await pool.getCache())[0]
      const baseIn = baseCachedCurrent.sub(baseCachedBefore)
      const baseChange = (await pool.getBaseBalance()).sub(baseCachedCurrent)

      expect(await fyToken.balanceOf(user2)).to.equal(
        userFYTokenBefore.add(fyTokenOut),
        "'User2' wallet should have 1 fyToken token"
      )

      almostEqual(baseIn, expectedBaseIn, baseIn.div(1000000))
      almostEqual(baseInPreview, expectedBaseIn, baseIn.div(1000000))
      expect((await pool.getCache())[0].add(baseChange)).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())
    })

    it('does not buy fyToken beyond slippage', async () => {
      const fyTokenOut = WAD

      await base.mint(pool.address, bases)
      await expect(pool.buyFYToken(user2, fyTokenOut, 0, OVERRIDES)).to.be.revertedWith('Pool: Too much base token in')
    })

    it('buys fyToken and retrieves change', async () => {
      const fyTokenOut = WAD

      await base.mint(pool.address, bases)

      await pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES)

      const baseCachedCurrent = (await pool.getCache())[0]
      const baseChange = (await pool.getBaseBalance()).sub(baseCachedCurrent)

      expect((await pool.getCache())[0].add(baseChange)).to.equal(await pool.getBaseBalance())
      expect((await pool.getCache())[1]).to.equal(await pool.getFYTokenBalance())

      await expect(pool.retrieveBase(user1)).to.emit(base, 'Transfer').withArgs(pool.address, user1, baseChange)

      expect(await base.balanceOf(user1)).to.equal(baseChange)
    })

    it('donates base and buys fyToken', async () => {
      const baseBalances = await pool.getBaseBalance()
      const fyTokenBalances = await pool.getFYTokenBalance()
      const baseCachedBefore = (await pool.getCache())[0]

      const fyTokenOut = WAD
      const baseDonation = WAD

      await base.mint(pool.address, bases.add(baseDonation))

      await pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES)

      const baseCachedCurrent = (await pool.getCache())[0]
      const baseIn = baseCachedCurrent.sub(baseCachedBefore)

      expect((await pool.getCache())[0]).to.equal(baseBalances.add(baseIn))
      expect((await pool.getCache())[1]).to.equal(fyTokenBalances.sub(fyTokenOut))
    })

    describe('once mature', () => {
      beforeEach(async () => {
        await ethers.provider.send('evm_mine', [await pool.maturity()])
      })

      it("doesn't allow sellBase", async () => {
        await expect(pool.sellBasePreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.sellBase(user1, 0)).to.be.revertedWith('Pool: Too late')
      })

      it("doesn't allow buyBase", async () => {
        await expect(pool.buyBasePreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.buyBase(user1, WAD, MAX)).to.be.revertedWith('Pool: Too late')
      })

      it("doesn't allow sellFYToken", async () => {
        await expect(pool.sellFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.sellFYToken(user1, 0)).to.be.revertedWith('Pool: Too late')
      })

      it("doesn't allow buyFYToken", async () => {
        await expect(pool.buyFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.buyFYToken(user1, WAD, MAX)).to.be.revertedWith('Pool: Too late')
      })
    })
  })
})
