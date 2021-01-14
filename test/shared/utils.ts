// @ts-ignore
import { BN } from '@openzeppelin/test-helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { formatBytes32String } from 'ethers/lib/utils'
import { expect } from 'chai'

export const ZERO = new BN('0').toString()
export const chainId = 31337 // buidlerevm chain id
export const name = 'Yield'

/// @dev Converts a bignumberish to a BigNumber (this is useful for compatibility between BN and BigNumber)
export const bnify = (num: BigNumberish) => BigNumber.from(num.toString())

/// @dev 2^256 -1
export const MAX = bnify('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

/// @dev Converts a BigNumberish to WAD precision, for BigNumberish up to 10 decimal places
export function toWad(value: BigNumberish): BN {
  let exponent = BigNumber.from(10).pow(BigNumber.from(8))
  return new BN(
    BigNumber.from((value as any) * 10 ** 10)
      .mul(exponent)
      .toString()
  )
}

/// @dev Converts a BigNumberish to RAY precision, for BigNumberish up to 10 decimal places
export function toRay(value: BigNumberish): BigNumber {
  let exponent = BigNumber.from(10).pow(BigNumber.from(17))
  return BigNumber.from((value as any) * 10 ** 10).mul(exponent)
}

/// @dev Converts a BigNumberish to RAD precision, for BigNumberish up to 10 decimal places
export function toRad(value: BigNumberish): BigNumber {
  let exponent = BigNumber.from(10).pow(BigNumber.from(35))
  return BigNumber.from((value as any) * 10 ** 10).mul(exponent)
}

// Checks if 2 bignumberish are almost-equal with up to `precision` room for wiggle which by default is 1
export function almostEqual(x: BigNumberish, y: BigNumberish, precision: BigNumberish = 1) {
  x = bnify(x)
  y = bnify(y)

  if (x.gt(y)) {
    expect(x.sub(y).lte(precision)).to.be.true
  } else {
    expect(y.sub(x).lte(precision)).to.be.true
  }
}

/// @dev Multiplies a BigNumberish in any precision by a BigNumberish in RAY precision, with the output in the first parameter's precision.
/// I.e. mulRay(wad(x), ray(y)) = wad(x*y)
export function mulRay(x: BigNumberish, ray: BigNumberish): BN {
  return new BN(BigNumber.from(x).mul(BigNumber.from(ray)).div(UNIT).toString())
}

/// @dev Divides a BigNumberish in any precision by a BigNumberish in RAY precision, with the output in the first parameter's precision.
/// I.e. divRay(wad(x), ray(y)) = wad(x/y)
export function divRay(x: BigNumberish, ray: BigNumberish): BN {
  return new BN(UNIT.mul(BigNumber.from(x)).div(BigNumber.from(ray)).toString())
}

/// @dev Divides a BigNumberish in any precision by a BigNumberish in RAY precision, with the output in the first parameter's precision.
/// Rounds up, careful if using negative numbers.
/// I.e. divRay(wad(x), ray(y)) = wad(x/y)
export function divrupRay(x: BigNumberish, ray: BigNumberish): BN {
  const z = UNIT.mul(BigNumber.from(x)).div(BigNumber.from(ray))
  if (z.mul(ray).div(UNIT) < x) return z.add('1')
  return new BN(z.toString())
}

const UNIT: BigNumber = BigNumber.from(10).pow(BigNumber.from(27))
