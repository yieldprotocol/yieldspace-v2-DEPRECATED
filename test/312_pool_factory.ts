import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { YieldMath } from '../typechain/YieldMath'
import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Dai } from '../typechain/DaiMock'
import { FYDaiMock as FYDai } from '../typechain/FYDaiMock'
import { SafeERC20Namer } from '../typechain/SafeERC20Namer'

import { ethers } from 'hardhat'
import { expect, use } from 'chai'
use(require('chai-bignumber')());

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

describe('PoolFactory', async () => {
  let ownerAcc: SignerWithAddress

  let yieldMathLibrary: YieldMath
  let safeERC20NamerLibrary: SafeERC20Namer

  let DaiFactory: any
  let FYDaiFactory: any
  let PoolFactoryFactory: any

  let factory: PoolFactory
  let dai: Dai
  let fyDai1: FYDai
  let maturity1: number

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]

    const YieldMathFactory = await ethers.getContractFactory("YieldMath");
    yieldMathLibrary = await YieldMathFactory.deploy() as unknown as YieldMath
    await yieldMathLibrary.deployed();

    const SafeERC20NamerFactory = await ethers.getContractFactory("SafeERC20Namer");
    safeERC20NamerLibrary = await SafeERC20NamerFactory.deploy() as unknown as SafeERC20Namer
    await safeERC20NamerLibrary.deployed();

    DaiFactory = await ethers.getContractFactory("DaiMock");
    FYDaiFactory = await ethers.getContractFactory("FYDaiMock");
    PoolFactoryFactory = await ethers.getContractFactory(
      "PoolFactory",
      {
        libraries: {
          YieldMath: yieldMathLibrary.address,
          SafeERC20Namer: safeERC20NamerLibrary.address
        }
      }
    );
  })

  beforeEach(async () => {
    dai = await DaiFactory.deploy() as unknown as Dai
    await dai.deployed();

    maturity1 = (await currentTimestamp()) + 31556952 // One year
    fyDai1 = await FYDaiFactory.deploy(dai.address, maturity1) as unknown as FYDai
    await fyDai1.deployed();
    
    factory = await PoolFactoryFactory.deploy() as unknown as PoolFactory
    await factory.deployed();
  })

  it('should create pools', async () => {
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
