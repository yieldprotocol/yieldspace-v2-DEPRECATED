import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { BigNumberish, ContractTransaction } from 'ethers'
import { PoolRouter } from '../typechain/PoolRouter'

export const OPS = {
  ROUTE: 0,
  TRANSFER_TO_POOL: 1,
  FORWARD_PERMIT: 2,
  FORWARD_DAI_PERMIT: 3,
  JOIN_ETHER: 4,
  EXIT_ETHER: 5
  }

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

  public async batch(bases: Array<string>, fyTokens: Array<string>, targets: Array<BigNumberish>, ops: Array<BigNumberish>, data: Array<string>): Promise<ContractTransaction> {
    return this.router.batch(bases, fyTokens, targets, ops, data)
  }

  public forwardPermitData(token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
      [token, spender, amount, deadline, v, r, s]
    ))
  }

  public async forwardPermit(base: string, fyToken: string, token: string, spender: string, amount: BigNumberish, deadline: BigNumberish, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    const action = this.forwardPermitData(token, spender, amount, deadline, v, r, s)
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data])
  }

  public forwardDaiPermitData(spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): BatchAction {
    return new BatchAction(OPS.FORWARD_DAI_PERMIT, ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bool', 'uint8', 'bytes32', 'bytes32'],
      [spender, nonce, deadline, allowed, v, r, s]
    ))
  }

  public async forwardDaiPermit(base: string, fyToken: string, spender: string, nonce: BigNumberish, deadline: BigNumberish, allowed: boolean, v: BigNumberish, r: Buffer, s: Buffer): Promise<ContractTransaction> {
    // The vaultId parameter is irrelevant to forwardDaiPermit, but necessary when included in a batch
    const action = this.forwardDaiPermitData(spender, nonce, deadline, allowed, v, r, s)
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data])
  }

  public joinEtherData(): BatchAction {
    return new BatchAction(OPS.JOIN_ETHER, ethers.utils.defaultAbiCoder.encode(['uint256'], [0]))
  }

  public async joinEther(base: string, fyToken: string, overrides?: any): Promise<ContractTransaction> {
    const action = this.joinEtherData()
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data], overrides)
  }

  public exitEtherData(to: string): BatchAction {
    return new BatchAction(OPS.EXIT_ETHER, ethers.utils.defaultAbiCoder.encode(['address'], [to]))
  }

  public async exitEther(base: string, fyToken: string, to: string): Promise<ContractTransaction> {
    const action = this.exitEtherData(to)
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data])
  }

  public transferToPoolData(token: string, wad: BigNumberish): BatchAction {
    return new BatchAction(OPS.TRANSFER_TO_POOL, ethers.utils.defaultAbiCoder.encode(['address', 'uint128'], [token, wad]))
  }

  public async transferToPool(base: string, fyToken: string, token: string, wad: BigNumberish): Promise<ContractTransaction> {
    const action = this.transferToPoolData(token, wad)
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data])
  }

  public routeData(call: string): BatchAction {
    return new BatchAction(OPS.ROUTE, call)  // `call` is already an encoded function call, no need to abi-encode it again
  }

  public async route(base: string, fyToken: string, innerCall: string): Promise<ContractTransaction> {
    const action = this.routeData(innerCall)
    return this.router.batch([base], [fyToken], [0], [action.op], [action.data])
  }
}
  