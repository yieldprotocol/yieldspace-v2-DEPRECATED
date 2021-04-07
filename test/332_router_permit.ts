import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { signatures } from '@yield-protocol/utils'
import { OPS, WAD, MAX256 as MAX, DAI } from './shared/constants'

import { PoolFactory } from '../typechain/PoolFactory'
import { PoolRouter } from '../typechain/PoolRouter'
import { Pool } from '../typechain/Pool'
import { BaseMock as Base } from '../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../typechain/FYTokenMock'

import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolRouter', async function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string
  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory
  let router: PoolRouter
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
    router = yieldSpace.router as PoolRouter
    base = yieldSpace.bases.get(baseId) as Base
    fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool

    dai = yieldSpace.bases.get(DAI) as Base
    fyDai = yieldSpace.fyTokens.get(fyDaiId) as FYToken
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

    expect(
      await router.forwardPermit(base.address, fyToken.address, base.address, router.address, amount, deadline, v, r, s)
    )
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

    expect(
      await router.forwardPermit(
        base.address,
        fyToken.address,
        fyToken.address,
        router.address,
        amount,
        deadline,
        v,
        r,
        s
      )
    )
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

    expect(
      await router.forwardPermit(base.address, fyToken.address, pool.address, router.address, amount, deadline, v, r, s)
    )
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

    const forwardPermitData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
      [base.address, router.address, amount, deadline, v, r, s]
    )
    expect(await router.batch([base.address], [fyToken.address], [0], [OPS.FORWARD_PERMIT], [forwardPermitData]))
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

    expect(await router.forwardDaiPermit(dai.address, fyDai.address, router.address, nonce, deadline, true, v, r, s))
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

    const forwardDaiPermitData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bool', 'uint8', 'bytes32', 'bytes32'],
      [router.address, nonce, deadline, true, v, r, s]
    )
    expect(await router.batch([dai.address], [fyDai.address], [0], [OPS.FORWARD_DAI_PERMIT], [forwardDaiPermitData]))
      .to.emit(dai, 'Approval')
      .withArgs(owner, router.address, MAX)

    expect(await dai.allowance(owner, router.address)).to.equal(MAX)
  })
})
