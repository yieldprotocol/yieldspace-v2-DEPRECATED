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
    const baseBefore = await base.balanceOf(user2)

    // Transfer fyToken for sale to the pool
    await fyToken.mint(pool.address, fyTokenIn)

    const baseOutPreview = await pool.sellFYTokenPreview(fyTokenIn)
    const expectedBaseOut = await poolEstimator.sellFYToken()

    await expect(pool.sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

    const baseOut = (await base.balanceOf(user2)).sub(baseBefore)

    almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
    almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('does not sell fyToken beyond slippage', async () => {
    const fyTokenIn = WAD

    await fyToken.mint(pool.address, fyTokenIn)
    await expect(pool.sellFYToken(user2, MAX, OVERRIDES)).to.be.revertedWith('Pool: Not enough baseToken obtained')
  })

  it('donates base and sells fyToken', async () => {
    const baseDonation = WAD
    const fyTokenIn = WAD

    await base.mint(pool.address, baseDonation)
    await fyToken.mint(pool.address, fyTokenIn)

    await pool.sellFYToken(user2, 0)

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('buys base', async () => {
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]
    const baseBefore = await base.balanceOf(user2)
    const baseOut = WAD

    const fyTokenInPreview = await pool.buyBaseTokenPreview(baseOut)
    const expectedFYTokenIn = await poolEstimator.buyBaseToken(baseOut)

    await fyToken.mint(pool.address, fyTokens)

    await expect(pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getStoredReserves())[1].sub(fyTokenStoredBefore).mul(-1))

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseBefore.add(baseOut), 'Receiver account should have 1 base token')

    almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))
    almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())
  })

  it('does not buy base beyond slippage', async () => {
    const baseOut = WAD

    await fyToken.mint(pool.address, fyTokens)
    await expect(pool.buyBaseToken(user2, baseOut, 0, OVERRIDES)).to.be.revertedWith('Pool: Too much fyToken in')
  })

  it('buys base and retrieves change', async () => {
    const baseBefore = await base.balanceOf(user2)
    const baseOut = WAD

    const expectedFYTokenIn = await poolEstimator.buyBaseToken(baseOut)

    await fyToken.mint(pool.address, fyTokens)

    await pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES)

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseBefore.add(baseOut), 'Receiver account should have 1 base token')
    almostEqual(fyTokenChange, fyTokens.sub(expectedFYTokenIn), baseOut.div(1000000))

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())

    await expect(pool.retrieveFYToken(user1)).to.emit(fyToken, 'Transfer').withArgs(pool.address, user1, fyTokenChange)

    expect(await fyToken.balanceOf(user1)).to.equal(fyTokenChange)
  })

  it('donates fyToken and buys base', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]

    const baseOut = WAD
    const fyTokenDonation = WAD

    await fyToken.mint(pool.address, fyTokens.add(fyTokenDonation))

    await pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES)

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)

    expect((await pool.getStoredReserves())[0]).to.equal(baseReserves.sub(baseOut))
    expect((await pool.getStoredReserves())[1]).to.equal(fyTokenReserves.add(fyTokenIn))
  })

  describe('with extra fyToken reserves', () => {
    beforeEach(async () => {
      const additionalFYTokenReserves = WAD.mul(30)
      await fyToken.mint(owner, additionalFYTokenReserves)
      await fyToken.transfer(pool.address, additionalFYTokenReserves)
      await pool.sellFYToken(owner, 0)
    })

    it('sells base', async () => {
      const baseIn = WAD
      const fyTokenBefore = await fyToken.balanceOf(user2)

      // Transfer base for sale to the pool
      await base.mint(pool.address, baseIn)

      const fyTokenOutPreview = await pool.sellBaseTokenPreview(baseIn)
      const expectedFYTokenOut = await poolEstimator.sellBaseToken()

      await expect(pool.sellBaseToken(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

      const fyTokenOut = (await fyToken.balanceOf(user2)).sub(fyTokenBefore)

      expect(await base.balanceOf(user1)).to.equal(0, "'From' wallet should have no base tokens")

      almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('does not sell base beyond slippage', async () => {
      const baseIn = WAD

      await base.mint(pool.address, baseIn)
      await expect(pool.sellBaseToken(user2, MAX, OVERRIDES)).to.be.revertedWith('Pool: Not enough fyToken obtained')
    })

    it('donates fyToken and sells base', async () => {
      const baseIn = WAD
      const fyTokenDonation = WAD

      await fyToken.mint(pool.address, fyTokenDonation)
      await base.mint(pool.address, baseIn)

      await pool.sellBaseToken(user2, 0, OVERRIDES)

      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('buys fyToken', async () => {
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]
      const fyTokenBefore = await fyToken.balanceOf(user2)
      const fyTokenOut = WAD

      const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut)
      const expectedBaseIn = await poolEstimator.buyFYToken(fyTokenOut)

      await base.mint(pool.address, baseTokens)

      await expect(pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
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
        fyTokenBefore.add(fyTokenOut),
        "'User2' wallet should have 1 fyToken token"
      )

      almostEqual(baseTokenIn, expectedBaseIn, baseTokenIn.div(1000000))
      almostEqual(baseInPreview, expectedBaseIn, baseTokenIn.div(1000000))
      expect((await pool.getStoredReserves())[0].add(baseTokenChange)).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('does not buy fyToken beyond slippage', async () => {
      const fyTokenOut = WAD

      await base.mint(pool.address, baseTokens)
      await expect(pool.buyFYToken(user2, fyTokenOut, 0, OVERRIDES)).to.be.revertedWith('Pool: Too much base token in')
    })

    it('buys fyToken and retrieves change', async () => {
      const fyTokenOut = WAD

      await base.mint(pool.address, baseTokens)

      await pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES)

      const baseTokenStoredCurrent = (await pool.getStoredReserves())[0]
      const baseTokenChange = (await pool.getBaseTokenReserves()).sub(baseTokenStoredCurrent)

      expect((await pool.getStoredReserves())[0].add(baseTokenChange)).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())

      await expect(pool.retrieveBaseToken(user1))
        .to.emit(base, 'Transfer')
        .withArgs(pool.address, user1, baseTokenChange)

      expect(await base.balanceOf(user1)).to.equal(baseTokenChange)
    })

    it('donates base and buys fyToken', async () => {
      const baseReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]

      const fyTokenOut = WAD
      const baseDonation = WAD

      await base.mint(pool.address, baseTokens.add(baseDonation))

      await pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES)

      const baseTokenStoredCurrent = (await pool.getStoredReserves())[0]
      const baseTokenIn = baseTokenStoredCurrent.sub(baseTokenStoredBefore)

      expect((await pool.getStoredReserves())[0]).to.equal(baseReserves.add(baseTokenIn))
      expect((await pool.getStoredReserves())[1]).to.equal(fyTokenReserves.sub(fyTokenOut))
    })

    describe('once mature', () => {
      beforeEach(async () => {
        await ethers.provider.send('evm_mine', [await pool.maturity()])
      })

      it("doesn't allow sellBaseToken", async () => {
        await expect(pool.sellBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.sellBaseToken(user1, 0)).to.be.revertedWith('Pool: Too late')
      })

      it("doesn't allow buyBaseToken", async () => {
        await expect(pool.buyBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(pool.buyBaseToken(user1, WAD, MAX)).to.be.revertedWith('Pool: Too late')
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
