import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as ERC20 } from '../typechain/DaiMock'
import { FYDaiMock as FYToken } from '../typechain/FYDaiMock'
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

import { mint, mintWithDai, burn, burnForDai, sellDai, sellFYDai, buyDai, buyFYDai } from './shared/yieldspace'
const WAD = BigNumber.from('1000000000000000000')

describe('Pool', async function () {
  this.timeout(0)

  const OVERRIDES = { gasLimit: 1_000_000 }

  let snapshotId: string
  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let operatorAcc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string
  let operator: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  let pool1: Pool
  let pool2: Pool
  let pool1FromUser1: Pool
  let pool1FromOwner: Pool

  let base: ERC20
  let baseFromOwner: ERC20
  let baseFromUser1: ERC20
  let fyToken1: FYToken
  let fyToken2: FYToken
  let fyToken1FromUser1: FYToken
  let fyToken1FromOwner: FYToken
  let maturity1: BigNumber
  let maturity2: BigNumber

  const initialBase = WAD.mul(100)
  const initialFYToken = WAD.mul(10)

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyToken1Id = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyToken2Id = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [fyToken1Id, fyToken2Id])
  }

  before(async () => {
    snapshotId = await timeMachine.takeSnapshot(ethers.provider)

    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
    operatorAcc = signers[3]
    operator = operatorAcc.address
  })

  after(async () => {
    await timeMachine.revertToSnapshot(ethers.provider, snapshotId)
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    base = yieldSpace.bases.get(baseId) as ERC20
    baseFromUser1 = base.connect(user1Acc)
    baseFromOwner = base.connect(ownerAcc)

    fyToken1 = yieldSpace.fyTokens.get(fyToken1Id) as FYToken
    fyToken2 = yieldSpace.fyTokens.get(fyToken2Id) as FYToken
    fyToken1FromUser1 = fyToken1.connect(user1Acc)
    fyToken1FromOwner = fyToken1.connect(ownerAcc)

    pool1 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken1Id) as Pool
    pool2 = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyToken2Id) as Pool
    pool1FromUser1 = pool1.connect(user1Acc)
    pool1FromOwner = pool1.connect(ownerAcc)

    maturity1 = await fyToken1.maturity()
    maturity2 = await fyToken2.maturity()

    // TODO: Move to fixtures
    await base.mint(owner, initialBase)
    await base.approve(pool1.address, initialBase)
    await pool1.mint(owner, owner, initialBase)

    await base.mint(owner, initialBase)
    await base.approve(pool2.address, initialBase)
    await pool2.mint(owner, owner, initialBase)

    await fyToken1.mint(owner, initialFYToken)
    await fyToken1.approve(pool1.address, initialFYToken)
    await pool1.sellFYToken(owner, owner, initialFYToken)

    await fyToken2.mint(owner, initialFYToken)
    await fyToken2.approve(pool2.address, initialFYToken)
    await pool2.sellFYToken(owner, owner, initialFYToken)
  })

  it('Rolls fyToken', async () => {
    const fyTokenIn = WAD.mul(10)
    await fyToken1.mint(owner, fyTokenIn)

    const baseIn = sellFYDai(
      await pool1.getBaseTokenReserves(),
      await pool1.getFYTokenReserves(),
      fyTokenIn,
      maturity1.sub(await currentTimestamp())
    )
    const fyTokenOut = sellDai(
      await pool2.getBaseTokenReserves(),
      await pool2.getFYTokenReserves(),
      baseIn,
      maturity2.sub(await currentTimestamp())
    )

    const fyToken2Before = await fyToken2.balanceOf(owner)
    await pool1.addDelegate(pool2.address)
    await fyToken1.approve(pool1.address, fyTokenIn)
    await pool2.rollFYToken(owner, owner, pool1.address, fyTokenIn)

    almostEqual((await fyToken2.balanceOf(owner)).sub(fyToken2Before), fyTokenOut, fyTokenIn.div(1000000))
  })
})