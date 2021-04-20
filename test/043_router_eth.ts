import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, ETH } = constants

import { OPS } from './shared/constants'

import { PoolFactory } from '../typechain/PoolFactory'
import { PoolRouter } from '../typechain/PoolRouter'
import { Pool } from '../typechain/Pool'
import { WETH9Mock as WETH } from '../typechain/WETH9Mock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'

import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolRouter', async function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string
  let other: string
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory
  let router: PoolRouter
  let weth: WETH
  let fyEth: FYToken
  let pool: Pool

  const maturityId = '3M'
  const fyEthId = ETH + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [], [maturityId], BigNumber.from('0'))
  }
  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    other = signers[1].address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    router = yieldSpace.router as PoolRouter
    weth = (yieldSpace.bases.get(ETH) as unknown) as WETH
    fyEth = yieldSpace.fyTokens.get(fyEthId) as FYToken
    pool = (yieldSpace.pools.get(ETH) as Map<string, Pool>).get(fyEthId) as Pool
  })

  it('users can join ETH to a WETH pool', async () => {
    await router.joinEther(weth.address, fyEth.address, { value: WAD })
    expect(await weth.balanceOf(pool.address)).to.equal(WAD)
  })

  it('users can join ETH to a WETH pool in a batch', async () => {
    const joinEtherData = ethers.utils.defaultAbiCoder.encode([], [])
    await router.batch([weth.address], [fyEth.address], [0], [OPS.JOIN_ETHER], [joinEtherData], { value: WAD })

    expect(await weth.balanceOf(pool.address)).to.equal(WAD)
  })

  describe('with Weth in the router', async () => {
    beforeEach(async () => {
      await weth.deposit({ value: WAD })
      await weth.transfer(router.address, WAD)
    })

    it('users can withdraw ETH', async () => {
      const balanceBefore = await ethers.provider.getBalance(other)
      await router.exitEther(other, { value: WAD })
      expect(await ethers.provider.getBalance(other)).to.equal(balanceBefore.add(WAD))
    })

    it('users can withdraw ETH in a batch', async () => {
      const balanceBefore = await ethers.provider.getBalance(other)
      const exitEtherData = ethers.utils.defaultAbiCoder.encode(['address'], [other])
      await router.batch([weth.address], [fyEth.address], [0], [OPS.EXIT_ETHER], [exitEtherData])
      expect(await ethers.provider.getBalance(other)).to.equal(balanceBefore.add(WAD))
    })
  })
})
