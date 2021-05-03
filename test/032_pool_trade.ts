import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX128 } = constants
const MAX = MAX128

import { CALCULATE_FROM_BASE } from '../src/constants'

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

async function currentTimestamp() {
  return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
}

import { sellBase, sellFYToken, buyBase, buyFYToken } from './shared/yieldspace'

describe('Pool - trade', async function () {
  this.timeout(0)

  // These values impact the pool results
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

  let base: Base
  let fyToken1: FYToken
  let fyToken1FromUser1: FYToken
  let maturity1: BigNumber

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
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    base = yieldSpace.bases.get(baseId) as Base
    fyToken1 = yieldSpace.fyTokens.get(fyTokenId) as FYToken

    // Deploy a fresh pool so that we can test initialization
    pool = ((yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool).connect(user1Acc)

    maturity1 = BigNumber.from(await fyToken1.maturity())

    await base.mint(pool.address, initialBase)
    await pool.mint(user1, CALCULATE_FROM_BASE, 0)
  })

  it('sells fyToken', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenIn = WAD
    const timeTillMaturity = maturity1.sub(await currentTimestamp())

    expect(await base.balanceOf(user2)).to.equal(
      0,
      "'User2' wallet should have no base, instead has " + (await base.balanceOf(user2))
    )

    // Test preview since we are here
    const baseOutPreview = await pool.sellFYTokenPreview(fyTokenIn)
    const expectedBaseOut = sellFYToken(baseReserves, fyTokenReserves, fyTokenIn, timeTillMaturity)

    await fyToken1.mint(pool.address, fyTokenIn)

    await expect(pool.sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity1, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

    expect(await fyToken1.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyToken tokens")

    const baseOut = await base.balanceOf(user2)

    almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
    almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('does not sell fyToken beyond slippage', async () => {
    const fyTokenIn = WAD

    await fyToken1.mint(pool.address, fyTokenIn)
    await expect(pool.sellFYToken(user2, MAX, OVERRIDES)).to.be.revertedWith(
      'Pool: Not enough baseToken obtained'
    )
  })

  it('donates base and sells fyToken', async () => {
    const baseDonation = WAD
    const fyTokenIn = WAD

    await base.mint(pool.address, baseDonation)
    await fyToken1.mint(pool.address, fyTokenIn)

    await pool.sellFYToken(user2, 0)

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('buys base', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]
    const baseOut = WAD

    const timeTillMaturity = maturity1.sub(await currentTimestamp())

    expect(await base.balanceOf(user2)).to.equal(
      0,
      "'User2' wallet should have no base, instead has " + (await base.balanceOf(user2))
    )

    const fyTokenInPreview = await pool.buyBaseTokenPreview(baseOut) // Test preview since we are here
    const expectedFYTokenIn = buyBase(baseReserves, fyTokenReserves, baseOut, timeTillMaturity)

    await fyToken1.mint(pool.address, fyTokens)

    await expect(pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity1, user1, user2, baseOut, (await pool.getStoredReserves())[1].sub(fyTokenStoredBefore).mul(-1))

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseOut, 'Receiver account should have 1 base token')

    almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))

    almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())
  })

  it('does not buy base beyond slippage', async () => {
    const baseOut = WAD

    await fyToken1.mint(pool.address, fyTokens)
    await expect(pool.buyBaseToken(user2, baseOut, 0, OVERRIDES)).to.be.revertedWith(
      'Pool: Too much fyToken in'
    )
  })

  it('buys base and retrieves change', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const timeTillMaturity = maturity1.sub(await currentTimestamp())

    const baseOut = WAD

    const expectedFYTokenIn = buyBase(baseReserves, fyTokenReserves, baseOut, timeTillMaturity)

    await fyToken1.mint(pool.address, fyTokens)

    await pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES)

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseOut, 'Receiver account should have 1 base token')
    almostEqual(fyTokenChange, fyTokens.sub(expectedFYTokenIn), baseOut.div(1000000))

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())

    await expect(pool.retrieveFYToken(user1)).to.emit(fyToken1, 'Transfer').withArgs(pool.address, user1, fyTokenChange)

    expect(await fyToken1.balanceOf(user1)).to.equal(fyTokenChange)
  })

  it('donates fyToken and buys base', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]

    const baseOut = WAD
    const fyTokenDonation = WAD

    await fyToken1.mint(pool.address, fyTokens.add(fyTokenDonation))

    await pool.buyBaseToken(user2, baseOut, MAX, OVERRIDES)

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)

    expect((await pool.getStoredReserves())[0]).to.equal(baseReserves.sub(baseOut))
    expect((await pool.getStoredReserves())[1]).to.equal(fyTokenReserves.add(fyTokenIn))
  })

  describe('with extra fyToken reserves', () => {
    beforeEach(async () => {
      const additionalFYTokenReserves = WAD.mul(30)
      await fyToken1.mint(owner, additionalFYTokenReserves)
      await fyToken1.transfer(pool.address, additionalFYTokenReserves)
      await pool.sellFYToken(owner, 0)
    })

    it('sells base', async () => {
      const baseReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseIn = WAD

      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      expect(await fyToken1.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(user2))
      )

      const fyTokenOutPreview = await pool.sellBaseTokenPreview(baseIn) // Test preview since we are here
      const expectedFYTokenOut = sellBase(baseReserves, fyTokenReserves, baseIn, timeTillMaturity)

      await base.mint(pool.address, baseIn)
      await expect(pool.sellBaseToken(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity1, user1, user2, baseIn.mul(-1), await fyToken1.balanceOf(user2))

      const fyTokenOut = await fyToken1.balanceOf(user2)

      expect(await base.balanceOf(user1)).to.equal(0, "'From' wallet should have no base tokens")

      almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('does not sell base beyond slippage', async () => {
      const baseIn = WAD

      await base.mint(pool.address, baseIn)
      await expect(pool.sellBaseToken(user2, MAX, OVERRIDES)).to.be.revertedWith(
        'Pool: Not enough fyToken obtained'
      )
    })

    it('donates fyToken and sells base', async () => {
      const baseIn = WAD
      const fyTokenDonation = WAD

      await fyToken1.mint(pool.address, fyTokenDonation)
      await base.mint(pool.address, baseIn)

      await pool.sellBaseToken(user2, 0, OVERRIDES)

      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('buys fyToken', async () => {
      const baseReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]
      const fyTokenOut = WAD

      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      expect(await fyToken1.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(user2))
      )

      const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut) // Test preview since we are here
      const expectedBaseIn = buyFYToken(baseReserves, fyTokenReserves, fyTokenOut, timeTillMaturity)

      await base.mint(pool.address, baseTokens)

      await expect(pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          (await pool.getStoredReserves())[0].sub(baseTokenStoredBefore).mul(-1),
          fyTokenOut
        )

      const baseTokenStoredCurrent = (await pool.getStoredReserves())[0]
      const baseTokenIn = baseTokenStoredCurrent.sub(baseTokenStoredBefore)
      const baseTokenChange = (await pool.getBaseTokenReserves()).sub(baseTokenStoredCurrent)

      expect(await fyToken1.balanceOf(user2)).to.equal(
        fyTokenOut,
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
      await expect(pool.buyFYToken(user2, fyTokenOut, 0, OVERRIDES)).to.be.revertedWith(
        'Pool: Too much base token in'
      )
    })

    it('buys fyToken and retrieves change', async () => {
      const baseReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]
      const fyTokenOut = WAD
      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      const expectedBaseIn = buyFYToken(baseReserves, fyTokenReserves, fyTokenOut, timeTillMaturity)

      await base.mint(pool.address, baseTokens)

      await pool.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES)

      const baseTokenStoredCurrent = (await pool.getStoredReserves())[0]
      const baseTokenIn = baseTokenStoredCurrent.sub(baseTokenStoredBefore)
      const baseTokenChange = (await pool.getBaseTokenReserves()).sub(baseTokenStoredCurrent)

      almostEqual(baseTokenIn, expectedBaseIn, baseTokenIn.div(1000000))

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
