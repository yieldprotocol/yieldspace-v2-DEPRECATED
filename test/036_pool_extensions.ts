import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
import { CALCULATE_FROM_BASE } from '../src/constants'

import { PoolEstimator } from './shared/poolEstimator'
import { Pool, YieldMathExtensions, YieldMath, YieldMath__factory } from '../typechain'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber, utils } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
import { PoolView } from '../typechain/PoolView'
import { PoolView__factory } from '../typechain/factories/PoolView__factory'

const { MAX128, USDC } = constants
const MAX = MAX128

const { parseUnits } = utils

const { loadFixture } = waffle

describe('YieldMathExtensions - allowances', async function () {
  this.timeout(0)

  const oneUSDC = BigNumber.from(parseUnits('1', 6))
  const bases = oneUSDC.mul(1_000_000)
  const OVERRIDES = { gasLimit: 1_000_000 }

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string

  let yieldSpace: YieldSpaceEnvironment

  let pool: Pool
  let poolEstimator: PoolEstimator
  let poolView: PoolView

  let base: Base
  let fyToken: FYToken
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
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolEstimator = await PoolEstimator.setup(pool)
    maturity = BigNumber.from(await fyToken.maturity())

    await base.mint(pool.address, bases)
    await pool.connect(user1Acc).mint(user1, CALCULATE_FROM_BASE, 0, MAX)

    const yieldMathLibrary = await ((await ethers.getContractFactory('YieldMath')) as YieldMath__factory).deploy()
    await yieldMathLibrary.deployed()
    const yieldMathExtensionsLibrary = await ((await ethers.getContractFactory('YieldMathExtensions', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
      },
    })) as YieldMath__factory).deploy()
    await yieldMathExtensionsLibrary.deployed()
    poolView = await ((await ethers.getContractFactory('PoolView', {
      libraries: {
        YieldMathExtensions: yieldMathExtensionsLibrary.address,
      },
    })) as PoolView__factory).deploy()
    await poolView.deployed()
  })

  it('computes the retrievable base', async () => {
    const retrievableBaseBefore = await poolView.retrievableBase(pool.address)
    await base.mint(pool.address, oneUSDC)
    expect(await poolView.retrievableBase(pool.address)).to.equal(retrievableBaseBefore.add(oneUSDC))
  })

  it('computes the retrievable fyToken', async () => {
    const retrievableFYTokenBefore = await poolView.retrievableFYToken(pool.address)
    await fyToken.mint(pool.address, oneUSDC)
    expect(await poolView.retrievableFYToken(pool.address)).to.equal(retrievableFYTokenBefore.add(oneUSDC))
  })

  it('computes the pool allowances after fyToken sale', async () => {
    //given
    const maxFYTokenInBefore = await poolView.maxFYTokenIn(pool.address)
    const maxFYTokenOutBefore = await poolView.maxFYTokenOut(pool.address)
    const maxBaseInBefore = await poolView.maxBaseIn(pool.address)
    const maxBaseOutBefore = await poolView.maxBaseOut(pool.address)
    const fyTokenIn = oneUSDC

    expect(maxFYTokenInBefore).to.be.gt(0)
    expect(maxBaseOutBefore).to.be.gt(0)
    expect(maxFYTokenOutBefore).to.be.eq(0)
    expect(maxBaseInBefore).to.be.eq(0)
    const baseBefore = await pool.getBaseBalance()
    expect(await pool.sellFYTokenPreview(maxFYTokenInBefore)).to.be.lt(baseBefore)
    expect(maxBaseOutBefore).to.be.lt(baseBefore)

    //when
    await fyToken.mint(pool.address, fyTokenIn)
    await expect(pool.connect(user1Acc).sellFYToken(user2, 0))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

    //then
    const maxFYTokenIn = await poolView.maxFYTokenIn(pool.address)
    const maxFYTokenOut = await poolView.maxFYTokenOut(pool.address)
    const maxBaseIn = await poolView.maxBaseIn(pool.address)
    const maxBaseOut = await poolView.maxBaseOut(pool.address)

    expect(maxFYTokenInBefore).to.be.gt(maxFYTokenIn)
    expect(maxFYTokenOutBefore).to.be.lt(maxFYTokenOut)
    expect(maxBaseInBefore).to.be.lt(maxBaseIn)
    expect(maxBaseOutBefore).to.be.gt(maxBaseOut)

    expect(await pool.buyFYTokenPreview(maxFYTokenOut)).to.be.gt(0)
    expect(await pool.sellBasePreview(maxBaseIn)).to.be.gt(0)
    const baseAfter = await pool.getBaseBalance()
    expect(await pool.sellFYTokenPreview(maxFYTokenIn)).to.be.lt(baseAfter)
    expect(maxBaseOut).to.be.lt(baseAfter)

    // YieldMath is not 100%, so some times is 1 wei off, but on the safe side
    await expect(pool.buyFYTokenPreview(maxFYTokenOut.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
    await expect(pool.sellBasePreview(maxBaseIn.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
  })

  it('computes the pool allowances after base purchase', async () => {
    //given
    const maxFYTokenInBefore = await poolView.maxFYTokenIn(pool.address)
    const maxFYTokenOutBefore = await poolView.maxFYTokenOut(pool.address)
    const maxBaseInBefore = await poolView.maxBaseIn(pool.address)
    const maxBaseOutBefore = await poolView.maxBaseOut(pool.address)
    const fyTokenCachedBefore = (await pool.getCache())[1]
    const baseOut = oneUSDC

    //when
    await fyToken.mint(pool.address, await pool.connect(user1Acc).buyBasePreview(baseOut))
    await expect(pool.connect(user1Acc).buyBase(user2, baseOut, MAX, OVERRIDES))
      .to.emit(pool, 'Trade')
      .withArgs(maturity, user1, user2, baseOut, (await pool.getCache())[1].sub(fyTokenCachedBefore).mul(-1))

    //then
    const maxFYTokenIn = await poolView.maxFYTokenIn(pool.address)
    const maxFYTokenOut = await poolView.maxFYTokenOut(pool.address)
    const maxBaseIn = await poolView.maxBaseIn(pool.address)
    const maxBaseOut = await poolView.maxBaseOut(pool.address)

    expect(maxFYTokenInBefore).to.be.gt(maxFYTokenIn)
    expect(maxFYTokenOutBefore).to.be.lt(maxFYTokenOut)
    expect(maxBaseInBefore).to.be.lt(maxBaseIn)
    expect(maxBaseOutBefore).to.be.gt(maxBaseOut)

    expect(await pool.buyFYTokenPreview(maxFYTokenOut)).to.be.gt(0)
    expect(await pool.sellBasePreview(maxBaseIn)).to.be.gt(0)
    const baseAfter = await pool.getBaseBalance()
    expect(await pool.sellFYTokenPreview(maxFYTokenIn)).to.be.lt(baseAfter)
    expect(maxBaseOut).to.be.lt(baseAfter)

    // YieldMath is not 100%, so some times is 1 wei off, but on the safe side
    await expect(pool.buyFYTokenPreview(maxFYTokenOut.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
    await expect(pool.sellBasePreview(maxBaseIn.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
  })

  describe('with extra fyToken balance', () => {
    beforeEach(async () => {
      const additionalFYTokenBalance = oneUSDC.mul(30)
      await fyToken.mint(pool.address, additionalFYTokenBalance)
      await pool.sellFYToken(owner, 0)
    })

    it('computes the pool allowances after base sale', async () => {
      //given
      const maxFYTokenInBefore = await poolView.maxFYTokenIn(pool.address)
      const maxFYTokenOutBefore = await poolView.maxFYTokenOut(pool.address)
      const maxBaseInBefore = await poolView.maxBaseIn(pool.address)
      const maxBaseOutBefore = await poolView.maxBaseOut(pool.address)
      const baseIn = oneUSDC

      //when
      await base.mint(pool.address, baseIn)
      await expect(pool.connect(user1Acc).sellBase(user2, 0, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

      //then
      const maxFYTokenIn = await poolView.maxFYTokenIn(pool.address)
      const maxFYTokenOut = await poolView.maxFYTokenOut(pool.address)
      const maxBaseIn = await poolView.maxBaseIn(pool.address)
      const maxBaseOut = await poolView.maxBaseOut(pool.address)

      expect(maxFYTokenInBefore).to.be.lt(maxFYTokenIn)
      expect(maxFYTokenOutBefore).to.be.gt(maxFYTokenOut)
      expect(maxBaseInBefore).to.be.gt(maxBaseIn)
      expect(maxBaseOutBefore).to.be.lt(maxBaseOut)

      expect(await pool.buyFYTokenPreview(maxFYTokenOut)).to.be.gt(0)
      expect(await pool.sellBasePreview(maxBaseIn)).to.be.gt(0)
      const baseAfter = await pool.getBaseBalance()
      expect(await pool.sellFYTokenPreview(maxFYTokenIn)).to.be.lt(baseAfter)
      expect(maxBaseOut).to.be.lt(baseAfter)

      // YieldMath is not 100%, so some times is 1 wei off, but on the safe side
      await expect(pool.buyFYTokenPreview(maxFYTokenOut.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
      await expect(pool.sellBasePreview(maxBaseIn.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
    })

    it('computes the pool allowances after fyToken purchase', async () => {
      //given
      const maxFYTokenInBefore = await poolView.maxFYTokenIn(pool.address)
      const maxFYTokenOutBefore = await poolView.maxFYTokenOut(pool.address)
      const maxBaseInBefore = await poolView.maxBaseIn(pool.address)
      const maxBaseOutBefore = await poolView.maxBaseOut(pool.address)
      const baseCachedBefore = (await pool.getCache())[0]
      const fyTokenOut = oneUSDC

      //when
      await base.mint(pool.address, await pool.buyFYTokenPreview(fyTokenOut))
      await expect(pool.connect(user1Acc).buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(maturity, user1, user2, (await pool.getCache())[0].sub(baseCachedBefore).mul(-1), fyTokenOut)

      //then
      const maxFYTokenIn = await poolView.maxFYTokenIn(pool.address)
      const maxFYTokenOut = await poolView.maxFYTokenOut(pool.address)
      const maxBaseIn = await poolView.maxBaseIn(pool.address)
      const maxBaseOut = await poolView.maxBaseOut(pool.address)

      expect(maxFYTokenInBefore).to.be.lt(maxFYTokenIn)
      expect(maxFYTokenOutBefore).to.be.gt(maxFYTokenOut)
      expect(maxBaseInBefore).to.be.gt(maxBaseIn)
      expect(maxBaseOutBefore).to.be.lt(maxBaseOut)

      expect(await pool.buyFYTokenPreview(maxFYTokenOut)).to.be.gt(0)
      expect(await pool.sellBasePreview(maxBaseIn)).to.be.gt(0)
      const baseAfter = await pool.getBaseBalance()
      expect(await pool.sellFYTokenPreview(maxFYTokenIn)).to.be.lt(baseAfter)
      expect(maxBaseOut).to.be.lt(baseAfter)

      // YieldMath is not 100%, so some times is 1 wei off, but on the safe side
      await expect(pool.buyFYTokenPreview(maxFYTokenOut.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
      await expect(pool.sellBasePreview(maxBaseIn.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
    })
  })
})
