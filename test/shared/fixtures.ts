import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { BaseProvider } from '@ethersproject/providers'

import { constants, id } from '@yield-protocol/utils-v2'
const { DAI, ETH, USDC, THREE_MONTHS, MAX256 } = constants
const MAX = MAX256

import { YieldMath } from '../../typechain/YieldMath'
import { Pool } from '../../typechain/Pool'
import { PoolFactory } from '../../typechain/PoolFactory'
import { BaseMock as ERC20 } from '../../typechain/BaseMock'
import { FYTokenMock as FYToken } from '../../typechain/FYTokenMock'
import { SafeERC20Namer } from '../../typechain/SafeERC20Namer'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'

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
  public static async setup(
    owner: SignerWithAddress,
    baseIds: Array<string>,
    maturityIds: Array<string>,
    initialBase: BigNumber
  ) {
    const ownerAdd = await owner.getAddress()

    let yieldMathLibrary: YieldMath
    let safeERC20NamerLibrary: SafeERC20Namer
    let factory: PoolFactory

    const WETH9Factory = await ethers.getContractFactory('WETH9Mock')
    const weth9 = (((await WETH9Factory.deploy()) as unknown) as unknown) as ERC20
    await weth9.deployed()

    const DaiFactory = await ethers.getContractFactory('DaiMock')
    const dai = (((await DaiFactory.deploy('DAI', 'DAI')) as unknown) as unknown) as ERC20
    await dai.deployed()

    const USDCFactory = await ethers.getContractFactory('USDCMock')
    const usdc = (((await USDCFactory.deploy('USDC', 'USDC')) as unknown) as unknown) as ERC20
    await usdc.deployed()

    const BaseFactory = await ethers.getContractFactory('BaseMock')
    const FYTokenFactory = await ethers.getContractFactory('FYTokenMock')
    const YieldMathFactory = await ethers.getContractFactory('YieldMath')
    yieldMathLibrary = ((await YieldMathFactory.deploy()) as unknown) as YieldMath
    await yieldMathLibrary.deployed()

    const SafeERC20NamerFactory = await ethers.getContractFactory('SafeERC20Namer')
    safeERC20NamerLibrary = ((await SafeERC20NamerFactory.deploy()) as unknown) as SafeERC20Namer
    await safeERC20NamerLibrary.deployed()

    const PoolFactoryFactory = await ethers.getContractFactory('PoolFactory', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
        SafeERC20Namer: safeERC20NamerLibrary.address,
      },
    })
    factory = ((await PoolFactoryFactory.deploy()) as unknown) as PoolFactory
    await factory.deployed()
    await factory.grantRoles(
      [id(factory.interface, 'setParameter(bytes32,int128)'), id(factory.interface, 'createPool(address,address)')],
      ownerAdd
    )

    const initialFYToken = initialBase.div(9)
    const bases: Map<string, ERC20> = new Map()
    const fyTokens: Map<string, FYToken> = new Map()
    const pools: Map<string, Map<string, Pool>> = new Map()
    const provider: BaseProvider = await ethers.provider
    const now = (await provider.getBlock(await provider.getBlockNumber())).timestamp
    let count: number = 1

    // deploy bases
    for (let baseId of baseIds) {
      const base = ((await BaseFactory.deploy()) as unknown) as ERC20
      await base.deployed()
      bases.set(baseId, base)
    }

    // add WETH to bases
    bases.set(ETH, weth9)
    baseIds.unshift(ETH)

    // add Dai to bases
    bases.set(DAI, dai)
    baseIds.unshift(DAI)

    // add USDC to bases
    bases.set(USDC, usdc)
    baseIds.unshift(USDC)

    for (let baseId of baseIds) {
      const base = bases.get(baseId) as ERC20
      const fyTokenPoolPairs: Map<string, Pool> = new Map()
      pools.set(baseId, fyTokenPoolPairs)

      for (let maturityId of maturityIds) {
        const fyTokenId = baseId + '-' + maturityId

        // deploy fyToken
        const maturity = now + THREE_MONTHS * count++ // We are just assuming that the maturities are '3M', '6M', '9M' and so on
        const fyToken = ((await FYTokenFactory.deploy(base.address, maturity)) as unknown) as FYToken
        await fyToken.deployed()
        fyTokens.set(fyTokenId, fyToken)

        // deploy base/fyToken pool
        const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken.address)
        await factory.createPool(base.address, fyToken.address)
        const pool = ((await ethers.getContractAt('Pool', calculatedAddress, owner)) as unknown) as Pool
        fyTokenPoolPairs.set(fyTokenId, pool)

        // init pool
        if (initialBase !== BigNumber.from(0)) {
          if (baseId === ETH) {
            break // TODO: Fix when we can give `initialBase` ether to the deployer
            await weth9.deposit({ value: initialBase })
            await weth9.transfer(pool.address, initialBase)
          } else {
            await base.mint(pool.address, initialBase)
          }
          await pool.mint(ownerAdd, 0, MAX)

          // skew pool to 5% interest rate
          await fyToken.mint(pool.address, initialFYToken)
          await pool.sync()
        }
      }
    }

    return new YieldSpaceEnvironment(owner, factory, bases, fyTokens, pools)
  }
}
