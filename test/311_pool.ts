import { artifacts, contract, web3 } from 'hardhat'

const Pool = artifacts.require('Pool')
const PoolFactory = artifacts.require('PoolFactory')
const Base = artifacts.require('DaiMock')
const FYToken = artifacts.require('FYDaiMock')
const SafeERC20Namer = artifacts.require('SafeERC20Namer')
const YieldMath = artifacts.require('YieldMath')

const { floor } = require('mathjs')
import * as helper from 'ganache-time-traveler'
import { toWad, toRay, ZERO, MAX } from './shared/utils'
import { mint, tradeAndMint, burn, burnAndTrade, sellBase, sellFYToken, buyBase, buyFYToken } from './shared/yieldspace'
// @ts-ignore
import { BN, expectEvent, expectRevert } from '@openzeppelin/test-helpers'
import { assert, expect } from 'chai'
import { Contract } from './shared/fixtures'

function toBigNumber(x: any) {
  if (typeof x == 'object') x = x.toString()
  if (typeof x == 'number') return new BN(x)
  else if (typeof x == 'string') {
    if (x.startsWith('0x') || x.startsWith('0X')) return new BN(x.substring(2), 16)
    else return new BN(x)
  }
}

function bignumberToBN(x: any) {
  return new BN(floor(x).toString())
}

function almostEqual(x: any, y: any, p: any) {
  // Check that abs(x - y) < p:
  const xb = toBigNumber(x)
  const yb = toBigNumber(y)
  const pb = toBigNumber(p)
  const diff = xb.gt(yb) ? xb.sub(yb) : yb.sub(xb)
  expect(diff).to.be.bignumber.lt(pb)
}

async function currentTimestamp() {
  const block = await web3.eth.getBlockNumber()
  return new BN((await web3.eth.getBlock(block)).timestamp.toString())
}

