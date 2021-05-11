import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { ethers, BigNumberish, ContractTransaction, BytesLike, PayableOverrides } from 'ethers'
import { Pool } from '../typechain/Pool'
import { PoolRouter } from '../typechain/PoolRouter'
import { OPS } from './constants'

export class BatchAction {
  op: BigNumberish
  data: string

  constructor(op: BigNumberish, data: string) {
    this.op = op
    this.data = data
  }
}

export class PoolRouterWrapper {
  router: PoolRouter
  address: string

  pool = new ethers.utils.Interface([
      "function sellBaseToken(address to, uint128 min)",
      "function sellFYToken(address to, uint128 min)",
      "function mintWithBaseToken(address to, uint256 fyTokenToBuy, uint256 minTokensMinted)",
      "function burnForBaseToken(address to, uint256 minBaseTokenOut)",
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

  public async batch(actions: Array<BatchAction>, overrides?: PayableOverrides): Promise<ContractTransaction> {
    const ops = new Array<BigNumberish>()
    const data = new Array<BytesLike>()
    actions.forEach(action => {
      ops.push(action.op)
      data.push(action.data)
    });
    if (overrides === undefined) return this.router.batch(ops, data)
    else return this.router.batch(ops, data, overrides)
  }

  public forwardPermitAction(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
      [base, fyToken, token, spender, amount, deadline, v, r, s]
    ))
  }

  public async forwardPermit(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.batch([this.forwardPermitAction(base, fyToken, token, spender, amount, deadline, v, r, s)])
  }

  public forwardDaiPermitAction(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_DAI_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint8', 'bytes32', 'bytes32'],
      [base, fyToken, spender, nonce, deadline, allowed, v, r, s]
    ))
  }

  public async forwardDaiPermit(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.batch([this.forwardDaiPermitAction(base, fyToken, spender, nonce, deadline, allowed, v, r, s)])
  }

  public joinEtherAction(base: string, fyToken: string): BatchAction {
    return new BatchAction(OPS.JOIN_ETHER, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [base, fyToken]
    ))
  }

  public async joinEther(base: string, fyToken: string, overrides?: any): Promise<ContractTransaction> {
    return this.batch([this.joinEtherAction(base, fyToken)], overrides)
  }

  public exitEtherAction(to: string): BatchAction {
    return new BatchAction(OPS.EXIT_ETHER, ethers.utils.defaultAbiCoder.encode(
      ['address'],
      [to]
    ))
  }

  public async exitEther(to: string): Promise<ContractTransaction> {
    return this.batch([this.exitEtherAction(to)])
  }

  public transferToPoolAction(base: string, fyToken: string, token: string, wad: BigNumberish): BatchAction {
    return new BatchAction(OPS.TRANSFER_TO_POOL, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'uint128'],
      [base, fyToken, token, wad]
    ))
  }

  public async transferToPool(base: string, fyToken: string, token: string, wad: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.transferToPoolAction(base, fyToken, token, wad)])
  }

  public routeAction(base: string, fyToken: string, poolcall: string): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [base, fyToken, poolcall]
    ))
  }

  public async route(base: string, fyToken: string, poolcall: string): Promise<ContractTransaction> {
    return this.batch([this.routeAction(base, fyToken, poolcall)])
  }

  public sellBaseTokenAction(base: string, fyToken: string, receiver: string, min: BigNumberish): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [
        base,
        fyToken,
        this.pool.encodeFunctionData('sellBaseToken', [receiver, min])
      ]
    ))
  }

  public async sellBaseToken(base: string, fyToken: string, receiver: string, min: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.sellBaseTokenAction(base, fyToken, receiver, min)])
  }

  public sellFYTokenAction(base: string, fyToken: string, receiver: string, min: BigNumberish): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [
        base,
        fyToken,
        this.pool.encodeFunctionData('sellFYToken', [receiver, min])
      ]
    ))
  }

  public async sellFYToken(base: string, fyToken: string, receiver: string, min: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.sellFYTokenAction(base, fyToken, receiver, min)])
  }

  public mintWithBaseTokenAction(base: string, fyToken: string, receiver: string, fyTokenToBuy: BigNumberish, minTokensMinted: BigNumberish): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [
        base,
        fyToken,
        this.pool.encodeFunctionData('mintWithBaseToken', [receiver, fyTokenToBuy, minTokensMinted])
      ]
    ))
  }

  public async mintWithBaseToken(base: string, fyToken: string, receiver: string, fyTokenToBuy: BigNumberish, minTokensMinted: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.mintWithBaseTokenAction(base, fyToken, receiver, fyTokenToBuy, minTokensMinted)])
  }

  public burnForBaseTokenAction(base: string, fyToken: string, receiver: string, minBaseTokenOut: BigNumberish): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [
        base,
        fyToken,
        this.pool.encodeFunctionData('burnForBaseToken', [receiver, minBaseTokenOut])
      ]
    ))
  }

  public async burnForBaseToken(base: string, fyToken: string, receiver: string, minBaseTokenOut: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.burnForBaseTokenAction(base, fyToken, receiver, minBaseTokenOut)])
  }
}
  