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

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

async function currentTimestamp() {
  return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
}

import { mint, mintWithBase, burn, burnForBase } from './shared/yieldspace'
const WAD = BigNumber.from('1000000000000000000')

describe('Pool - mint', async function () {
  this.timeout(0)

  // These values impact the pool results
  const baseTokens = BigNumber.from('1000000000000000000000000')
  const fyTokenTokens = baseTokens
  const initialBase = baseTokens
  const OVERRIDES = { gasLimit: 1_000_000 }

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  let pool: Pool
  let poolFromUser1: Pool

  let base: Base
  let fyToken: FYToken
  let maturity: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyTokenId = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [fyTokenId], BigNumber.from('0'))
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
    factory = yieldSpace.factory as PoolFactory
    base = yieldSpace.bases.get(baseId) as Base
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken

    // Deploy a fresh pool so that we can test initialization
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)

    maturity = BigNumber.from(await fyToken.maturity())
  })

  it('should setup pool', async () => {
    const b = BigNumber.from('18446744073709551615')
    const k = b.div('126144000')
    expect(await pool.getK()).to.be.equal(k)
  })

  it('adds initial liquidity', async () => {
    await base.mint(pool.address, initialBase)

    await expect(poolFromUser1.mint(user2))
      .to.emit(pool, 'Liquidity')
      .withArgs(maturity, user1, user2, initialBase.mul(-1), 0, initialBase)

    expect(await poolFromUser1.balanceOf(user2)).to.equal(
      initialBase,
      'User2 should have ' + initialBase + ' liquidity tokens'
    )

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  it('syncs reserves after donations', async () => {
    await base.mint(pool.address, initialBase)
    await fyToken.mint(pool.address, initialBase.div(9))

    await expect(poolFromUser1.sync()).to.emit(pool, 'Sync')

    expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
    expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await base.mint(pool.address, initialBase)
      await poolFromUser1.mint(user1)

      const additionalFYTokenReserves = initialBase.div(9)
      // Skew the reserves without using trading functions
      await fyToken.mint(pool.address, additionalFYTokenReserves)
      await pool.sync()
    })

    it('mints liquidity tokens', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReserves = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()
      const baseIn = WAD

      const [expectedMinted, expectedFYTokenIn] = mint(baseReserves, fyTokenReserves, supply, baseIn)

      await base.mint(user1, baseIn)
      await fyToken.mint(user1, fyTokenTokens)

      const poolTokensBefore = await pool.balanceOf(user2)

      await base.connect(user1Acc).transfer(pool.address, WAD)
      await fyToken.connect(user1Acc).transfer(pool.address, expectedFYTokenIn)
      await expect(poolFromUser1.mint(user2))
        .to.emit(pool, 'Liquidity')
        .withArgs(maturity, user1, user2, WAD.mul(-1), expectedFYTokenIn.mul(-1), expectedMinted)

      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, baseIn.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('mints liquidity tokens with base only', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReservesVirtual = await pool.getFYTokenReserves()
      const fyTokenReservesReal = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()

      const timeTillMaturity = maturity.sub(await currentTimestamp())
      const fyTokenToBuy = WAD.div(1000)

      const [expectedMinted, expectedBaseIn] = mintWithBase(
        baseReserves,
        fyTokenReservesVirtual,
        fyTokenReservesReal,
        supply,
        fyTokenToBuy,
        timeTillMaturity
      )

      const poolTokensBefore = await pool.balanceOf(user2)
      const poolSupplyBefore = await pool.totalSupply()
      const storedBaseReservesBefore = (await pool.getStoredReserves())[0]
      const storedFYTokenReservesBefore = (await pool.getStoredReserves())[1]
      // const baseBefore = await base.balanceOf(user1)

      await base.mint(pool.address, expectedBaseIn)

      await expect(poolFromUser1.mintWithBaseToken(user2, fyTokenToBuy, OVERRIDES))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          ((await pool.getStoredReserves())[0]).sub(storedBaseReservesBefore).mul(-1),
          0,
          (await pool.totalSupply()).sub(poolSupplyBefore)
        )

      const baseIn = ((await pool.getStoredReserves())[0]).sub(storedBaseReservesBefore)
      const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)

      almostEqual(minted, expectedMinted, minted.div(10000))

      almostEqual(baseIn, expectedBaseIn, baseIn.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(storedBaseReservesBefore.add(baseIn))
      expect((await pool.getStoredReserves())[1]).to.equal(storedFYTokenReservesBefore.add(minted))
    })

    it('burns liquidity tokens', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReserves = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()
      const lpTokensIn = WAD

      await poolFromUser1.approve(pool.address, lpTokensIn)
      await expect(poolFromUser1.burn(user2, lpTokensIn))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          baseReserves.sub(await base.balanceOf(pool.address)),
          fyTokenReserves.sub(await fyToken.balanceOf(pool.address)),
          lpTokensIn.mul(-1)
        )

      const [expectedBaseOut, expectedFYTokenOut] = burn(baseReserves, fyTokenReserves, supply, lpTokensIn)

      const baseOut = baseReserves.sub(await base.balanceOf(pool.address))
      const fyTokenOut = fyTokenReserves.sub(await fyToken.balanceOf(pool.address))

      almostEqual(baseOut, expectedBaseOut, baseOut.div(10000))
      almostEqual(fyTokenOut, expectedFYTokenOut, fyTokenOut.div(10000))
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })

    it('burns liquidity tokens to Base', async () => {
      const baseReserves = await base.balanceOf(pool.address)
      const fyTokenReservesVirtual = await pool.getFYTokenReserves()
      const fyTokenReservesReal = await fyToken.balanceOf(pool.address)
      const supply = await pool.totalSupply()

      const timeTillMaturity = maturity.sub(await currentTimestamp())
      const lpTokensIn = WAD.mul(2) // TODO: Why does it run out of gas with 1 WAD?

      await poolFromUser1.approve(pool.address, lpTokensIn)
      await expect(poolFromUser1.burnForBaseToken(user2, lpTokensIn, OVERRIDES))
        .to.emit(pool, 'Liquidity')
        .withArgs(
          maturity,
          user1,
          user2,
          baseReserves.sub(await base.balanceOf(pool.address)),
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
      expect((await pool.getStoredReserves())[0]).to.equal(await pool.getBaseTokenReserves())
      expect((await pool.getStoredReserves())[1]).to.equal(await pool.getFYTokenReserves())
    })
  })
})
