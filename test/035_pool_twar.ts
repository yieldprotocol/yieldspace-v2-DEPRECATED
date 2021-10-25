import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD, MAX128 } = constants
const MAX = MAX128

import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

async function currentTimestamp() {
  return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
}

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0) // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

describe('Pool - TWAR', async function () {
  this.timeout(0)

  // These values impact the pool results
  const bases = BigNumber.from('1000000000000000000000000')
  const initialBase = bases

  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let owner: string
  let user1: string

  let yieldSpace: YieldSpaceEnvironment

  let pool: Pool
  let poolFromUser1: Pool

  let base: Base
  let baseFromUser1: Base

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId], BigNumber.from('0'))
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    base = yieldSpace.bases.get(baseId) as Base
    baseFromUser1 = base.connect(user1Acc)

    // Deploy a fresh pool so that we can test initialization
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)

    await base.mint(pool.address, initialBase)
    await poolFromUser1.mint(user1, user1, 0, MAX)
  })

  it('calculates the TWAR price', async () => {
    const cumulativePrice1 = await pool.cumulativeBalancesRatio()
    expect(cumulativePrice1).to.equal(0, 'Price should start at 0')
    const timestamp1 = (await pool.getCache())[2]

    await ethers.provider.send('evm_mine', [(await currentTimestamp()) + 120])

    await pool.sync()

    const balancedRatio = BigNumber.from('10').pow(BigNumber.from('27'))

    const cumulativeRatio2 = await pool.cumulativeBalancesRatio()
    const timestamp2 = (await pool.getCache())[2]
    const ratio2 = cumulativeRatio2.div(BigNumber.from(timestamp2 - timestamp1))
    almostEqual(ratio2, balancedRatio, BigNumber.from('10000000000'))

    await ethers.provider.send('evm_mine', [(await currentTimestamp()) + 120])

    await pool.sync()

    const cumulativeRatio3 = await pool.cumulativeBalancesRatio()
    const timestamp3 = (await pool.getCache())[2]
    const ratio3 = cumulativeRatio3.sub(cumulativeRatio2).div(BigNumber.from(timestamp3 - timestamp2))
    almostEqual(ratio3, balancedRatio, BigNumber.from('10000000000'))
  })
})
