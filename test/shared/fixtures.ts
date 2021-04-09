import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { BaseProvider } from '@ethersproject/providers'
import { DAI, ETH, USDC } from './constants'

import { YieldMath } from '../../typechain/YieldMath'
import { Pool } from '../../typechain/Pool'
import { PoolFactory } from '../../typechain/PoolFactory'
import { PoolRouter } from '../../typechain/PoolRouter'
import { BaseMock as ERC20 } from '../../typechain/BaseMock'
import { FYToken } from '../../typechain/FYToken'
import { FYTokenMock } from '../../typechain/FYTokenMock'
import { SafeERC20Namer } from '../../typechain/SafeERC20Namer'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { isTypeOnlyImportOrExportDeclaration } from 'typescript'

export const THREE_MONTHS: number = 3 * 30 * 24 * 60 * 60

export class YieldSpaceEnvironment {
  owner: SignerWithAddress
  router: PoolRouter
  factory: PoolFactory
  bases: Map<string, ERC20>
  fyTokens: Map<string, FYToken|FYTokenMock>
  pools: Map<string, Map<string, Pool>>

  constructor(
    owner: SignerWithAddress,
    router: PoolRouter,
    factory: PoolFactory,
    bases: Map<string, ERC20>,
    fyTokens: Map<string, FYToken|FYTokenMock>,
    pools: Map<string, Map<string, Pool>>
  ) {
    this.owner = owner
    this.router = router
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
    initialLiquidity: BigNumber,
    deployedFyTokens: Array<string>=[],
    ) {
    const ownerAdd = await owner.getAddress()

    let router: PoolRouter
    let yieldMathLibrary: YieldMath
    let safeERC20NamerLibrary: SafeERC20Namer
    let factory: PoolFactory

    const WETH9Factory = await ethers.getContractFactory('WETH9Mock')
    const weth9 = ((await WETH9Factory.deploy()) as unknown) as unknown as ERC20
    await weth9.deployed()

    const DaiFactory = await ethers.getContractFactory('DaiMock')
    const dai = ((await DaiFactory.deploy('DAI', 'DAI')) as unknown) as unknown as ERC20
    await dai.deployed()

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
    
    const PoolRouterFactory = await ethers.getContractFactory('PoolRouter')
    router = ((await PoolRouterFactory.deploy(factory.address, weth9.address)) as unknown) as PoolRouter
    await router.deployed()

    const WAD = BigNumber.from(10).pow(18)
    const initialBase = WAD.mul(initialLiquidity)
    const initialFYToken = initialBase.div(9)
    const bases: Map<string, ERC20> = new Map()
    const fyTokens: Map<string, FYToken|FYTokenMock> = new Map()
    const pools: Map<string, Map<string, Pool>> = new Map()
    const provider: BaseProvider = await ethers.provider
    const now = (await provider.getBlock(await provider.getBlockNumber())).timestamp
    let count: number = 1


    const initPool = async (assetId:string, _pool: Pool) => {
      if (assetId === ETH) {
        await weth9.deposit({ value: initialBase })
        await weth9.transfer(_pool.address, initialBase)
      } else {
        const base = (await ethers.getContractAt('BaseMock', await _pool.baseToken())as unknown) as ERC20
        await base.mint(_pool.address, initialBase)
      }
      await _pool.mint(ownerAdd, 0)

      // skew pool to 5% interest rate
      const fyToken = (await ethers.getContractAt('FYToken', await _pool.fyToken()) as unknown) as FYToken
      await fyToken.mint(_pool.address, initialFYToken)
      await _pool.sync()
    }

    if (deployedFyTokens.length) {
      for (let deployedFyToken of deployedFyTokens) { 

        const fyToken = (await ethers.getContractAt('FYToken', deployedFyToken, owner) as unknown) as FYToken ; 
        const [ assetAddr, maturity ]  = await Promise.all([ fyToken.asset(), fyToken.maturity() ]) ;

        const base = (await ethers.getContractAt('BaseMock', assetAddr, owner)as unknown) as ERC20
        const _symbol = await base.symbol();

        // Add series base to baseMap */
        const _baseId = ethers.utils.formatBytes32String(_symbol).slice(0, 14);
        bases.set(_baseId, base) // it is ok if they are duplicated,...it should simply over-write.
       
        // add fyToken to fyToken Mapping */
        const fyTokenId = _symbol + '-' + maturity.toString();
        fyTokens.set(fyTokenId, fyToken)

        // deploy base/fyToken POOL
        const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken.address)
        await factory.createPool(base.address, fyToken.address)
        const pool = (await ethers.getContractAt('Pool', calculatedAddress, owner) as unknown) as Pool

        // register pool in pools Mapping
        const baseMap = pools.get(_baseId) || new Map(); 
        pools.set(_baseId, baseMap.set(fyTokenId, pool))

        await initPool(_baseId, pool); 

      }
    }


    else  {

      // deploy bases
      for (let baseId of baseIds) {
        const base = (await BaseFactory.deploy() as unknown) as ERC20;
        await base.deployed()
        bases.set(baseId, base)
      }

      // add WETH to bases
      bases.set(ETH, weth9)
      baseIds.unshift(ETH)

      // add Dai to bases
      bases.set(DAI, dai)
      baseIds.unshift(DAI)

      for (let baseId of baseIds) {
        const base = bases.get(baseId) as ERC20
        const fyTokenPoolPairs: Map<string, Pool> = new Map()
        pools.set(baseId, fyTokenPoolPairs)

        for (let maturityId of maturityIds) {

          const fyTokenId = baseId + '-' + maturityId
          
          // deploy fyToken
          const maturity = now + THREE_MONTHS * count++ // We are just assuming that the maturities are '3M', '6M', '9M' and so on
          const fyToken = (await FYTokenFactory.deploy(base.address, maturity) as unknown) as FYTokenMock
          await fyToken.deployed()
          fyTokens.set(fyTokenId, fyToken)

          // deploy base/fyToken pool
          const calculatedAddress = await factory.calculatePoolAddress(base.address, fyToken.address)
          await factory.createPool(base.address, fyToken.address)
          const pool = (await ethers.getContractAt('Pool', calculatedAddress, owner) as unknown) as Pool
          fyTokenPoolPairs.set(fyTokenId, pool)

          await initPool(baseId, pool);
        }
      }
  }  
  
  return new YieldSpaceEnvironment(owner, router, factory, bases, fyTokens, pools)

  }

}
