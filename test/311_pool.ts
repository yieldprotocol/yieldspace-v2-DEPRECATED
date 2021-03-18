import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

const timeMachine = require('ether-time-traveler')

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

import { mint, mintWithBase, burn, burnForBase, sellBase, sellFYToken, buyBase, buyFYToken } from './shared/yieldspace'
const WAD = BigNumber.from('1000000000000000000')

describe('Pool', async function () {
  this.timeout(0)

  // These values impact the pool results
  const baseTokens = BigNumber.from('1000000000000000000000000')
  const fyTokenTokens = baseTokens
  const initialBase = baseTokens
  const OVERRIDES = { gasLimit: 1_000_000 }

  let snapshotId: string
  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let operatorAcc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string
  let operator: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  let pool: Pool
  let poolFromUser1: Pool
  let poolFromOwner: Pool

  let base: Base
  let baseFromOwner: Base
  let baseFromUser1: Base
  let fyToken1: FYToken
  let fyToken1FromUser1: FYToken
  let fyToken1FromOwner: FYToken
  let maturity1: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyTokenId = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [fyTokenId], BigNumber.from('0'))
  }

  before(async () => {
    snapshotId = await timeMachine.takeSnapshot(ethers.provider)

    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
    operatorAcc = signers[3]
    operator = operatorAcc.address
  })

  after(async () => {
    await timeMachine.revertToSnapshot(ethers.provider, snapshotId)
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    base = yieldSpace.bases.get(baseId) as Base
    baseFromUser1 = base.connect(user1Acc)
    baseFromOwner = base.connect(ownerAcc)

    fyToken1 = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    fyToken1FromUser1 = fyToken1.connect(user1Acc)
    fyToken1FromOwner = fyToken1.connect(ownerAcc)

    // Deploy a fresh pool so that we can test initialization
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)
    poolFromOwner = pool.connect(ownerAcc)

    maturity1 = BigNumber.from(await fyToken1.maturity())
  })

  it('adds initial liquidity', async () => {
    await base.mint(user1, initialBase)

    await baseFromUser1.approve(pool.address, initialBase)
    await expect(poolFromUser1.mint(user1, initialBase))
      .to.emit(pool, 'Liquidity')
      .withArgs(maturity1, user1, user1, initialBase.mul(-1), 0, initialBase)

    expect(await poolFromUser1.balanceOf(user1)).to.equal(
      initialBase,
      'User1 should have ' + initialBase + ' liquidity tokens'
    )
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await base.mint(user1, initialBase)
      await baseFromUser1.approve(pool.address, initialBase)
      await poolFromUser1.mint(user1, initialBase)
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
      const baseOutPreview = await poolFromUser1.sellFYTokenPreview(fyTokenIn)

      const expectedBaseOut = sellFYToken(baseReserves, fyTokenReserves, fyTokenIn, timeTillMaturity)

      await fyToken1FromUser1.mint(user1, fyTokenIn)
      await fyToken1FromUser1.transfer(pool.address, fyTokenIn)
      await expect(poolFromUser1.sellFYToken(user2))
        .to.emit(pool, 'Trade')
        .withArgs(maturity1, user1, user2, await baseFromUser1.balanceOf(user2), fyTokenIn.mul(-1))

      expect(await fyToken1.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyToken tokens")

      const baseOut = await base.balanceOf(user2)

      almostEqual(baseOut, expectedBaseOut, fyTokenIn.div(1000000))
      almostEqual(baseOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    })

    it('buys base', async () => {
      const baseReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseOut = WAD.mul(10) // TODO: This runs out of gas with WAD, why?

      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      expect(await base.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no base, instead has " + (await base.balanceOf(user2))
      )

      // Test preview since we are here
      const fyTokenInPreview = await poolFromUser1.buyBaseTokenPreview(baseOut)

      const expectedFYTokenIn = buyBase(baseReserves, fyTokenReserves, baseOut, timeTillMaturity)

      await fyToken1FromUser1.mint(user1, fyTokenTokens)
      await fyToken1FromUser1.approve(pool.address, fyTokenTokens)

      await expect(poolFromUser1.buyBaseToken(user2, baseOut, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity1, user1, user2, baseOut, fyTokenTokens.sub(await fyToken1.balanceOf(user1)).mul(-1))

      const fyTokenIn = fyTokenTokens.sub(await fyToken1.balanceOf(user1))
      expect(await base.balanceOf(user2)).to.equal(baseOut, 'Receiver account should have 1 base token')

      almostEqual(fyTokenIn, expectedFYTokenIn, baseOut.div(1000000))
      almostEqual(fyTokenInPreview, expectedFYTokenIn, baseOut.div(1000000))
    })

    it('calculates the TWAR price', async () => {
      const cumulativePrice1 = await pool.cumulativeReserveRatio()
      expect(cumulativePrice1).to.equal(0, 'Price should start at 0')
      const timestamp1 = (await pool.getStoredReserves())[2]

      await timeMachine.advanceTimeAndBlock(ethers.provider, 120)

      await pool.sync()

      const balancedRatio = BigNumber.from('10').pow(BigNumber.from('27'))

      const cumulativeRatio2 = await pool.cumulativeReserveRatio()
      const timestamp2 = (await pool.getStoredReserves())[2]
      const ratio2 = cumulativeRatio2.div(BigNumber.from(timestamp2 - timestamp1))
      almostEqual(ratio2, balancedRatio, BigNumber.from('10000000000'))

      await timeMachine.advanceTimeAndBlock(ethers.provider, 120)

      await pool.sync()

      const cumulativeRatio3 = await pool.cumulativeReserveRatio()
      const timestamp3 = (await pool.getStoredReserves())[2]
      const ratio3 = cumulativeRatio3.sub(cumulativeRatio2).div(BigNumber.from(timestamp3 - timestamp2))
      almostEqual(ratio3, balancedRatio, BigNumber.from('10000000000'))
    })

    describe('with extra fyToken reserves', () => {
      beforeEach(async () => {
        const additionalFYTokenReserves = WAD.mul(30)
        await fyToken1FromOwner.mint(owner, additionalFYTokenReserves)
        await fyToken1FromOwner.transfer(pool.address, additionalFYTokenReserves)
        await poolFromOwner.sellFYToken(owner)
      })

      it('mints liquidity tokens', async () => {
        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const baseIn = WAD

        await baseFromUser1.mint(user1, baseIn)
        await fyToken1FromUser1.mint(user1, fyTokenTokens)

        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await baseFromUser1.approve(pool.address, WAD)
        await fyToken1FromUser1.approve(pool.address, fyTokenTokens)
        await expect(poolFromUser1.mint(user2, WAD))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            WAD.mul(-1),
            fyTokenBefore.sub(await fyToken1.balanceOf(user1)).mul(-1),
            (await pool.balanceOf(user2)).sub(poolTokensBefore)
          )

        const [expectedMinted, expectedFYTokenIn] = mint(baseReserves, fyTokenReserves, supply, baseIn)

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const fyTokenIn = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        almostEqual(minted, expectedMinted, baseIn.div(10000))
        almostEqual(fyTokenIn, expectedFYTokenIn, baseIn.div(10000))
      })

      it('mints liquidity tokens with base only', async () => {
        const baseReserves = await baseFromOwner.balanceOf(pool.address)
        const fyTokenReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()

        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const fyTokenToBuy = WAD.div(1000)
        const maxBaseIn = WAD.mul(1000)

        await baseFromOwner.mint(user1, maxBaseIn)

        const baseBefore = await baseFromOwner.balanceOf(user1)
        const poolTokensBefore = await poolFromOwner.balanceOf(user2)

        await baseFromUser1.approve(pool.address, maxBaseIn)
        await expect(poolFromUser1.mintWithToken(user2, fyTokenToBuy, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            baseBefore.sub(await baseFromOwner.balanceOf(user1)).mul(-1),
            0,
            (await poolFromOwner.balanceOf(user2)).sub(poolTokensBefore)
          )

        const [expectedMinted, expectedBaseIn] = mintWithBase(
          baseReserves,
          fyTokenReservesVirtual,
          fyTokenReservesReal,
          supply,
          fyTokenToBuy,
          timeTillMaturity
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const baseIn = baseBefore.sub(await base.balanceOf(user1))

        almostEqual(minted, expectedMinted, minted.div(10000))
        almostEqual(baseIn, expectedBaseIn, baseIn.div(10000))
      })

      it('burns liquidity tokens', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const baseReserves = await baseFromOwner.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        const lpTokensIn = WAD

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burn(user2, lpTokensIn))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            baseReserves.sub(await baseFromOwner.balanceOf(pool.address)),
            fyTokenReserves.sub(await fyToken1FromOwner.balanceOf(pool.address)),
            lpTokensIn.mul(-1)
          )

        const [expectedBaseOut, expectedFYTokenOut] = burn(baseReserves, fyTokenReserves, supply, lpTokensIn)

        const baseOut = baseReserves.sub(await base.balanceOf(pool.address))
        const fyTokenOut = fyTokenReserves.sub(await fyToken1.balanceOf(pool.address))

        almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
        almostEqual(fyTokenOut, expectedFYTokenOut, fyTokenOut.div(10000))
      })

      it('burns liquidity tokens to Base', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const baseReserves = await baseFromOwner.balanceOf(pool.address)
        const fyTokenReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()

        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const lpTokensIn = WAD.mul(2) // TODO: Why does it run out of gas with 1 WAD?

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burnForBaseToken(user2, lpTokensIn, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            baseReserves.sub(await baseFromOwner.balanceOf(pool.address)),
            0,
            lpTokensIn.mul(-1)
          )

        const expectedBaseOut = burnForBase(
          baseReserves,
          fyTokenReservesVirtual,
          fyTokenReservesReal,
          supply,
          lpTokensIn,
          timeTillMaturity
        )

        const baseOut = baseReserves.sub(await base.balanceOf(pool.address))

        almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
      })

      it('sells base', async () => {
        const baseReserves = await poolFromOwner.getBaseTokenReserves()
        const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
        const baseIn = WAD

        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(user2))
        )

        // Test preview since we are here
        const fyTokenOutPreview = await poolFromOwner.sellBaseTokenPreview(baseIn)

        const expectedFYTokenOut = sellBase(baseReserves, fyTokenReserves, baseIn, timeTillMaturity)

        await baseFromOwner.mint(user1, baseIn)
        await baseFromUser1.transfer(pool.address, baseIn)

        await expect(poolFromUser1.sellBaseToken(user2, OVERRIDES))
          .to.emit(pool, 'Trade')
          .withArgs(maturity1, user1, user2, baseIn.mul(-1), await fyToken1FromOwner.balanceOf(user2))

        const fyTokenOut = await fyToken1FromOwner.balanceOf(user2)

        expect(await baseFromOwner.balanceOf(user1)).to.equal(0, "'From' wallet should have no base tokens")

        almostEqual(fyTokenOut, expectedFYTokenOut, baseIn.div(1000000))
        almostEqual(fyTokenOutPreview, expectedFYTokenOut, baseIn.div(1000000))
      })

      it('buys fyToken', async () => {
        const baseReserves = await poolFromOwner.getBaseTokenReserves()
        const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
        const fyTokenOut = WAD

        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyToken, instead has " + (await fyToken1FromOwner.balanceOf(user2))
        )

        // Test preview since we are here
        const baseInPreview = await poolFromOwner.buyFYTokenPreview(fyTokenOut)

        const expectedBaseIn = buyFYToken(baseReserves, fyTokenReserves, fyTokenOut, timeTillMaturity)

        await baseFromOwner.mint(user1, baseTokens)
        const baseBalanceBefore = await baseFromOwner.balanceOf(user1)

        await baseFromUser1.approve(poolFromUser1.address, baseTokens)
        await expect(poolFromUser1.buyFYToken(user2, fyTokenOut, OVERRIDES))
          .to.emit(pool, 'Trade')
          .withArgs(
            maturity1,
            user1,
            user2,
            baseBalanceBefore.sub(await baseFromOwner.balanceOf(user1)).mul(-1),
            fyTokenOut
          )

        const baseIn = baseBalanceBefore.sub(await baseFromOwner.balanceOf(user1))

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(
          fyTokenOut,
          "'User2' wallet should have 1 fyToken token"
        )

        almostEqual(baseIn, expectedBaseIn, baseIn.div(1000000))
        almostEqual(baseInPreview, expectedBaseIn, baseIn.div(1000000))
      })

      it("once mature, doesn't allow sellBaseToken", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.sellBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellBaseToken(user1)).to.be.revertedWith('Pool: Too late')
      })

      /* TODO: Hardhat bug. If you import "hardhat/console.sol" and put a console.log inside _buyBaseTokenPreview, the test passes
      it("once mature, doesn't allow buyBaseToken", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.buyBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseToken(user1, WAD)).to.be.revertedWith('Pool: Too late')
      })
      */

      it("once mature, doesn't allow sellFYToken", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.sellFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYToken(user1)).to.be.revertedWith('Pool: Too late')
      })

      it("once mature, doesn't allow buyFYToken", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.buyFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYToken(user1, WAD)).to.be.revertedWith('Pool: Too late')
      })
    })
  })
})
