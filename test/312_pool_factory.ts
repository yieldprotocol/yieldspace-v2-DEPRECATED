import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Dai } from '../typechain/DaiMock'
import { FYDaiMock as FYDai } from '../typechain/FYDaiMock'

import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

describe('PoolFactory', async () => {
  let ownerAcc: SignerWithAddress
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyTokenId = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [], [])
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
    const DaiFactory = await ethers.getContractFactory("DaiMock");
    const FYDaiFactory = await ethers.getContractFactory("FYDaiMock");
    const dai = await DaiFactory.deploy() as unknown as Dai
    await dai.deployed();

    const maturity1 = (await currentTimestamp()) + 31556952 // One year
    const fyDai1 = await FYDaiFactory.deploy(dai.address, maturity1) as unknown as FYDai
    await fyDai1.deployed();

    const calculatedAddress = await factory.calculatePoolAddress(dai.address, fyDai1.address)
    await factory.createPool(dai.address, fyDai1.address)

    const poolABI = [
      'function baseToken() view returns (address)',
      'function fyToken() view returns (address)',
      'function name() view returns (string)',
      'function symbol() view returns (string)',
    ]

    const pool = new ethers.Contract(calculatedAddress, poolABI, ownerAcc) as unknown as Pool

    expect(await pool.baseToken()).to.equal(dai.address, 'Pool has the wrong dai address')
    expect(await pool.fyToken()).to.equal(fyDai1.address, 'Pool has the wrong fyDai address')
    expect(await pool.name()).to.equal('Yield Test LP Token', 'Pool has the wrong name')
    expect(await pool.symbol()).to.equal('TSTLP', 'Pool has the wrong symbol')
  })
})
