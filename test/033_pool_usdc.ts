import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { WAD, MAX128 as MAX, CALCULATE_FROM_BASE, USDC } from './shared/constants'

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

import { sellBase, sellFYToken, buyBase, buyFYToken, mint, burn } from './shared/yieldspace'

describe('Pool - usdc', async function () {
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
  let poolFromUser1: Pool
  let poolFromOwner: Pool

  let base: Base
  let baseFromOwner: Base
  let baseFromUser1: Base
  let fyToken: FYToken
  let fyTokenFromUser1: FYToken
  let fyTokenFromOwner: FYToken
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
    baseFromUser1 = base.connect(user1Acc)
    baseFromOwner = base.connect(ownerAcc)

    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    fyTokenFromUser1 = fyToken.connect(user1Acc)
    fyTokenFromOwner = fyToken.connect(ownerAcc)

    // Deploy a fresh pool so that we can test initialization
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)
    poolFromOwner = pool.connect(ownerAcc)

    maturity = BigNumber.from(await fyToken.maturity())

    await base.mint(pool.address, initialBase)
    await poolFromUser1.mint(user1, CALCULATE_FROM_BASE, 0)
  })

  it('sells fyToken', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenIn = WAD
    const timeTillMaturity = maturity.sub(await currentTimestamp())

    expect(await base.balanceOf(user2)).to.equal(
      0,
      "'User2' wallet should have no base, instead has " + (await base.balanceOf(user2))
    )

    // Test preview since we are here
    const baseOutPreview = await poolFromUser1.sellFYTokenPreview(fyTokenIn)
    const expectedBaseOut = sellFYToken(baseReserves, fyTokenReserves, fyTokenIn, timeTillMaturity)

    await fyTokenFromOwner.mint(user1, fyTokenIn)

    await fyTokenFromUser1.transfer(pool.address, fyTokenIn)
    await expect(poolFromUser1.sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, await baseFromUser1.balanceOf(user2), fyTokenIn.mul(-1))

    expect(await fyToken.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyToken tokens")

    const baseOut = await base.balanceOf(user2)

    almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
    almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('buys base', async () => {
    const baseReserves = await pool.getBaseTokenReserves()
    const fyTokenReserves = await pool.getFYTokenReserves()
    const fyTokenStoredBefore = (await pool.getStoredReserves())[1]
    const baseOut = WAD

    const timeTillMaturity = maturity.sub(await currentTimestamp())

    expect(await base.balanceOf(user2)).to.equal(
      0,
      "'User2' wallet should have no base, instead has " + (await base.balanceOf(user2))
    )

    const fyTokenInPreview = await poolFromUser1.buyBaseTokenPreview(baseOut) // Test preview since we are here
    const expectedFYTokenIn = buyBase(baseReserves, fyTokenReserves, baseOut, timeTillMaturity)

    await fyTokenFromOwner.mint(user1, fyTokens)

    await fyTokenFromUser1.transfer(pool.address, fyTokens)
    await expect(poolFromUser1.buyBaseToken(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getStoredReserves())[1].sub(fyTokenStoredBefore).mul(-1))

    const fyTokenStoredCurrent = (await pool.getStoredReserves())[1]
    const fyTokenIn = fyTokenStoredCurrent.sub(fyTokenStoredBefore)
    const fyTokenChange = (await pool.getFYTokenReserves()).sub(fyTokenStoredCurrent)

    expect(await base.balanceOf(user2)).to.equal(baseOut, 'Receiver account should have 1 base token')

    almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))

    almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1].add(fyTokenChange)).to.equal(await pool.getFYTokenReserves())
  })

  describe('with extra fyToken reserves', () => {
    beforeEach(async () => {
      const additionalFYTokenReserves = WAD.mul(30)
      await fyTokenFromOwner.mint(owner, additionalFYTokenReserves)
      await fyTokenFromOwner.transfer(pool.address, additionalFYTokenReserves)
      await poolFromOwner.sellFYToken(owner, 0)
    })

    it('mints liquidity tokens', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReserves = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()
      const baseIn = WAD

      const [expectedMinted, expectedFYTokenIn] = mint(
        baseReserves,
        fyTokenReserves,
        supply,
        baseIn,
        CALCULATE_FROM_BASE
      )

      await base.mint(user1, baseIn)
      await fyToken.mint(user1, fyTokens)

      const poolTokensBefore = await pool.balanceOf(user2)

      await base.connect(user1Acc).transfer(pool.address, WAD)
      await fyToken.connect(user1Acc).transfer(pool.address, expectedFYTokenIn.sub(1)) // yieldspace.mint rounds up somewhere
      await expect(poolFromUser1.mint(user2, CALCULATE_FROM_BASE, 0))
        .to.emit(pool, 'Liquidity')
        .withArgs(maturity, user1, user2, WAD.mul(-1), expectedFYTokenIn.sub(1).mul(-1), expectedMinted)

      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, baseIn.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('burns liquidity tokens', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReserves = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()
      const lpTokensIn = WAD

      const [expectedBaseOut, expectedFYTokenOut] = burn(baseReserves, fyTokenReserves, supply, lpTokensIn)

      await poolFromUser1.transfer(pool.address, lpTokensIn)
      await expect(poolFromUser1.burn(user2, 0, 0))
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
      const baseReserves = await poolFromOwner.getBaseTokenReserves()
      const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
      const baseIn = WAD

      const timeTillMaturity = maturity.sub(await currentTimestamp())

      expect(await fyTokenFromOwner.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no fyToken, instead has " + (await fyToken.balanceOf(user2))
      )

      const fyTokenOutPreview = await poolFromOwner.sellBaseTokenPreview(baseIn) // Test preview since we are here
      const expectedFYTokenOut = sellBase(baseReserves, fyTokenReserves, baseIn, timeTillMaturity)

      await baseFromOwner.mint(user1, baseIn)

      await baseFromUser1.transfer(pool.address, baseIn)
      await expect(poolFromUser1.sellBaseToken(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyTokenFromOwner.balanceOf(user2))

      const fyTokenOut = await fyTokenFromOwner.balanceOf(user2)

      expect(await baseFromOwner.balanceOf(user1)).to.equal(0, "'From' wallet should have no base tokens")

      almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
      almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('buys fyToken', async () => {
      const baseReserves = await poolFromOwner.getBaseTokenReserves()
      const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
      const baseTokenStoredBefore = (await pool.getStoredReserves())[0]
      const fyTokenOut = WAD

      const timeTillMaturity = maturity.sub(await currentTimestamp())

      expect(await fyTokenFromOwner.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no fyToken, instead has " + (await fyTokenFromOwner.balanceOf(user2))
      )

      const baseInPreview = await poolFromOwner.buyFYTokenPreview(fyTokenOut) // Test preview since we are here
      const expectedBaseIn = buyFYToken(baseReserves, fyTokenReserves, fyTokenOut, timeTillMaturity)

      await baseFromOwner.mint(user1, baseTokens)

      await baseFromUser1.transfer(poolFromUser1.address, baseTokens)
      await expect(poolFromUser1.buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
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

      expect(await fyTokenFromOwner.balanceOf(user2)).to.equal(fyTokenOut, "'User2' wallet should have 1 fyToken token")

      almostEqual(baseTokenIn, expectedBaseIn, baseTokenIn.div(1000000))
      almostEqual(baseInPreview, expectedBaseIn, baseTokenIn.div(1000000))
      expect((await pool.getStoredReserves())[0].add(baseTokenChange)).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })
  })
})
