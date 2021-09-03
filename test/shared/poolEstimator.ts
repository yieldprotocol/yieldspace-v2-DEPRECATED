import { BigNumber, BigNumberish } from 'ethers'
import { IERC20 } from '../../typechain/IERC20'
import { Pool } from '../../typechain/Pool'
import { mint, burn, sellBase, sellFYToken, buyBase, buyFYToken, mintWithBase, burnForBase } from '../../src/yieldspace'
import { ethers } from 'hardhat'

async function currentTimestamp() {
  return (await ethers.provider.getBlock('latest')).timestamp
}

export class PoolEstimator {
  pool: Pool
  base: IERC20
  fyToken: IERC20

  constructor(pool: Pool, base: IERC20, fyToken: IERC20) {
    this.pool = pool
    this.base = base
    this.fyToken = fyToken
  }

  public static async setup(pool: Pool): Promise<PoolEstimator> {
    const base = (await ethers.getContractAt('IERC20', await pool.base())) as IERC20
    const fyToken = (await ethers.getContractAt('IERC20', await pool.fyToken())) as IERC20
    return new PoolEstimator(pool, base, fyToken)
  }

  public async sellBase(): Promise<BigNumber> {
    return sellBase(
      await this.pool.getBaseBalance(),
      await this.pool.getFYTokenBalance(),
      (await this.pool.getBaseBalance()).sub((await this.pool.getCache())[0]),
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }

  public async sellFYToken(): Promise<BigNumber> {
    return sellFYToken(
      await this.pool.getBaseBalance(),
      await this.pool.getFYTokenBalance(),
      (await this.pool.getFYTokenBalance()).sub((await this.pool.getCache())[1]),
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }

  public async buyBase(tokenOut: BigNumberish): Promise<BigNumber> {
    return buyBase(
      await this.pool.getBaseBalance(),
      await this.pool.getFYTokenBalance(),
      BigNumber.from(tokenOut),
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }

  public async buyFYToken(tokenOut: BigNumberish): Promise<BigNumber> {
    return buyFYToken(
      await this.pool.getBaseBalance(),
      await this.pool.getFYTokenBalance(),
      BigNumber.from(tokenOut),
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }

  public async mint(input: BigNumber, fromBase: boolean): Promise<[BigNumber, BigNumber]> {
    return mint(
      await this.base.balanceOf(this.pool.address),
      await this.fyToken.balanceOf(this.pool.address),
      await this.pool.totalSupply(),
      input,
      fromBase
    )
  }

  public async burn(lpTokens: BigNumber): Promise<[BigNumber, BigNumber]> {
    return burn(
      await this.base.balanceOf(this.pool.address),
      await this.fyToken.balanceOf(this.pool.address),
      await this.pool.totalSupply(),
      lpTokens
    )
  }

  public async mintWithBase(fyToken: BigNumber): Promise<[BigNumber, BigNumber]> {
    return mintWithBase(
      await this.base.balanceOf(this.pool.address),
      await this.pool.getFYTokenBalance(),
      await this.fyToken.balanceOf(this.pool.address),
      await this.pool.totalSupply(),
      fyToken,
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }

  public async burnForBase(lpTokens: BigNumber): Promise<BigNumber> {
    return burnForBase(
      await this.base.balanceOf(this.pool.address),
      await this.pool.getFYTokenBalance(),
      await this.fyToken.balanceOf(this.pool.address),
      await this.pool.totalSupply(),
      lpTokens,
      BigNumber.from(await this.pool.maturity()).sub(await currentTimestamp()),
      await this.pool.scaleFactor()
    )
  }
}
