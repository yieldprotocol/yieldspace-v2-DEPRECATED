import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { ethers, BigNumberish, ContractTransaction, BytesLike, PayableOverrides } from 'ethers'
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

  public forwardPermitData(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
      [base, fyToken, token, spender, amount, deadline, v, r, s]
    ))
  }

  public async forwardPermit(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.batch([this.forwardPermitData(base, fyToken, token, spender, amount, deadline, v, r, s)])
  }

  public forwardDaiPermitData(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_DAI_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint8', 'bytes32', 'bytes32'],
      [base, fyToken, spender, nonce, deadline, allowed, v, r, s]
    ))
  }

  public async forwardDaiPermit(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    return this.batch([this.forwardDaiPermitData(base, fyToken, spender, nonce, deadline, allowed, v, r, s)])
  }

  public joinEtherData(base: string, fyToken: string): BatchAction {
    return new BatchAction(OPS.JOIN_ETHER, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [base, fyToken]
    ))
  }

  public async joinEther(base: string, fyToken: string, overrides?: any): Promise<ContractTransaction> {
    return this.batch([this.joinEtherData(base, fyToken)], overrides)
  }

  public exitEtherData(to: string): BatchAction {
    return new BatchAction(OPS.EXIT_ETHER, ethers.utils.defaultAbiCoder.encode(
      ['address'],
      [to]
    ))
  }

  public async exitEther(to: string): Promise<ContractTransaction> {
    return this.batch([this.exitEtherData(to)])
  }

  public transferToPoolData(base: string, fyToken: string, token: string, wad: BigNumberish): BatchAction {
    return new BatchAction(OPS.TRANSFER_TO_POOL, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'address', 'uint128'],
      [base, fyToken, token, wad]
    ))
  }

  public async transferToPool(base: string, fyToken: string, token: string, wad: BigNumberish): Promise<ContractTransaction> {
    return this.batch([this.transferToPoolData(base, fyToken, token, wad)])
  }

  public routeData(base: string, fyToken: string, poolcall: string): BatchAction {
    return new BatchAction(OPS.ROUTE, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [base, fyToken, poolcall]
    ))
  }

  public async route(base: string, fyToken: string, poolcall: string): Promise<ContractTransaction> {
    return this.batch([this.routeData(base, fyToken, poolcall)])
  }
}
  