contract('Pool', async (accounts) => {
  let [owner, user1, user2, operator, from, to] = accounts

  // These values impact the pool results
  const baseTokens = toWad(100)
  const fyTokens = toWad(10)
  const initialBase = toWad(100)
  const initialFYToken = toWad(10)

  let snapshot: any
  let snapshotId: string

  let pool: Contract
  let base: Contract
  let fyToken1: Contract
  let maturity1: BN

  before(async () => {
    const yieldMathLibrary = await YieldMath.new()
    const safeERC20NamerLibrary = await SafeERC20Namer.new()
    await PoolFactory.link(yieldMathLibrary)
    await PoolFactory.link(safeERC20NamerLibrary)
  })

  beforeEach(async () => {
    snapshot = await helper.takeSnapshot()
    snapshotId = snapshot['result']

    // Setup base
    base = await Base.new()

    // Setup fyToken
    maturity1 = (await currentTimestamp()).addn(31556952) // One year
    fyToken1 = await FYToken.new(base.address, maturity1)

    // Setup Pool
    const factory = await PoolFactory.new();
    pool = await factory.createPool(base.address, fyToken1.address, {
      from: owner,
    })
    const poolAddress = await factory.calculatePoolAddress(base.address, fyToken1.address)
    pool = await Pool.at(poolAddress)
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  it('should setup pool', async () => {
    const b = new BN('18446744073709551615')
    const k = b.div(new BN('126144000'))
    expect(await pool.k()).to.be.bignumber.equal(k)

    const g1 = new BN('950').mul(b).div(new BN('1000')).add(new BN(1)) // Sell Base to the pool
    const g2 = new BN('1000').mul(b).div(new BN('950')).add(new BN(1)) // Sell fyToken to the pool
  })

  it('adds initial liquidity', async () => {
    await base.mint(user1, initialBase)
    await base.approve(pool.address, MAX, { from: user1 })
    const tx = await pool.init(initialBase, { from: user1 })

    expectEvent(tx, 'Liquidity', {
      from: user1,
      to: user1,
      baseTokens: initialBase.neg().toString(),
      fyTokens: ZERO,
      poolTokens: initialBase.toString(),
    })

    assert.equal(
      await pool.balanceOf(user1),
      initialBase.toString(),
      'User1 should have ' + initialBase + ' liquidity tokens'
    )
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await base.mint(user1, initialBase)
      await base.approve(pool.address, initialBase, { from: user1 })
      await pool.init(initialBase, { from: user1 })
    })

    it('sells fyToken', async () => {
      const baseReserves = await pool.getBaseReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const fyTokenIn = toWad(1)
      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      assert.equal(
        await base.balanceOf(to),
        0,
        "'To' wallet should have no base, instead has " + (await base.balanceOf(to))
      )

      // Test preview since we are here
      const baseOutPreview = await pool.sellFYTokenPreview(fyTokenIn, { from: operator })

      const expectedBaseOut = sellFYToken(
        baseReserves.toString(),
        fyTokenReserves.toString(),
        fyTokenIn.toString(),
        timeTillMaturity.toString()
      )

      await pool.addDelegate(operator, { from: from })
      await fyToken1.mint(from, fyTokenIn, { from: owner })
      await fyToken1.approve(pool.address, fyTokenIn, { from: from })
      const tx = await pool.sellFYToken(from, to, fyTokenIn, { from: operator })

      expectEvent(tx, 'Trade', {
        from: from,
        to: to,
        baseTokens: (await base.balanceOf(to)).toString(),
        fyTokens: fyTokenIn.neg().toString(),
      })

      assert.equal(await fyToken1.balanceOf(from), 0, "'From' wallet should have no fyToken tokens")

      const baseOut = await base.balanceOf(to)

      almostEqual(baseOut, floor(expectedBaseOut).toFixed(), fyTokenIn.divn(1000000))
      almostEqual(baseOutPreview, floor(expectedBaseOut).toFixed(), fyTokenIn.divn(1000000))
    })

    it('buys base', async () => {
      const baseReserves = await pool.getBaseReserves()
      const fyTokenReserves = await pool.getFYTokenReserves()
      const baseOut = toWad(1)
      const timeTillMaturity = maturity1.sub(await currentTimestamp())

      await fyToken1.mint(from, fyTokens, { from: owner })

      assert.equal(
        await fyToken1.balanceOf(from),
        fyTokens.toString(),
        "'From' wallet should have " + fyTokens + ' fyToken, instead has ' + (await fyToken1.balanceOf(from))
      )

      // Test preview since we are here
      const fyTokenInPreview = await pool.buyBasePreview(baseOut, { from: operator })

      const expectedFYTokenIn = buyBase(
        baseReserves.toString(),
        fyTokenReserves.toString(),
        baseOut.toString(),
        timeTillMaturity.toString()
      )

      await pool.addDelegate(operator, { from: from })
      await fyToken1.approve(pool.address, fyTokens, { from: from })
      const tx = await pool.buyBase(from, to, baseOut, { from: operator })

      const fyTokenIn = fyTokens.sub(await fyToken1.balanceOf(from))

      expectEvent(tx, 'Trade', {
        from: from,
        to: to,
        baseTokens: baseOut.toString(),
        fyTokens: fyTokenIn.neg().toString(),
      })

      assert.equal(await base.balanceOf(to), baseOut.toString(), 'Receiver account should have 1 base token')

      almostEqual(fyTokenIn, floor(expectedFYTokenIn).toFixed(), baseOut.divn(1000000))
      almostEqual(fyTokenInPreview, floor(expectedFYTokenIn).toFixed(), baseOut.divn(1000000))
    })

    describe('with extra fyToken reserves', () => {
      beforeEach(async () => {
        await fyToken1.mint(operator, initialFYToken, { from: owner })
        await fyToken1.approve(pool.address, initialFYToken, { from: operator })
        await pool.sellFYToken(operator, operator, initialFYToken, { from: operator })
      })

      it('mints liquidity tokens', async () => {
        const oneToken = toWad(1)
        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        await fyToken1.mint(user1, fyTokens, { from: owner })

        const baseBefore = await base.balanceOf(user1)
        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await base.approve(pool.address, MAX, { from: user1 })
        await fyToken1.approve(pool.address, MAX, { from: user1 })
        const tx = await pool.mint(user1, user2, fyTokens, { from: user1 })

        const [expectedMinted, expectedBaseIn] = mint(
          baseReserves.toString(),
          fyTokenReserves.toString(),
          supply.toString(),
          fyTokens.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const baseIn = baseBefore.sub(await base.balanceOf(user1))
        const fyTokenIn = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseIn.neg().toString(),
          fyTokens: fyTokenIn.neg().toString(),
          poolTokens: minted.toString(),
        })

        almostEqual(minted, floor(expectedMinted).toFixed(), minted.div(new BN('10000')))
        almostEqual(baseIn, floor(expectedBaseIn).toFixed(), baseIn.div(new BN('10000')))
      })

      it('does not mint liquidity tokens if too much Base is required', async () => {
        const fyTokenToBuy = toWad(1)
        const fyTokenIn = fyTokens.sub(fyTokenToBuy)

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        await fyToken1.mint(user1, fyTokenIn, { from: owner })

        await base.approve(pool.address, MAX, { from: user1 })
        await fyToken1.approve(pool.address, MAX, { from: user1 })
        await expectRevert(
          pool.tradeAndMint(user1, user2, fyTokenIn, fyTokenToBuy, 0, 0, { from: user1 }),
          "Pool: Too much Base required"
        )
      })

      it('does not mint liquidity tokens if too few liquidity tokens are obtained', async () => {
        const fyTokenToBuy = toWad(1)
        const fyTokenIn = fyTokens.sub(fyTokenToBuy)

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        await fyToken1.mint(user1, fyTokenIn, { from: owner })

        await base.approve(pool.address, MAX, { from: user1 })
        await fyToken1.approve(pool.address, MAX, { from: user1 })
        await expectRevert(
          pool.tradeAndMint(user1, user2, fyTokenIn, fyTokenToBuy, 0, MAX, { from: user1 }),
          "Pool: Too much Base required"
        )
      })

      it('mints liquidity tokens with base and fyToken, buying FYToken', async () => {
        const oneToken = toWad(1)
        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReservesVirtual = await pool.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        const fyTokenToBuy = toWad(1)
        const fyTokenIn = fyTokens.sub(fyTokenToBuy)

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        await fyToken1.mint(user1, fyTokenIn, { from: owner })

        const baseBefore = await base.balanceOf(user1)
        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await base.approve(pool.address, MAX, { from: user1 })
        await fyToken1.approve(pool.address, MAX, { from: user1 })
        const tx = await pool.tradeAndMint(user1, user2, fyTokenIn, fyTokenToBuy, MAX, 0, { from: user1 })

        const [expectedMinted, expectedBaseIn] = tradeAndMint(
          baseReserves.toString(),
          fyTokenReservesVirtual.toString(),
          fyTokenReservesReal.toString(),
          supply.toString(),
          fyTokenIn.toString(),
          fyTokenToBuy.toString(),
          timeTillMaturity.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const baseTaken = baseBefore.sub(await base.balanceOf(user1))
        const fyTokenTaken = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseTaken.neg().toString(),
          fyTokens: fyTokenTaken.neg().toString(),
          poolTokens: minted.toString(),
        })

        almostEqual(minted, floor(expectedMinted).toFixed(), minted.div(new BN('10000')))
        almostEqual(baseTaken, floor(expectedBaseIn).toFixed(), baseTaken.div(new BN('10000')))
      })

      it('mints liquidity tokens with base and fyToken, selling FYToken', async () => {
        const oneToken = toWad(1)
        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReservesVirtual = await pool.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        const fyTokenToBuy = toWad(1).neg()
        const fyTokenIn = fyTokens.sub(fyTokenToBuy)

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        await fyToken1.mint(user1, fyTokenIn, { from: owner })

        const baseBefore = await base.balanceOf(user1)
        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await base.approve(pool.address, MAX, { from: user1 })
        await fyToken1.approve(pool.address, MAX, { from: user1 })
        const tx = await pool.tradeAndMint(user1, user2, fyTokenIn, fyTokenToBuy.neg(), MAX, 0, { from: user1 })

        const [expectedMinted, expectedBaseIn] = tradeAndMint(
          baseReserves.toString(),
          fyTokenReservesVirtual.toString(),
          fyTokenReservesReal.toString(),
          supply.toString(),
          fyTokenIn.toString(),
          fyTokenToBuy.neg().toString(),
          timeTillMaturity.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const baseTaken = baseBefore.sub(await base.balanceOf(user1))
        const fyTokenTaken = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseTaken.neg().toString(),
          fyTokens: fyTokenTaken.neg().toString(),
          poolTokens: minted.toString(),
        })

        almostEqual(minted, floor(expectedMinted).toFixed(), minted.div(new BN('10000')))
        almostEqual(baseTaken, floor(expectedBaseIn).toFixed(), baseTaken.div(new BN('10000')))
      })

      it('mints liquidity tokens with base only, buying FYToken', async () => {
        const oneToken = toWad(1)
        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReservesVirtual = await pool.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        const fyTokenToBuy = toWad(1)
        // const fyTokenIn = fyTokens.sub(fyTokenToBuy)

        await base.mint(user1, fyTokens.muln(100), { from: owner })
        // await fyToken1.mint(user1, fyTokenIn, { from: owner })

        const baseBefore = await base.balanceOf(user1)
        const fyTokenBefore = await fyToken1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await base.approve(pool.address, MAX, { from: user1 })
        // await fyToken1.approve(pool.address, MAX, { from: user1 })
        const tx = await pool.tradeAndMint(user1, user2, 0, fyTokenToBuy, MAX, 0, { from: user1 })

        const [expectedMinted, expectedBaseIn] = tradeAndMint(
          baseReserves.toString(),
          fyTokenReservesVirtual.toString(),
          fyTokenReservesReal.toString(),
          supply.toString(),
          '0',
          fyTokenToBuy.toString(),
          timeTillMaturity.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const baseTaken = baseBefore.sub(await base.balanceOf(user1))
        const fyTokenTaken = fyTokenBefore.sub(await fyToken1.balanceOf(user1))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseTaken.neg().toString(),
          fyTokens: '0',
          poolTokens: minted.toString(),
        })

        almostEqual(minted, floor(expectedMinted).toFixed(), minted.div(new BN('10000')))
        almostEqual(baseTaken, floor(expectedBaseIn).toFixed(), baseTaken.div(new BN('10000')))
      })

      it('burns liquidity tokens', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReserves = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const lpTokensIn = toWad(1)

        await pool.approve(pool.address, lpTokensIn, { from: user1 })
        const tx = await pool.burn(user1, user2, lpTokensIn, { from: user1 })

        const [expectedBaseOut, expectedFYTokenOut] = burn(
          baseReserves.toString(),
          fyTokenReserves.toString(),
          supply.toString(),
          lpTokensIn.toString()
        )

        const baseOut = baseReserves.sub(await base.balanceOf(pool.address))
        const fyTokenOut = fyTokenReserves.sub(await fyToken1.balanceOf(pool.address))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseOut.toString(),
          fyTokens: fyTokenOut.toString(),
          poolTokens: lpTokensIn.neg().toString(),
        })

        almostEqual(baseOut, floor(expectedBaseOut).toFixed(), baseOut.div(new BN('10000')))
        almostEqual(fyTokenOut, floor(expectedFYTokenOut).toFixed(), fyTokenOut.div(new BN('10000')))
      })

      it('burns liquidity tokens to Base', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const baseReserves = await base.balanceOf(pool.address)
        const fyTokenReservesVirtual = await pool.getFYTokenReserves()
        const fyTokenReservesReal = await fyToken1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const lpTokensIn = toWad(1)

        await pool.approve(pool.address, lpTokensIn, { from: user1 })
        const tx = await pool.burnAndTrade(user1, user2, lpTokensIn, MAX, 0, 0, { from: user1 })

        const [baseFromBurn, fyTokenFromBurn] = burn(
          baseReserves.toString(),
          fyTokenReservesReal.toString(),
          supply.toString(),
          lpTokensIn.toString()
        )

        const [expectedBaseOut, expectedFYTokenOut] = burnAndTrade(
          baseReserves.toString(),
          fyTokenReservesVirtual.toString(),
          fyTokenReservesReal.toString(),
          supply.toString(),
          lpTokensIn.toString(),
          fyTokenFromBurn,
          timeTillMaturity.toString()
        )

        const baseOut = baseReserves.sub(await base.balanceOf(pool.address))

        expectEvent(tx, 'Liquidity', {
          from: user1,
          to: user2,
          baseTokens: baseOut.toString(),
          fyTokens: '0',
          poolTokens: lpTokensIn.neg().toString(),
        })

        almostEqual(baseOut, floor(expectedBaseOut).toFixed(), baseOut.div(new BN('10000')))
      })

      it('does not burn liquidity tokens if too little Base is obtained', async () => {
        const lpTokensIn = toWad(1)

        await pool.approve(pool.address, lpTokensIn, { from: user1 })
        await expectRevert(
          pool.burnAndTrade(user1, user2, lpTokensIn, MAX, MAX, 0, { from: user1 }),
          "Pool: Not enough Base obtained in burn"
        )
      })

      it('does not burn liquidity tokens if too little fyToken is obtained', async () => {
        const lpTokensIn = toWad(1)

        await pool.approve(pool.address, lpTokensIn, { from: user1 })
        await expectRevert(
          pool.burnAndTrade(user1, user2, lpTokensIn, MAX, 0, MAX, { from: user1 }),
          "Pool: Not enough FYToken obtained in burn"
        )
      })

      it('sells base', async () => {
        const baseReserves = await pool.getBaseReserves()
        const fyTokenReserves = await pool.getFYTokenReserves()
        const baseIn = toWad(1)

        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        assert.equal(
          await fyToken1.balanceOf(to),
          0,
          "'To' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(operator))
        )

        // Test preview since we are here
        const fyTokenOutPreview = await pool.sellBasePreview(baseIn, { from: operator })

        const expectedFYTokenOut = sellBase(
          baseReserves.toString(),
          fyTokenReserves.toString(),
          baseIn.toString(),
          timeTillMaturity.toString()
        )

        await pool.addDelegate(operator, { from: from })
        await base.mint(from, baseIn)
        await base.approve(pool.address, baseIn, { from: from })

        const tx = await pool.sellBase(from, to, baseIn, { from: operator })

        const fyTokenOut = await fyToken1.balanceOf(to)

        expectEvent(tx, 'Trade', {
          from: from,
          to: to,
          baseTokens: baseIn.neg().toString(),
          fyTokens: fyTokenOut.toString(),
        })

        assert.equal(await base.balanceOf(from), 0, "'From' wallet should have no base tokens")

        almostEqual(fyTokenOut, floor(expectedFYTokenOut).toFixed(), baseIn.divn(1000000))
        almostEqual(fyTokenOutPreview, floor(expectedFYTokenOut).toFixed(), baseIn.divn(1000000))
      })

      it('buys fyToken', async () => {
        const baseReserves = await pool.getBaseReserves()
        const fyTokenReserves = await pool.getFYTokenReserves()
        const fyTokenOut = toWad(1)
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        assert.equal(
          await fyToken1.balanceOf(to),
          0,
          "'To' wallet should have no fyToken, instead has " + (await fyToken1.balanceOf(to))
        )

        // Test preview since we are here
        const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut, { from: operator })

        const expectedBaseIn = buyFYToken(
          baseReserves.toString(),
          fyTokenReserves.toString(),
          fyTokenOut.toString(),
          timeTillMaturity.toString()
        )

        await pool.addDelegate(operator, { from: from })
        await base.mint(from, baseTokens)
        const baseBalanceBefore = await base.balanceOf(from)

        await base.approve(pool.address, baseTokens, { from: from })
        const tx = await pool.buyFYToken(from, to, fyTokenOut, { from: operator })

        const baseIn = baseBalanceBefore.sub(await base.balanceOf(from))

        expectEvent(tx, 'Trade', {
          from: from,
          to: to,
          baseTokens: baseIn.neg().toString(),
          fyTokens: fyTokenOut.toString(),
        })

        assert.equal(await fyToken1.balanceOf(to), fyTokenOut.toString(), "'To' wallet should have 1 fyToken token")

        almostEqual(baseIn, floor(expectedBaseIn).toFixed(), baseIn.divn(1000000))
        almostEqual(baseInPreview, floor(expectedBaseIn).toFixed(), baseIn.divn(1000000))
      })

      it("once mature, doesn't allow trading", async () => {
        await helper.advanceTime(31556952)
        await helper.advanceBlock()
        const oneToken = toWad(1)

        await expectRevert(pool.sellBasePreview(oneToken, { from: operator }), 'Pool: Too late')
        await expectRevert(pool.sellBase(from, to, oneToken, { from: from }), 'Pool: Too late')
        await expectRevert(pool.buyBasePreview(oneToken, { from: operator }), 'Pool: Too late')
        await expectRevert(pool.buyBase(from, to, oneToken, { from: from }), 'Pool: Too late')
        await expectRevert(pool.sellFYTokenPreview(oneToken, { from: operator }), 'Pool: Too late')
        await expectRevert(pool.sellFYToken(from, to, oneToken, { from: from }), 'Pool: Too late')
        await expectRevert(pool.buyFYTokenPreview(oneToken, { from: operator }), 'Pool: Too late')
        await expectRevert(pool.buyFYToken(from, to, oneToken, { from: from }), 'Pool: Too late')
      })
    })
  })
})
