import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { BaseProvider } from '@ethersproject/providers'

import { YieldMath } from '../../typechain/YieldMath'
import { Pool } from '../../typechain/Pool'
import { PoolFactory } from '../../typechain/PoolFactory'
import { BaseMock as ERC20 } from '../../typechain/BaseMock' // TODO: Rename/refactor mock
import { FYTokenMock as FYToken } from '../../typechain/FYTokenMock' // TODO: Rename/refactor mock
import { SafeERC20Namer } from '../../typechain/SafeERC20Namer'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'

export const THREE_MONTHS: number = 3 * 30 * 24 * 60 * 60

export class YieldSpaceEnvironment {
  owner: SignerWithAddress
  factory: PoolFactory
  bases: Map<string, ERC20>
  fyTokens: Map<string, FYToken>
  pools: Map<string, Map<string, Pool>>

  constructor(
    owner: SignerWithAddress,
    factory: PoolFactory,
    bases: Map<string, ERC20>,
    fyTokens: Map<string, FYToken>,
    pools: Map<string, Map<string, Pool>>
  ) {
    this.owner = owner
    this.factory = factory
    this.bases = bases
    this.fyTokens = fyTokens
    this.pools = pools
  }

  // Set up a test environment with pools according to the cartesian product of the base ids and the fyToken ids
  public static async setup(owner: SignerWithAddress, baseIds: Array<string>, fyTokenIds: Array<string>, initialLiquidity: BigNumber) {
    const ownerAdd = await owner.getAddress()

    let yieldMathLibrary: YieldMath
    let safeERC20NamerLibrary: SafeERC20Namer
    let factory: PoolFactory

    const YieldMathFactory = await ethers.getContractFactory('YieldMath')
    yieldMathLibrary = ((await YieldMathFactory.deploy()) as unknown) as YieldMath
    await yieldMathLibrary.deployed()

    const SafeERC20NamerFactory = await ethers.getContractFactory('SafeERC20Namer')
    safeERC20NamerLibrary = ((await SafeERC20NamerFactory.deploy()) as unknown) as SafeERC20Namer
    await safeERC20NamerLibrary.deployed()

    const BaseFactory = await ethers.getContractFactory('BaseMock')
    const FYTokenFactory = await ethers.getContractFactory('FYTokenMock')
    const PoolFactoryFactory = await ethers.getContractFactory('PoolFactory', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
        SafeERC20Namer: safeERC20NamerLibrary.address,
      },
    })
    factory = ((await PoolFactoryFactory.deploy()) as unknown) as PoolFactory
    await factory.deployed()

    const WAD = BigNumber.from(10).pow(18)
    const initialBase = WAD.mul(initialLiquidity)
    const initialFYToken = initialBase.div(9)
    const bases: Map<string, ERC20> = new Map()
    const fyTokens: Map<string, FYToken> = new Map()
    const pools: Map<string, Map<string, Pool>> = new Map()
    const provider: BaseProvider = await ethers.provider
    const now = (await provider.getBlock(await provider.getBlockNumber())).timestamp
    let count: number = 1
    for (let baseId of baseIds) {
      // deploy base
      const base = ((await BaseFactory.deploy()) as unknown) as ERC20
      await base.deployed()
      bases.set(baseId, base)
      const fyTokenPoolPairs: Map<string, Pool> = new Map()
      pools.set(baseId, fyTokenPoolPairs)

      for (let fyTokenId of fyTokenIds) {
        // deploy fyToken
        const maturity = now + THREE_MONTHS * count++
        const fyToken = ((await FYTokenFactory.deploy(base.address, maturity)) as unknown) as FYToken
        await fyToken.deployed()
        fyTokens.set(fyTokenId, fyToken)

        // deploy base/fyToken pool
        const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken.address)
        await factory.createPool(base.address, fyToken.address)
        const pool = (await ethers.getContractAt('Pool', calculatedAddress, owner) as unknown) as Pool
        fyTokenPoolPairs.set(fyTokenId, pool)

        // init pool
        await base.mint(pool.address, initialBase)
        await pool.mint(ownerAdd, 0)

        // skew pool to 5% interest rate
        await fyToken.mint(pool.address, initialFYToken)
        await pool.sync()
      }
    }

    return new YieldSpaceEnvironment(owner, factory, bases, fyTokens, pools)
  }
}
