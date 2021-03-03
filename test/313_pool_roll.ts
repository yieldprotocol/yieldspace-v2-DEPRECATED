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
import { burn, mint, tradeAndMint, sellFYToken, sellBase } from './shared/yieldspace'
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
  const fyTokenTokens = toWad(10)
  const initialBase = toWad(100)
  const initialFYToken = toWad(10)

  let snapshot: any
  let snapshotId: string

  let pool1: Contract, pool2: Contract, pool3: Contract
  let base: Contract
  let fyToken1: Contract, fyToken2: Contract
  let maturity1: BN, maturity2: BN

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
    maturity2 = (await currentTimestamp()).addn(31556952 * 2) // Two years
    fyToken2 = await FYToken.new(base.address, maturity2)

    // Setup Pools
    const factory = await PoolFactory.new();
    pool1 = await factory.createPool(base.address, fyToken1.address, {
      from: owner,
    })
    let poolAddress = await factory.calculatePoolAddress(base.address, fyToken1.address)
    pool1 = await Pool.at(poolAddress)

    pool2 = await factory.createPool(base.address, fyToken2.address, {
      from: owner,
    })
    poolAddress = await factory.calculatePoolAddress(base.address, fyToken2.address)
    pool2 = await Pool.at(poolAddress)

    /*
    pool3 = await factory.createPool(base.address, fyToken1.address, {
      from: owner,
    })
    poolAddress = await factory.calculatePoolAddress(base.address, fyToken1.address)
    pool3 = await Pool.at(poolAddress)
    */

    await base.mint(owner, initialBase.muln(3))
    await base.approve(pool1.address, MAX, { from: owner })
    await base.approve(pool2.address, MAX, { from: owner })
    // await base.approve(pool3.address, MAX, { from: owner })
    await pool1.init(initialBase, { from: owner })
    await pool2.init(initialBase, { from: owner })
    // await pool3.init(initialBase, { from: owner })

    await fyToken1.mint(owner, initialFYToken.muln(2), { from: owner })
    await fyToken1.approve(pool1.address, MAX, { from: owner })
    // await fyToken1.approve(pool3.address, MAX, { from: owner })
    await pool1.sellFYToken(owner, owner, initialFYToken, { from: owner })
    // await pool3.sellFYToken(owner, owner, initialFYToken, { from: owner })

    await fyToken2.mint(owner, initialFYToken, { from: owner })
    await fyToken2.approve(pool2.address, MAX, { from: owner })
    await pool2.sellFYToken(owner, owner, initialFYToken, { from: owner })

    // await pool1.addDelegate(pool3.address, { from: owner })
    await pool1.addDelegate(pool2.address, { from: owner })
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  /*
  it('Reverts if not enough Base is available to mint in pool 2', async () => {
    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(1), toWad(1), 0, 0),
      'Pool: Not enough Base from burn'
    )
  })

  it('Reverts if not enough fyToken is available to mint in pool 2', async () => {
    await fyToken1.mint(owner, initialFYToken, { from: owner })
    await pool3.sellFYToken(owner, owner, initialFYToken, { from: owner }) // pool3 now requires more fyToken to mint than pool1

    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(10), toWad(2), 0, 0),
      'Pool: Not enough FYToken from burn'
    )
  })

  it('Reverts if not enough lp tokens are minted', async () => {
    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(10), toWad(1), 0, MAX),
      'Pool: Not enough minted'
    )
  })

  it('Rolls liquidity', async () => {
    const [baseFromBurn, fyTokenFromBurn] = burn(
      (await base.balanceOf(pool1.address)).toString(),
      (await fyToken1.balanceOf(pool1.address)).toString(),
      (await pool1.totalSupply()).toString(),
      toWad(20).toString()
    )
    const [expectedMinted, expectedBaseIn] = mint(
      (await base.balanceOf(pool3.address)).add(new BN(baseFromBurn.toString())).toString(),
      (await fyToken1.balanceOf(pool3.address)).add(new BN(fyTokenFromBurn.toString())).toString(),
      (await pool3.totalSupply()).toString(),
      toWad(1).toString()
    )

    const lpTokensBefore = await pool3.balanceOf(owner)
    await pool3.rollLiquidity(owner, owner, pool1.address, toWad(20), toWad(1), 0, 0)
    const lpTokensOut = (await pool3.balanceOf(owner)).sub(lpTokensBefore)

    almostEqual(lpTokensOut, floor(expectedMinted).toFixed(), lpTokensOut.divn(1000000))
    // This test only verifies that the number of tokens minted matches the expectation
  })

  it('Rolls liquidity with trading', async () => {
    const [baseFromBurn, fyTokenFromBurn] = burn(
      (await base.balanceOf(pool1.address)).toString(),
      (await fyToken1.balanceOf(pool1.address)).toString(),
      (await pool1.totalSupply()).toString(),
      toWad(20).toString()
    )
    const [expectedMinted, expectedBaseIn] = tradeAndMint(
      (await base.balanceOf(pool3.address)).add(new BN(baseFromBurn.toString())).toString(),
      (await pool3.getFYTokenReserves()).add(new BN(fyTokenFromBurn.toString())).toString(),
      (await fyToken1.balanceOf(pool3.address)).add(new BN(fyTokenFromBurn.toString())).toString(),
      (await pool3.totalSupply()).toString(),
      toWad(1).toString(),
      toWad(0.5).toString(),
      maturity1.sub(await currentTimestamp()).toString()
    )

    const lpTokensBefore = await pool3.balanceOf(owner)
    await pool3.rollLiquidity(owner, owner, pool1.address, toWad(20), toWad(1), toWad(0.5), 0)
    const lpTokensOut = (await pool3.balanceOf(owner)).sub(lpTokensBefore)

    almostEqual(lpTokensOut, floor(expectedMinted).toFixed(), lpTokensOut.divn(1000000))
    // This test only verifies that the number of tokens minted matches the expectation
  })
  */

  it('Rolls fyToken', async () => {
    const fyTokenIn = toWad(10)
    await fyToken1.mint(owner, fyTokenIn, { from: owner })

    const baseIn = sellFYToken(
      (await pool1.getBaseReserves()).toString(),
      (await pool1.getFYTokenReserves()).toString(),
      fyTokenIn.toString(),
      maturity1.sub(await currentTimestamp()).toString()
    )
    const fyTokenOut = sellBase(
      (await pool2.getBaseReserves()).toString(),
      (await pool2.getFYTokenReserves()).toString(),
      baseIn.toString(),
      maturity2.sub(await currentTimestamp()).toString()
    )

    const fyToken2Before = await fyToken2.balanceOf(owner)
    await pool2.rollFYToken(owner, owner, pool1.address, fyTokenIn)

    almostEqual((await fyToken2.balanceOf(owner)).sub(fyToken2Before), floor(fyTokenOut).toFixed(), fyTokenIn.divn(1000000))
  })
})
