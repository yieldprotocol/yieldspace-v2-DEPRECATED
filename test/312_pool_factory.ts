import { artifacts, contract, web3 } from 'hardhat'

const Pool = artifacts.require('Pool')
const PoolFactory = artifacts.require('PoolFactory')
const Dai = artifacts.require('DaiMock')
const FYDai = artifacts.require('FYDaiMock')
const SafeERC20Namer = artifacts.require('SafeERC20Namer')
const YieldMath = artifacts.require('YieldMath')

import * as helper from 'ganache-time-traveler'
import { assert } from 'chai'
import { Contract } from './shared/fixtures'


async function currentTimestamp() {
  const block = await web3.eth.getBlockNumber()
  return parseInt((await web3.eth.getBlock(block)).timestamp.toString())
}

contract('PoolFactory', async ([owner]) => {
  let snapshot: any
  let snapshotId: string

  let factory: Contract
  let dai: Contract
  let fyDai1: Contract
  let maturity1: number

  before(async () => {
    const yieldMathLibrary = await YieldMath.new()
    const safeERC20NamerLibrary = await SafeERC20Namer.new()
    await PoolFactory.link(yieldMathLibrary)
    await PoolFactory.link(safeERC20NamerLibrary)
  })

  beforeEach(async () => {
    snapshot = await helper.takeSnapshot()
    snapshotId = snapshot['result']

    // Setup dai
    dai = await Dai.new()

    // Setup fyDai
    maturity1 = (await currentTimestamp()) + 31556952 // One year
    fyDai1 = await FYDai.new(dai.address, maturity1)

    // Setup Pool
    factory = await PoolFactory.new({
      from: owner,
    })
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  it('should create pools', async () => {
    const calculatedAddress = await factory.calculatePoolAddress(dai.address, fyDai1.address)
    await factory.createPool(dai.address, fyDai1.address, {
      from: owner,
    })

    const pool = await Pool.at(calculatedAddress)

    assert.equal(await pool.baseToken(), dai.address, 'Pool has the wrong dai address')
    assert.equal(await pool.fyToken(), fyDai1.address, 'Pool has the wrong fyDai address')
    assert.equal(await pool.name(), 'Yield Test LP Token', 'Pool has the wrong name')
    assert.equal(await pool.symbol(), 'TSTLP', 'Pool has the wrong symbol')
  })
})
