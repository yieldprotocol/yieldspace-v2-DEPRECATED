import { artifacts, contract, web3 } from 'hardhat'

const Pool = artifacts.require('Pool')
const PoolFactory = artifacts.require('PoolFactory')
const Base = artifacts.require('DaiMock')
const FYToken = artifacts.require('FYDaiMock')
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
  let base: Contract
  let fyToken1: Contract
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

    // Setup base
    base = await Base.new()

    // Setup fyToken
    maturity1 = (await currentTimestamp()) + 31556952 // One year
    fyToken1 = await FYToken.new(base.address, maturity1)

    // Setup Pool
    factory = await PoolFactory.new({
      from: owner,
    })
  })

  afterEach(async () => {
    await helper.revertToSnapshot(snapshotId)
  })

  it('should create pools', async () => {
    const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken1.address)
    await factory.createPool(base.address, fyToken1.address, {
      from: owner,
    })

    const pool = await Pool.at(calculatedAddress)

    assert.equal(await pool.base(), base.address, 'Pool has the wrong base address')
    assert.equal(await pool.fyToken(), fyToken1.address, 'Pool has the wrong fyToken address')
    assert.equal(await pool.name(), 'Yield Test LP Token', 'Pool has the wrong name')
    assert.equal(await pool.symbol(), 'TSTLP', 'Pool has the wrong symbol')
  })
})
