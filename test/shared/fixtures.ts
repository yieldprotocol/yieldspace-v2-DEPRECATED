import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { BaseProvider } from '@ethersproject/providers'

import { YieldMath } from '../../typechain/YieldMath'
import { Pool } from '../../typechain/Pool'
import { PoolFactory } from '../../typechain/PoolFactory'
import { DaiMock as ERC20 } from '../../typechain/DaiMock' // TODO: Rename/refactor mock
import { FYDaiMock as FYToken } from '../../typechain/FYDaiMock' // TODO: Rename/refactor mock
import { SafeERC20Namer } from '../../typechain/SafeERC20Namer'
import { ethers } from 'hardhat'

export const THREE_MONTHS: number = 3 * 30 * 24 * 60 * 60

const poolABI = [
  'event Trade(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens)',
  'event Liquidity(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens, int256 poolTokens)',
  'function k() view returns(int128)',
  'function baseToken() view returns(address)',
  'function fyToken() view returns(address)',
  'function getBaseTokenReserves() view returns(uint128)',
  'function getFYTokenReserves() view returns(uint128)',
  'function sellBaseToken(address, address, uint128) returns(uint128)',
  'function buyBaseToken(address, address, uint128) returns(uint128)',
  'function sellFYToken(address, address, uint128) returns(uint128)',
  'function buyFYToken(address, address, uint128) returns(uint128)',
  'function sellBaseTokenPreview(uint128) view returns(uint128)',
  'function buyBaseTokenPreview(uint128) view returns(uint128)',
  'function sellFYTokenPreview(uint128) view returns(uint128)',
  'function buyFYTokenPreview(uint128) view returns(uint128)',
  'function mint(address, address, uint256) returns (uint256)',
  'function mintWithToken(address, address, uint256) returns (uint256, uint256)',
  'function burn(address, address, uint256 tokensBurned) returns (uint256, uint256)',
  'function burnForBaseToken(address, address, uint256) returns (uint256)',

  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transferFrom(address, address, uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',

  'function addDelegate(address)',
  'function addDelegateBySignature(address, address, uint, uint8, bytes32, bytes32)',
]

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
  public static async setup(owner: SignerWithAddress, baseIds: Array<string>, fyTokenIds: Array<string>) {
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

    const BaseFactory = await ethers.getContractFactory('DaiMock')
    const FYTokenFactory = await ethers.getContractFactory('FYDaiMock')
    const PoolFactoryFactory = await ethers.getContractFactory('PoolFactory', {
      libraries: {
        YieldMath: yieldMathLibrary.address,
        SafeERC20Namer: safeERC20NamerLibrary.address,
      },
    })
    factory = ((await PoolFactoryFactory.deploy()) as unknown) as PoolFactory
    await factory.deployed()

    // ==== Add assets and joins ====
    // For each asset id passed as an argument, we create a Mock ERC20 which we register in cauldron, and its Join, that we register in Ladle.
    // We also give 100 tokens of that asset to the owner account, and approve with the owner for the join to take the asset.
    const bases: Map<string, ERC20> = new Map()
    const fyTokens: Map<string, FYToken> = new Map()
    const pools: Map<string, Map<string, Pool>> = new Map()
    const provider: BaseProvider = ethers.getDefaultProvider()
    const now = (await provider.getBlock(provider.getBlockNumber())).timestamp
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
        const pool = (new ethers.Contract(calculatedAddress, poolABI, owner) as unknown) as Pool
        fyTokenPoolPairs.set(fyTokenId, pool)
        // init pool
        // skew pool to 5% interest rate
      }
    }

    return new YieldSpaceEnvironment(owner, factory, bases, fyTokens, pools)
  }
}
