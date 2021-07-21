import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { ethers, BigNumberish, ContractTransaction, BytesLike, PayableOverrides } from 'ethers'
import { PoolRouter } from '../typechain/PoolRouter'


export class PoolRouterWrapper {
  router: PoolRouter
  address: string

  pool = new ethers.utils.Interface([
      "function sellBase(address to, uint128 min)",
      "function sellFYToken(address to, uint128 min)",
      "function mintWithBase(address to, uint256 fyTokenToBuy, uint256 minTokensMinted)",
      "function burnForBase(address to, uint256 minBaseOut)",
  ]);

  constructor(router: PoolRouter) {
    this.router = router
    this.address = router.address
  }

  public static async setup(router: PoolRouter) {
    return new PoolRouterWrapper(router)
  }

  public connect(account: SignerWithAddress): PoolRouterWrapper {
    return new PoolRouterWrapper(this.router.connect(account))
  }

  public async batch(actions: Array<BytesLike>, overrides?: PayableOverrides): Promise<ContractTransaction> {
    if (overrides === undefined) return this.router.batch(actions)
    else return this.router.batch(actions, overrides)
  }

  public forwardPermitAction(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): BytesLike {
    return this.router.interface.encodeFunctionData('forwardPermit', [base, fyToken, token, spender, amount, deadline, v, r, s])
  }

  public async forwardPermit(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.router.forwardPermit(base, fyToken, token, spender, amount, deadline, v, r, s)
  }

  public forwardDaiPermitAction(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): BytesLike {
    return this.router.interface.encodeFunctionData('forwardDaiPermit', [base, fyToken, spender, nonce, deadline, allowed, v, r, s])
  }

  public async forwardDaiPermit(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.router.forwardDaiPermit(base, fyToken, spender, nonce, deadline, allowed, v, r, s)
  }

  public joinEtherAction(base: string, fyToken: string): BytesLike {
    return this.router.interface.encodeFunctionData('joinEther', [base, fyToken])
  }

  public async joinEther(base: string, fyToken: string, overrides?: any): Promise<ContractTransaction> {
    return this.router.joinEther(base, fyToken, overrides)
  }

  public exitEtherAction(to: string): BytesLike {
    return this.router.interface.encodeFunctionData('exitEther', [to])
  }

  public async exitEther(to: string): Promise<ContractTransaction> {
    return this.router.exitEther(to)
  }

  public transferToPoolAction(base: string, fyToken: string, token: string, wad: BigNumberish): BytesLike {
    return this.router.interface.encodeFunctionData('transferToPool', [base, fyToken, token, wad])
  }

  public async transferToPool(base: string, fyToken: string, token: string, wad: BigNumberish): Promise<ContractTransaction> {
    return this.router.transferToPool(base, fyToken, token, wad)
  }

  public routeAction(base: string, fyToken: string, poolcall: string): BytesLike {
    return this.router.interface.encodeFunctionData('route', [base, fyToken, poolcall])
  }

  public async route(base: string, fyToken: string, poolcall: string): Promise<ContractTransaction> {
    return this.router.route(base, fyToken, poolcall)
  }

  public sellBaseAction(base: string, fyToken: string, receiver: string, min: BigNumberish): BytesLike {
    return this.router.interface.encodeFunctionData('route', [base, fyToken, this.pool.encodeFunctionData('sellBase', [receiver, min])])
}

  public async sellBase(base: string, fyToken: string, receiver: string, min: BigNumberish): Promise<ContractTransaction> {
    return this.router.route(base, fyToken, this.sellBaseAction(base, fyToken, receiver, min))
  }

  public sellFYTokenAction(base: string, fyToken: string, receiver: string, min: BigNumberish): BytesLike {
    return this.router.interface.encodeFunctionData('route', [base, fyToken, this.pool.encodeFunctionData('sellFYToken', [receiver, min])])
  }

  public async sellFYToken(base: string, fyToken: string, receiver: string, min: BigNumberish): Promise<ContractTransaction> {
    return this.router.route(base, fyToken, this.sellFYTokenAction(base, fyToken, receiver, min))
  }

  public mintWithBaseAction(base: string, fyToken: string, receiver: string, fyTokenToBuy: BigNumberish, minTokensMinted: BigNumberish): BytesLike {
    return this.router.interface.encodeFunctionData('route', [base, fyToken, this.pool.encodeFunctionData('mintWithBase', [receiver, fyTokenToBuy, minTokensMinted])])
  }

  public async mintWithBase(base: string, fyToken: string, receiver: string, fyTokenToBuy: BigNumberish, minTokensMinted: BigNumberish): Promise<ContractTransaction> {
    return this.router.route(base, fyToken, this.mintWithBaseAction(base, fyToken, receiver, fyTokenToBuy, minTokensMinted))
  }

  public burnForBaseAction(base: string, fyToken: string, receiver: string, minBaseOut: BigNumberish): BytesLike {
    return this.router.interface.encodeFunctionData('route', [base, fyToken, this.pool.encodeFunctionData('burnForBase', [receiver, minBaseOut])])
  }

  public async burnForBase(base: string, fyToken: string, receiver: string, minBaseOut: BigNumberish): Promise<ContractTransaction> {
    return this.router.route(base, fyToken, this.burnForBaseAction(base, fyToken, receiver, minBaseOut))
  }
}
  