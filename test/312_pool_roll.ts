import { artifacts, contract, web3 } from 'hardhat'

const Pool = artifacts.require('Pool')
const Dai = artifacts.require('DaiMock')
const FYDai = artifacts.require('FYDaiMock')
const YieldMath = artifacts.require('YieldMath')

const { floor } = require('mathjs')
import * as helper from 'ganache-time-traveler'
import { toWad, toRay, ZERO, MAX } from './shared/utils'
import { burn, mint, tradeAndMint, sellFYDai, sellDai } from './shared/yieldspace'
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
  const daiTokens = toWad(100)
  const fyDaiTokens = toWad(10)
  const initialDai = toWad(100)
  const initialFYDai = toWad(10)

  let snapshot: any
  let snapshotId: string

  let pool1: Contract, pool2: Contract, pool3: Contract
  let dai: Contract
  let fyDai1: Contract, fyDai2: Contract
  let maturity1: BN, maturity2: BN

  before(async () => {
    const yieldMathLibrary = await YieldMath.new()
    await Pool.link(yieldMathLibrary)
  })

  beforeEach(async () => {
    snapshot = await helper.takeSnapshot()
    snapshotId = snapshot['result']

    // Setup dai
    dai = await Dai.new()

    // Setup fyDai
    maturity1 = (await currentTimestamp()).addn(31556952) // One year
    fyDai1 = await FYDai.new(dai.address, maturity1)
    maturity2 = (await currentTimestamp()).addn(31556952 * 2) // Two years
    fyDai2 = await FYDai.new(dai.address, maturity2)

    // Setup Pools
    pool1 = await Pool.new(dai.address, fyDai1.address, 'Name', 'Symbol', {
      from: owner,
    })
    // Setup Pools
    pool2 = await Pool.new(dai.address, fyDai2.address, 'Name', 'Symbol', {
      from: owner,
    })
    pool3 = await Pool.new(dai.address, fyDai1.address, 'Name', 'Symbol', {
      from: owner,
    })

    await dai.mint(owner, initialDai.muln(3))
    await dai.approve(pool1.address, MAX, { from: owner })
    await dai.approve(pool2.address, MAX, { from: owner })
    await dai.approve(pool3.address, MAX, { from: owner })
    await pool1.init(initialDai, { from: owner })
    await pool2.init(initialDai, { from: owner })
    await pool3.init(initialDai, { from: owner })

    await fyDai1.mint(owner, initialFYDai.muln(2), { from: owner })
    await fyDai1.approve(pool1.address, MAX, { from: owner })
    await fyDai1.approve(pool3.address, MAX, { from: owner })
    await pool1.sellFYDai(owner, owner, initialFYDai, { from: owner })
    await pool3.sellFYDai(owner, owner, initialFYDai, { from: owner })

    await fyDai2.mint(owner, initialFYDai, { from: owner })
    await fyDai2.approve(pool2.address, MAX, { from: owner })
    await pool2.sellFYDai(owner, owner, initialFYDai, { from: owner })

    await pool1.addDelegate(pool3.address, { from: owner })
    await pool1.addDelegate(pool2.address, { from: owner })
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  it('Reverts if not enough Dai is available to mint in pool 2', async () => {
    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(1), toWad(1), 0, 0),
      'Pool: Not enough Dai from burn'
    )
  })

  it('Reverts if not enough fyDai is available to mint in pool 2', async () => {
    await fyDai1.mint(owner, initialFYDai, { from: owner })
    await pool3.sellFYDai(owner, owner, initialFYDai, { from: owner }) // pool3 now requires more fyDai to mint than pool1

    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(10), toWad(2), 0, 0),
      'Pool: Not enough FYDai from burn'
    )
  })

  it('Reverts if not enough lp tokens are minted', async () => {
    await expectRevert(
      pool3.rollLiquidity(owner, owner, pool1.address, toWad(10), toWad(1), 0, MAX),
      'Pool: Not enough minted'
    )
  })

  it('Rolls liquidity', async () => {
    const [daiFromBurn, fyDaiFromBurn] = burn(
      (await dai.balanceOf(pool1.address)).toString(),
      (await fyDai1.balanceOf(pool1.address)).toString(),
      (await pool1.totalSupply()).toString(),
      toWad(20).toString()
    )
    const [expectedMinted, expectedDaiIn] = mint(
      (await dai.balanceOf(pool3.address)).add(new BN(daiFromBurn.toString())).toString(),
      (await fyDai1.balanceOf(pool3.address)).add(new BN(fyDaiFromBurn.toString())).toString(),
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
    const [daiFromBurn, fyDaiFromBurn] = burn(
      (await dai.balanceOf(pool1.address)).toString(),
      (await fyDai1.balanceOf(pool1.address)).toString(),
      (await pool1.totalSupply()).toString(),
      toWad(20).toString()
    )
    const [expectedMinted, expectedDaiIn] = tradeAndMint(
      (await dai.balanceOf(pool3.address)).add(new BN(daiFromBurn.toString())).toString(),
      (await pool3.getFYDaiReserves()).add(new BN(fyDaiFromBurn.toString())).toString(),
      (await fyDai1.balanceOf(pool3.address)).add(new BN(fyDaiFromBurn.toString())).toString(),
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

  it('Rolls fyDai', async () => {
    const fyDaiIn = toWad(10)
    await fyDai1.mint(owner, fyDaiIn, { from: owner })

    const daiIn = sellFYDai(
      (await pool1.getDaiReserves()).toString(),
      (await pool1.getFYDaiReserves()).toString(),
      fyDaiIn.toString(),
      maturity1.sub(await currentTimestamp()).toString()
    )
    const fyDaiOut = sellDai(
      (await pool2.getDaiReserves()).toString(),
      (await pool2.getFYDaiReserves()).toString(),
      daiIn.toString(),
      maturity2.sub(await currentTimestamp()).toString()
    )

    const fyDai2Before = await fyDai2.balanceOf(owner)
    await pool2.rollFYDai(owner, owner, pool1.address, fyDaiIn)

    almostEqual((await fyDai2.balanceOf(owner)).sub(fyDai2Before), floor(fyDaiOut).toFixed(), fyDaiIn.divn(1000000))
  })
})
