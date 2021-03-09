import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Base } from '../typechain/DaiMock'
import { FYDaiMock as FYToken } from '../typechain/FYDaiMock'
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
  const daiTokens = BigNumber.from('1000000000000000000000000')
  const fyTokenTokens = daiTokens
  const initialBase = daiTokens
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

  let dai: Base
  let daiFromOwner: Base
  let daiFromUser1: Base
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
    dai = yieldSpace.bases.get(baseId) as Base
    daiFromUser1 = dai.connect(user1Acc)
    daiFromOwner = dai.connect(ownerAcc)

    fyToken1 = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    fyToken1FromUser1 = fyToken1.connect(user1Acc)
    fyToken1FromOwner = fyToken1.connect(ownerAcc)

    // Deploy a fresh pool so that we can test initialization
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)
    poolFromOwner = pool.connect(ownerAcc)

    maturity1 = await fyToken1.maturity()
  })

  it('should setup pool', async () => {
    const b = BigNumber.from('18446744073709551615')
    const k = b.div('126144000')
    expect(await pool.k()).to.be.equal(k)
  })

  it('adds initial liquidity', async () => {
    await dai.mint(user1, initialBase)

    await daiFromUser1.approve(pool.address, initialBase)
    await expect(poolFromUser1.mint(user1, user1, initialBase))
      .to.emit(pool, 'Liquidity')
      .withArgs(maturity1, user1, user1, initialBase.mul(-1), 0, initialBase)

    expect(await poolFromUser1.balanceOf(user1)).to.equal(
      initialBase,
      'User1 should have ' + initialBase + ' liquidity tokens'
    )
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await dai.mint(user1, initialBase)
      await daiFromUser1.approve(pool.address, initialBase)
      await poolFromUser1.mint(user1, user1, initialBase)
    })

    it('sells fyToken', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const fyTokenIn = WAD
      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      expect(await dai.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )

      // Test preview since we are here
      const daiOutPreview = await poolFromUser1.sellFYTokenPreview(fyTokenIn)

      const expectedBaseOut = sellFYToken(daiReserves, fyTokenReserves, fyTokenIn, timeTillMaturity)

      await fyToken1FromUser1.mint(user1, fyTokenIn)
      await fyToken1FromUser1.approve(pool.address, fyTokenIn)
      await expect(poolFromUser1.sellFYToken(user1, user2, fyTokenIn))
        .to.emit(pool, 'Trade')
        .withArgs(maturity1, user1, user2, await daiFromUser1.balanceOf(user2), fyTokenIn.mul(-1))

      expect(await fyToken1.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyToken tokens")

      const daiOut = await dai.balanceOf(user2)

      almostEqual(daiOut, expectedBaseOut, fyTokenIn.div(1000000))
      almostEqual(daiOutPreview, expectedBaseOut, fyTokenIn.div(1000000))
    })

    it('buys dai', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const daiOut = WAD.mul(10) // TODO: This runs out of gas with WAD, why?

      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      expect(await dai.balanceOf(user2)).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )

      // Test preview since we are here
      const fyTokenInPreview = await poolFromUser1.buyBaseTokenPreview(daiOut)

      const expectedFYTokenIn = buyBase(daiReserves, fyTokenReserves, daiOut, timeTillMaturity)

      await fyToken1FromUser1.mint(user1, fyTokenTokens)
      await fyToken1FromUser1.approve(pool.address, fyTokenTokens)

      await expect(poolFromUser1.buyBaseToken(user1, user2, daiOut, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity1, user1, user2, daiOut, fyTokenTokens.sub(await fyToken1.balanceOf(user1)).mul(-1))

      const fyTokenIn = fyTokenTokens.sub(await fyToken1.balanceOf(user1))
      expect(await dai.balanceOf(user2)).to.equal(daiOut, 'Receiver account should have 1 dai token')

      almostEqual(fyTokenIn, expectedFYTokenIn, daiOut.div(1000000))
      almostEqual(fyTokenInPreview, expectedFYTokenIn, daiOut.div(1000000))
    })

    describe('with extra fyToken reserves', () => {
      beforeEach(async () => {
        const additionalFYTokenReserves = WAD.mul(30)
        await fyToken1FromOwner.mint(owner, additionalFYTokenReserves)
        await fyToken1FromOwner.approve(pool.address, additionalFYTokenReserves)
        await poolFromOwner.sellFYToken(owner, owner, additionalFYTokenReserves)
      })

      it('mints liquidity tokens', async () => {
        const daiReserves = await dai.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const daiIn = WAD

        await daiFromUser1.mint(user1, daiIn)
        await fyToken1FromUser1.mint(user1, fyTokenTokens)

        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await daiFromUser1.approve(pool.address, WAD)
        await fyToken1FromUser1.approve(pool.address, fyTokenTokens)
        await expect(poolFromUser1.mint(user1, user2, WAD))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            WAD.mul(-1),
            fyTokenBefore.sub(await fyToken1.balanceOf(user1)).mul(-1),
            (await pool.balanceOf(user2)).sub(poolTokensBefore)
          )

        const [expectedMinted, expectedFYTokenIn] = mint(daiReserves, fyTokenReserves, supply, daiIn)

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const fyTokenIn = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        almostEqual(minted, expectedMinted, daiIn.div(10000))
        almostEqual(fyTokenIn, expectedFYTokenIn, daiIn.div(10000))
      })

      it('mints liquidity tokens with dai only', async () => {
        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyTokenReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()

        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const fyTokenToBuy = WAD.div(1000)
        const maxBaseIn = WAD.mul(1000)

        await daiFromOwner.mint(user1, maxBaseIn)

        const daiBefore = await daiFromOwner.balanceOf(user1)
        const poolTokensBefore = await poolFromOwner.balanceOf(user2)

        await daiFromUser1.approve(pool.address, maxBaseIn)
        await expect(poolFromUser1.mintWithToken(user1, user2, fyTokenToBuy, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            0,
            (await poolFromOwner.balanceOf(user2)).sub(poolTokensBefore)
          )

        const [expectedMinted, expectedBaseIn] = mintWithBase(
          daiReserves,
          fyTokenReservesVirtual,
          fyTokenReservesReal,
          supply,
          fyTokenToBuy,
          timeTillMaturity
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const daiIn = daiBefore.sub(await dai.balanceOf(user1))

        almostEqual(minted, expectedMinted, minted.div(10000))
        almostEqual(daiIn, expectedBaseIn, daiIn.div(10000))
      })

      it('burns liquidity tokens', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        const lpTokensIn = WAD

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burn(user1, user2, lpTokensIn))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            fyTokenReserves.sub(await fyToken1FromOwner.balanceOf(pool.address)),
            lpTokensIn.mul(-1)
          )

        const [expectedBaseOut, expectedFYTokenOut] = burn(daiReserves, fyTokenReserves, supply, lpTokensIn)

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))
        const fyTokenOut = fyTokenReserves.sub(await fyToken1.balanceOf(pool.address))

        almostEqual(daiOut, expectedBaseOut, daiOut.div(10000))
        almostEqual(fyTokenOut, expectedFYTokenOut, fyTokenOut.div(10000))
      })

      it('burns liquidity tokens to Base', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyTokenReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()

        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const lpTokensIn = WAD.mul(2) // TODO: Why does it run out of gas with 1 WAD?

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burnForBaseToken(user1, user2, lpTokensIn, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            0,
            lpTokensIn.mul(-1)
          )

        const expectedBaseOut = burnForBase(
          daiReserves,
          fyTokenReservesVirtual,
          fyTokenReservesReal,
          supply,
          lpTokensIn,
          timeTillMaturity
        )

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))

        almostEqual(daiOut, expectedBaseOut, daiOut.div(10000))
      })

      it('sells dai', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
        const daiIn = WAD

        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(user2))
        )

        // Test preview since we are here
        const fyTokenOutPreview = await poolFromOwner.sellBaseTokenPreview(daiIn)

        const expectedFYTokenOut = sellBase(daiReserves, fyTokenReserves, daiIn, timeTillMaturity)

        await daiFromOwner.mint(user1, daiIn)
        await daiFromUser1.approve(pool.address, daiIn)

        await expect(poolFromUser1.sellBaseToken(user1, user2, daiIn, OVERRIDES))
          .to.emit(pool, 'Trade')
          .withArgs(maturity1, user1, user2, daiIn.mul(-1), await fyToken1FromOwner.balanceOf(user2))

        const fyTokenOut = await fyToken1FromOwner.balanceOf(user2)

        expect(await daiFromOwner.balanceOf(user1)).to.equal(0, "'From' wallet should have no dai tokens")

        almostEqual(fyTokenOut, expectedFYTokenOut, daiIn.div(1000000))
        almostEqual(fyTokenOutPreview, expectedFYTokenOut, daiIn.div(1000000))
      })

      it('buys fyToken', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyTokenReserves = await poolFromOwner.getFYTokenReserves()
        const fyTokenOut = WAD

        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyToken, instead has " + (await fyToken1FromOwner.balanceOf(user2))
        )

        // Test preview since we are here
        const daiInPreview = await poolFromOwner.buyFYTokenPreview(fyTokenOut)

        const expectedBaseIn = buyFYToken(daiReserves, fyTokenReserves, fyTokenOut, timeTillMaturity)

        await daiFromOwner.mint(user1, daiTokens)
        const daiBalanceBefore = await daiFromOwner.balanceOf(user1)

        await daiFromUser1.approve(poolFromUser1.address, daiTokens)
        await expect(poolFromUser1.buyFYToken(user1, user2, fyTokenOut, OVERRIDES))
          .to.emit(pool, 'Trade')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            fyTokenOut
          )

        const daiIn = daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1))

        expect(await fyToken1FromOwner.balanceOf(user2)).to.equal(fyTokenOut, "'User2' wallet should have 1 fyToken token")

        almostEqual(daiIn, expectedBaseIn, daiIn.div(1000000))
        almostEqual(daiInPreview, expectedBaseIn, daiIn.div(1000000))
      })

      it("once mature, doesn't allow trading", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.sellBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
      })
    })
  })
})
