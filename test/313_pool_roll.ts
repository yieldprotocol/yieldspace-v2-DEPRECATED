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

const timeMachine = require('ether-time-traveler')

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

import { sellBase, sellFYToken } from './shared/yieldspace'
const WAD = BigNumber.from(10).pow(18)

describe('Pool', async function () {
  this.timeout(0)

  let snapshotId: string
  let ownerAcc: SignerWithAddress
  let owner: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  let pool1: Pool
  let pool2: Pool

  let base: Base
  let fyToken1: FYToken
  let fyToken2: FYToken
  let maturity1: BigNumber
  let maturity2: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyToken1Id = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyToken2Id = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [fyToken1Id, fyToken2Id], BigNumber.from('100'))
  }

  before(async () => {
    snapshotId = await timeMachine.takeSnapshot(ethers.provider)

    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
  })

  after(async () => {
    await timeMachine.revertToSnapshot(ethers.provider, snapshotId)
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    base = yieldSpace.bases.get(baseId) as Base

    fyToken1 = yieldSpace.fyTokens.get(fyToken1Id) as FYToken
    fyToken2 = yieldSpace.fyTokens.get(fyToken2Id) as FYToken

    pool1 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken1Id) as Pool
    pool2 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken2Id) as Pool

    maturity1 = BigNumber.from(await fyToken1.maturity())
    maturity2 = BigNumber.from(await fyToken2.maturity())
  })

  it('Rolls fyToken', async () => {
    const fyTokenIn = WAD.mul(10)
    await fyToken1.mint(owner, fyTokenIn)

    const baseIn = sellFYToken(
      await pool1.getBaseTokenReserves(),
      await pool1.getFYTokenReserves(),
      fyTokenIn,
      maturity1.sub(await currentTimestamp())
    )
    const fyTokenOut = sellBase(
      await pool2.getBaseTokenReserves(),
      await pool2.getFYTokenReserves(),
      baseIn,
      maturity2.sub(await currentTimestamp())
    )

    const fyToken2Before = await fyToken2.balanceOf(owner)
    const baseTokenPool2Before = await base.balanceOf(pool2.address)
    await fyToken1.transfer(pool1.address, fyTokenIn)
    await pool1.sellFYToken(pool2.address)
    const exactBaseIn = (await base.balanceOf(pool2.address)).sub(baseTokenPool2Before)
    await pool2.sellBaseToken(owner)

    almostEqual((await fyToken2.balanceOf(owner)).sub(fyToken2Before), fyTokenOut, fyTokenIn.div(1000000))
  })
})
