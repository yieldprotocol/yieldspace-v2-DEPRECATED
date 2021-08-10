import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { constants, signatures, id } from '@yield-protocol/utils-v2'
const { WAD, MAX256, DAI } = constants
const MAX = MAX256

import { PoolFactory } from '../typechain/PoolFactory'
import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'

import { YieldSpaceEnvironment } from './shared/fixtures'
import { PoolRouterWrapper } from '../src/poolRouterWrapper'

import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolRouter - Permit', async function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory
  let router: PoolRouterWrapper
  let base: Base
  let fyToken: FYToken
  let dai: Base
  let fyDai: FYToken
  let pool: Pool

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'
  const fyTokenId = baseId + '-' + maturityId
  const fyDaiId = DAI + '-' + maturityId

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId], BigNumber.from('0'))
  }
  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    router = yieldSpace.router as PoolRouterWrapper
    base = yieldSpace.bases.get(baseId) as Base
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool

    dai = yieldSpace.bases.get(DAI) as Base
    fyDai = yieldSpace.fyTokens.get(fyDaiId) as FYToken

    await router.router.grantRole(id('setTargets(address[],bool)'), owner)
    await router.router.setTargets([base.address, dai.address, fyToken.address, fyDai.address, pool.address], true)
  })

  it('users can use the router to execute permit on an base', async () => {
    const separator = await base.DOMAIN_SEPARATOR()
    const deadline = MAX
    const amount = WAD
    const nonce = await base.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      value: amount,
    }
    const permitDigest = signatures.getPermitDigest(separator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(permitDigest, signatures.privateKey0)

    expect(await router.forwardPermit(base.address, router.address, amount, deadline, v, r, s))
      .to.emit(base, 'Approval')
      .withArgs(owner, router.address, WAD)

    expect(await base.allowance(owner, router.address)).to.equal(WAD)
  })

  it('users can use the router to execute permit on an fyToken', async () => {
    const separator = await fyToken.DOMAIN_SEPARATOR()
    const deadline = MAX
    const amount = WAD
    const nonce = await fyToken.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      value: amount,
    }
    const permitDigest = signatures.getPermitDigest(separator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(permitDigest, signatures.privateKey0)

    expect(await router.forwardPermit(fyToken.address, router.address, amount, deadline, v, r, s))
      .to.emit(fyToken, 'Approval')
      .withArgs(owner, router.address, WAD)

    expect(await fyToken.allowance(owner, router.address)).to.equal(WAD)
  })

  it('users can use the router to execute permit on an pool token', async () => {
    const separator = await pool.DOMAIN_SEPARATOR()
    const deadline = MAX
    const amount = WAD
    const nonce = await pool.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      value: amount,
    }
    const permitDigest = signatures.getPermitDigest(separator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(permitDigest, signatures.privateKey0)

    expect(await router.forwardPermit(pool.address, router.address, amount, deadline, v, r, s))
      .to.emit(pool, 'Approval')
      .withArgs(owner, router.address, WAD)

    expect(await pool.allowance(owner, router.address)).to.equal(WAD)
  })

  it('users can use the router to execute permit in a batch', async () => {
    const separator = await base.DOMAIN_SEPARATOR()
    const deadline = MAX
    const amount = WAD
    const nonce = await base.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      value: amount,
    }
    const permitDigest = signatures.getPermitDigest(separator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(permitDigest, signatures.privateKey0)

    expect(await router.batch([router.forwardPermitAction(base.address, router.address, amount, deadline, v, r, s)]))
      .to.emit(base, 'Approval')
      .withArgs(owner, router.address, WAD)

    expect(await base.allowance(owner, router.address)).to.equal(WAD)
  })

  it('users can use the router to execute a dai-style permit', async () => {
    const daiSeparator = await dai.DOMAIN_SEPARATOR()
    const deadline = MAX
    const nonce = await fyDai.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      can: true,
    }
    const daiPermitDigest = signatures.getDaiDigest(daiSeparator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(daiPermitDigest, signatures.privateKey0)

    expect(await router.forwardDaiPermit(dai.address, router.address, nonce, deadline, true, v, r, s))
      .to.emit(dai, 'Approval')
      .withArgs(owner, router.address, MAX)

    expect(await dai.allowance(owner, router.address)).to.equal(MAX)
  })

  it('users can use the router to execute a dai-style permit in a batch', async () => {
    const daiSeparator = await dai.DOMAIN_SEPARATOR()
    const deadline = MAX
    const nonce = await fyDai.nonces(owner)
    const approval = {
      owner: owner,
      spender: router.address,
      can: true,
    }
    const daiPermitDigest = signatures.getDaiDigest(daiSeparator, approval, nonce, deadline)

    const { v, r, s } = signatures.sign(daiPermitDigest, signatures.privateKey0)

    expect(
      await router.batch([router.forwardDaiPermitAction(dai.address, router.address, nonce, deadline, true, v, r, s)])
    )
      .to.emit(dai, 'Approval')
      .withArgs(owner, router.address, MAX)

    expect(await dai.allowance(owner, router.address)).to.equal(MAX)
  })
})
