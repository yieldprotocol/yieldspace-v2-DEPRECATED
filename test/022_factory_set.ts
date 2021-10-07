import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { constants } from '@yield-protocol/utils-v2'
const { WAD } = constants

import { PoolFactory } from '../typechain/PoolFactory'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('PoolFactory - set', async function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const maturityId = '3M'

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [maturityId], WAD.mul(100))
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
  })

  it('Sets parameters', async () => {
    const ts = ethers.utils.formatBytes32String('ts')
    const g1 = ethers.utils.formatBytes32String('g1')
    const g2 = ethers.utils.formatBytes32String('g2')
    const invalid = ethers.utils.formatBytes32String('invalid')

    await factory.setParameter(ts, 0)
    await factory.setParameter(g1, 0)
    await factory.setParameter(g2, 0)
    expect(await factory.ts()).to.equal(0)
    expect(await factory.g1()).to.equal(0)
    expect(await factory.g2()).to.equal(0)

    expect(await factory.setParameter(ts, 1))
      .to.emit(factory, 'ParameterSet')
      .withArgs(ts, 1)
    expect(await factory.ts()).to.equal(1)
    expect(await factory.g1()).to.equal(0)
    expect(await factory.g2()).to.equal(0)

    expect(await factory.setParameter(g1, 1))
      .to.emit(factory, 'ParameterSet')
      .withArgs(g1, 1)
    expect(await factory.ts()).to.equal(1)
    expect(await factory.g1()).to.equal(1)
    expect(await factory.g2()).to.equal(0)

    expect(await factory.setParameter(g2, 1))
      .to.emit(factory, 'ParameterSet')
      .withArgs(g2, 1)
    expect(await factory.ts()).to.equal(1)
    expect(await factory.g1()).to.equal(1)
    expect(await factory.g2()).to.equal(1)

    await expect(factory.setParameter(invalid, 1)).to.be.revertedWith('Pool: Unrecognized parameter')
  })
})
