import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Dai } from '../typechain/DaiMock'
import { FYDaiMock as FYToken } from '../typechain/FYDaiMock'

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
    const DaiFactory = await ethers.getContractFactory('DaiMock')
    const FYTokenFactory = await ethers.getContractFactory('FYDaiMock')
    const dai = ((await DaiFactory.deploy()) as unknown) as Dai
    await dai.deployed()

    const { timestamp } = await ethers.provider.getBlock('latest')
    const maturity1 = timestamp + 31556952 // One year
    const fyDai1 = ((await FYTokenFactory.deploy(dai.address, maturity1)) as unknown) as FYToken
    await fyDai1.deployed()

    const calculatedAddress = await factory.calculatePoolAddress(dai.address, fyDai1.address)
    await factory.createPool(dai.address, fyDai1.address)

    const pool = await ethers.getContractAt('Pool', calculatedAddress)
    expect(await pool.baseToken()).to.equal(dai.address, 'Pool has the wrong dai address')
    expect(await pool.fyToken()).to.equal(fyDai1.address, 'Pool has the wrong fyDai address')
    expect(await pool.name()).to.equal('Yield Test LP Token', 'Pool has the wrong name')
    expect(await pool.symbol()).to.equal('TSTLP', 'Pool has the wrong symbol')
  })
})
