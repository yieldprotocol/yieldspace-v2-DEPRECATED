import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { PoolFactory } from '../typechain/PoolFactory'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'

import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolFactory', async () => {
  let ownerAcc: SignerWithAddress
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [], [], BigNumber.from('0'))
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
  })

  it('should create pools', async () => {
    const BaseFactory = await ethers.getContractFactory('BaseMock')
    const FYTokenFactory = await ethers.getContractFactory('FYTokenMock')
    const base = ((await BaseFactory.deploy()) as unknown) as Base
    await base.deployed()

    const { timestamp } = await ethers.provider.getBlock('latest')
    const maturity1 = timestamp + 31556952 // One year
    const fyToken1 = ((await FYTokenFactory.deploy(base.address, maturity1)) as unknown) as FYToken
    await fyToken1.deployed()

    const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken1.address)
    await factory.createPool(base.address, fyToken1.address)

    const pool = await ethers.getContractAt('Pool', calculatedAddress)
    expect(await pool.baseToken()).to.equal(base.address, 'Pool has the wrong base address')
    expect(await pool.fyToken()).to.equal(fyToken1.address, 'Pool has the wrong fyToken address')
    expect(await pool.name()).to.equal('Yield Test LP Token', 'Pool has the wrong name')
    expect(await pool.symbol()).to.equal('TSTLP', 'Pool has the wrong symbol')
  })
})
