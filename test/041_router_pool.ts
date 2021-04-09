import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { OPS, WAD, MAX256 as MAX, CALCULATE_FROM_BASE } from './shared/constants'

import { PoolFactory } from '../typechain/PoolFactory'
import { PoolRouter } from '../typechain/PoolRouter'
import { Pool } from '../typechain/Pool'
import { BaseMock as Base, BaseMock } from '../typechain/BaseMock'
import { FYTokenMock as FYToken, FYTokenMock } from '../typechain/FYTokenMock'

import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolRouter', async function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory
  let router: PoolRouter
  let base: BaseMock
  let fyToken1: FYTokenMock
  let fyToken2: FYTokenMock
  let pool1: Pool
  let pool2: Pool

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturity1Id = '3M'
  const fyToken1Id = baseId + '-' + maturity1Id
  const maturity2Id = '3M'
  const fyToken2Id = baseId + '-' + maturity2Id

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturity1Id, maturity2Id], BigNumber.from('0'))
  }
  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    router = yieldSpace.router as PoolRouter
    base = yieldSpace.bases.get(baseId) as BaseMock
    fyToken1 = yieldSpace.fyTokens.get(fyToken1Id) as FYTokenMock
    fyToken2 = yieldSpace.fyTokens.get(fyToken2Id) as FYTokenMock
    pool1 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken1Id) as Pool
    pool2 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken2Id) as Pool
  })

  it('transfers base tokens to a pool', async () => {
    const baseBefore = await base.balanceOf(pool1.address)
    await base.mint(owner, WAD)
    await base.approve(router.address, WAD)
    await router.transferToPool(base.address, fyToken1.address, base.address, WAD)
    expect(await base.balanceOf(pool1.address)).to.equal(baseBefore.add(WAD))
  })

  it('transfers fyTokens to a pool', async () => {
    const fyTokensBefore = await fyToken1.balanceOf(pool1.address)
    await fyToken1.mint(owner, WAD)
    await fyToken1.approve(router.address, WAD)
    await router.transferToPool(base.address, fyToken1.address, fyToken1.address, WAD)
    expect(await fyToken1.balanceOf(pool1.address)).to.equal(fyTokensBefore.add(WAD))
  })

  it('transfers pool tokens to a pool', async () => {
    await base.mint(pool1.address, WAD)
    await fyToken1.mint(pool1.address, WAD)
    await pool1.mint(owner, CALCULATE_FROM_BASE, WAD)

    const poolTokensBefore = await pool1.balanceOf(pool1.address)
    await pool1.approve(router.address, WAD)
    await router.transferToPool(base.address, fyToken1.address, pool1.address, WAD)
    expect(await pool1.balanceOf(pool1.address)).to.equal(poolTokensBefore.add(WAD))
  })

  it('transfers tokens to a pool with multicall', async () => {
    const baseBefore = await base.balanceOf(pool1.address)
    await base.mint(owner, WAD)
    await base.approve(router.address, WAD)

    const transferToPoolCall = router.interface.encodeFunctionData('transferToPool', [
      base.address,
      fyToken1.address,
      base.address,
      WAD,
    ])
    await router.multicall([transferToPoolCall], true)

    expect(await base.balanceOf(pool1.address)).to.equal(baseBefore.add(WAD))
  })

  it('transfers tokens to a pool with batch', async () => {
    const baseBefore = await base.balanceOf(pool1.address)
    await base.mint(owner, WAD)
    await base.approve(router.address, WAD)

    const transferToPoolData = ethers.utils.defaultAbiCoder.encode(['address', 'uint128'], [base.address, WAD])
    await router.batch([base.address], [fyToken1.address], [0], [OPS.TRANSFER_TO_POOL], [transferToPoolData])

    expect(await base.balanceOf(pool1.address)).to.equal(baseBefore.add(WAD))
  })

  describe('with unaccounted tokens in a pool', () => {
    beforeEach(async () => {
      await base.mint(owner, WAD)
      await base.approve(router.address, WAD)
      await router.transferToPool(base.address, fyToken1.address, base.address, WAD)
    })

    it('retrieves tokens from a pool using route', async () => {
      const baseBefore = await base.balanceOf(owner)
      const retrieveTokenCall = pool1.interface.encodeFunctionData('retrieveBaseToken', [owner])
      await router.route(base.address, fyToken1.address, retrieveTokenCall)
      expect(await base.balanceOf(owner)).to.equal(baseBefore.add(WAD))
    })

    it('wraps a route in a batch', async () => {
      const baseBefore = await base.balanceOf(owner)
      const retrieveTokenCall = pool1.interface.encodeFunctionData('retrieveBaseToken', [owner])
      await router.batch([base.address], [fyToken1.address], [0], [OPS.ROUTE], [retrieveTokenCall])
      expect(await base.balanceOf(owner)).to.equal(baseBefore.add(WAD))
    })
  })
})
