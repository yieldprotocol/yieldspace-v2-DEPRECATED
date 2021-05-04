import { ethers, BigNumber } from 'ethers';
import { Decimal } from 'decimal.js';

Decimal.set({ precision: 64 });

/* constants exposed for export */
export const ZERO_DEC: Decimal = new Decimal(0);
export const ONE_DEC: Decimal = new Decimal(1);
export const TWO_DEC: Decimal = new Decimal(2);
export const SECONDS_PER_YEAR: number = (365 * 24 * 60 * 60);

/* locally used constants */
const ZERO = ZERO_DEC;
const ONE = ONE_DEC;
const TWO = TWO_DEC;
const k = new Decimal(1 / 126144000); // inv of seconds in 4 years
const g1 = new Decimal(950 / 1000);
const g2 = new Decimal(1000 / 950);
const precisionFee = new Decimal(1000000000000);

/** *************************
 Support functions
 *************************** */

/**
 * @param { BigNumber | string } multiplicant
 * @param { BigNumber | string } multiplier
 * @param { string } precisionDifference  // Difference between multiplicant and multiplier precision (eg. wei vs ray '1e-27' )
 * @returns { string } in decimal precision of the multiplicant
 */
export const mulDecimal = (
  multiplicant: BigNumber | string,
  multiplier: BigNumber | string,
  precisionDifference: string = '1', // DEFAULT = 1 (same precision)
): string => {
  const multiplicant_ = new Decimal(multiplicant.toString());
  const multiplier_ = new Decimal(multiplier.toString());
  const _preDif = new Decimal(precisionDifference.toString());
  const _normalisedMul = multiplier_.mul(_preDif);
  return multiplicant_.mul(_normalisedMul).toFixed();
};

/**
 * @param  { BigNumber | string } numerator
 * @param { BigNumber | string } divisor
 * @param { BigNumber | string } precisionDifference // Difference between multiplicant and mulitplier precision (eg. wei vs ray '1e-27' )
 * @returns { string } in decimal precision of the numerator
 */
export const divDecimal = (
  numerator: BigNumber | string,
  divisor: BigNumber | string,
  precisionDifference: string = '1', // DEFAULT = 1 (same precision)
): string => {
  const numerator_ = new Decimal(numerator.toString());
  const divisor_ = new Decimal(divisor.toString());
  const _preDif = new Decimal(precisionDifference.toString());
  const _normalisedDiv = divisor_.mul(_preDif);
  return numerator_.div(_normalisedDiv).toFixed();
};

/**
 * @param { BigNumber | string } value
 * @returns { string }
 */
export const floorDecimal = (value: BigNumber | string): string => Decimal.floor(value.toString()).toFixed();

/**
 * @param { Decimal } value
 * @returns { BigNumber }
 */
export const toBn = (value: Decimal): BigNumber => BigNumber.from(floorDecimal(value.toFixed()));

/**
 * @param { BigNumber | string } to unix time
 * @param { BigNumber | string } from  unix time *optional* default: now
 * @returns { string } as number seconds 'from' -> 'to'
 */
export const secondsToFrom = (
  to: BigNumber | string,
  from: BigNumber | string = BigNumber.from(Math.round(new Date().getTime() / 1000)), // OPTIONAL: FROM defaults to current time if omitted
) : string => {
  const to_ = ethers.BigNumber.isBigNumber(to) ? to : BigNumber.from(to);
  const from_ = ethers.BigNumber.isBigNumber(from) ? from : BigNumber.from(from);
  return to_.sub(from_).toString();
};

/** *************************
 YieldSpace functions
 *************************** */

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } totalSupply
 * @param { BigNumber | string } base
 * @returns {[BigNumber, BigNumber]}
 *
 * https://www.desmos.com/calculator/mllhtohxfx
 */
export function mint(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  totalSupply: BigNumber | string,
  mainTokenIn: BigNumber | string,
  fromBase: boolean
) : [ BigNumber, BigNumber ] {
  const baseReserves_ = new Decimal(baseReserves.toString());
  const fyTokenReserves_ = new Decimal(fyTokenReserves.toString());
  const supply_ = new Decimal(totalSupply.toString());
  const mainTokenIn_ = new Decimal(mainTokenIn.toString());

  let minted: Decimal
  let secTokenIn: Decimal
  if (fromBase) {
    minted = (supply_.mul(mainTokenIn_)).div(baseReserves_);
    secTokenIn = (fyTokenReserves_.mul(minted)).div(supply_);
  } else {
    minted = (supply_.mul(mainTokenIn_)).div(fyTokenReserves_);
    secTokenIn = (baseReserves_.mul(minted)).div(supply_);
  }
  return [toBn(minted), toBn(secTokenIn)];
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } totalSupply
 * @param lpTokens { BigNumber | string }
 * @returns {[BigNumber, BigNumber]}
 *
 * https://www.desmos.com/calculator/ubsalzunpo
 */
export function burn(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  totalSupply: BigNumber | string,
  lpTokens: BigNumber | string,
): [ BigNumber, BigNumber ] {
  const Z = new Decimal(baseReserves.toString());
  const Y = new Decimal(fyTokenReserves.toString());
  const S = new Decimal(totalSupply.toString());
  const x = new Decimal(lpTokens.toString());
  const z = (x.mul(Z)).div(S);
  const y = (x.mul(Y)).div(S);
  return [toBn(z), toBn(y)];
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReservesVirtual
 * @param { BigNumber | string } fyTokenReservesReal
 * @param { BigNumber | string } totalSupply
 * @param { BigNumber | string } fyToken
 * @param { BigNumber | string } timeTillMaturity
 * @returns {[BigNumber, BigNumber]}
 */
export function mintWithBase(
  baseReserves: BigNumber|string,
  fyTokenReservesVirtual: BigNumber|string,
  fyTokenReservesReal: BigNumber|string,
  supply: BigNumber|string,
  fyToken: BigNumber|string,
  timeTillMaturity: BigNumber|string,
): [BigNumber, BigNumber] {
  const Z = new Decimal(baseReserves.toString());
  const YR = new Decimal(fyTokenReservesReal.toString());
  const S = new Decimal(supply.toString());
  const y = new Decimal(fyToken.toString());
  // buyFyToken:
  const z1 = new Decimal(buyFYToken(baseReserves, fyTokenReservesVirtual, fyToken, timeTillMaturity).toString());
  // Mint specifying how much fyToken to take in. Reverse of `mint`.
  const m = (S.mul(y)).div(YR.sub(y));
  const z2 = ((Z.add(z1)).mul(m)).div(S);
  return [toBn(m), toBn(z1.add(z2))];
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReservesVirtual
 * @param { BigNumber | string } fyTokenReservesReal
 * @param { BigNumber | string } totalSupply
 * @param { BigNumber | string } lpTokens
 * @param { BigNumber | string } timeTillMaturity
 * @returns { BigNumber }
 */
export function burnForBase(
  baseReserves: BigNumber,
  fyTokenReservesVirtual: BigNumber,
  fyTokenReservesReal: BigNumber,
  supply: BigNumber,
  lpTokens: BigNumber,
  timeTillMaturity: BigNumber,
): BigNumber {
  // Burn FyToken
  const [z1, y] = burn(baseReserves, fyTokenReservesReal, supply, lpTokens);
  // Sell FyToken for base
  const z2 = sellFYToken(baseReserves, fyTokenReservesVirtual, y, timeTillMaturity);
  const z1D = new Decimal(z1.toString());
  const z2D = new Decimal(z2.toString());
  return toBn(z1D.add(z2D));
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } base
 * @param { BigNumber | string } timeTillMaturity
 * @param { boolean } withNoFee
 * @returns { BigNumber }
 */
export function sellBase(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  base: BigNumber | string,
  timeTillMaturity: BigNumber | string,
  withNoFee: boolean = false, // optional: default === false
): BigNumber {
  const baseReserves_ = new Decimal(baseReserves.toString());
  const fyTokenReserves_ = new Decimal(fyTokenReserves.toString());
  const timeTillMaturity_ = new Decimal(timeTillMaturity.toString());
  const dai_ = new Decimal(base.toString());

  const g = withNoFee ? ONE : g1;
  const t = k.mul(timeTillMaturity_);
  const a = ONE.sub(g.mul(t));
  const invA = ONE.div(a);

  const Za = baseReserves_.pow(a);
  const Ya = fyTokenReserves_.pow(a);
  const Zxa = (baseReserves_.add(dai_)).pow(a);
  const sum = (Za.add(Ya)).sub(Zxa);
  const y = fyTokenReserves_.sub(sum.pow(invA));
  const yFee = y.sub(precisionFee);

  return toBn(yFee);
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } fyToken
 * @param { BigNumber | string } timeTillMaturity
 * @param { boolean } withNoFee
 * @returns { BigNumber }
 */
export function sellFYToken(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  fyToken: BigNumber | string,
  timeTillMaturity: BigNumber | string,
  withNoFee: boolean = false, // optional: default === false
): BigNumber {
  const baseReserves_ = new Decimal(baseReserves.toString());
  const fyTokenReserves_ = new Decimal(fyTokenReserves.toString());
  const timeTillMaturity_ = new Decimal(timeTillMaturity.toString());
  const fyDai_ = new Decimal(fyToken.toString());

  const g = withNoFee ? ONE : g2;
  const t = k.mul(timeTillMaturity_);
  const a = ONE.sub(g.mul(t));
  const invA = ONE.div(a);

  const Za = baseReserves_.pow(a);
  const Ya = fyTokenReserves_.pow(a);
  const Yxa = (fyTokenReserves_.add(fyDai_)).pow(a);
  const sum = Za.add(Ya.sub(Yxa));
  const y = baseReserves_.sub(sum.pow(invA));
  const yFee = y.sub(precisionFee);

  return toBn(yFee);
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } base
 * @param { BigNumber | string } timeTillMaturity
 * @param { boolean } withNoFee
 * @returns { BigNumber }
 */
export function buyBase(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  base: BigNumber | string,
  timeTillMaturity: BigNumber | string,
  withNoFee: boolean = false, // optional: default === false
): BigNumber {
  const baseReserves_ = new Decimal(baseReserves.toString());
  const fyTokenReserves_ = new Decimal(fyTokenReserves.toString());
  const timeTillMaturity_ = new Decimal(timeTillMaturity.toString());
  const dai_ = new Decimal(base.toString());

  const g = withNoFee ? ONE : g2;
  const t = k.mul(timeTillMaturity_);
  const a = ONE.sub(g.mul(t));
  const invA = ONE.div(a);

  const Za = baseReserves_.pow(a);
  const Ya = fyTokenReserves_.pow(a);
  const Zxa = (baseReserves_.sub(dai_)).pow(a);
  const sum = (Za.add(Ya)).sub(Zxa);
  const y = (sum.pow(invA)).sub(fyTokenReserves_);
  const yFee = y.add(precisionFee);

  return toBn(yFee);
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } fyToken
 * @param { BigNumber | string } timeTillMaturity
 * @param { boolean } withNoFee
 * @returns { BigNumber }
 */
export function buyFYToken(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  fyToken: BigNumber | string,
  timeTillMaturity: BigNumber | string,
  withNoFee: boolean = false, // optional: default === false
): BigNumber {
  const baseReserves_ = new Decimal(baseReserves.toString());
  const fyTokenReserves_ = new Decimal(fyTokenReserves.toString());
  const timeTillMaturity_ = new Decimal(timeTillMaturity.toString());
  const fyDai_ = new Decimal(fyToken.toString());

  const g = withNoFee ? ONE : g1;
  const t = k.mul(timeTillMaturity_);
  const a = ONE.sub(g.mul(t));
  const invA = ONE.div(a);

  const Za = baseReserves_.pow(a);
  const Ya = fyTokenReserves_.pow(a);
  const Yxa = (fyTokenReserves_.sub(fyDai_)).pow(a);
  const sum = Za.add(Ya.sub(Yxa));
  const y = (sum.pow(invA)).sub(baseReserves_);
  const yFee = y.add(precisionFee);

  return toBn(yFee);
}

/**
 * @param { BigNumber | string } baseReserves
 * @param { BigNumber | string } fyTokenReserves
 * @param { BigNumber | string } fyToken
 * @param { BigNumber | string } timeTillMaturity
 * @returns { BigNumber }
 */
export function getFee(
  baseReserves: BigNumber | string,
  fyTokenReserves: BigNumber | string,
  fyToken: BigNumber | string,
  timeTillMaturity: BigNumber | string,
): BigNumber {
  let fee_: Decimal = ZERO;
  const fyDai_: BigNumber = BigNumber.isBigNumber(fyToken) ? fyToken : BigNumber.from(fyToken);

  if (fyDai_.gte(ethers.constants.Zero)) {
    const daiWithFee: BigNumber = buyFYToken(baseReserves, fyTokenReserves, fyToken, timeTillMaturity);
    const daiWithoutFee: BigNumber = buyFYToken(baseReserves, fyTokenReserves, fyToken, timeTillMaturity, true);
    fee_ = (new Decimal(daiWithFee.toString())).sub(new Decimal(daiWithoutFee.toString()));
  } else {
    const daiWithFee:BigNumber = sellFYToken(baseReserves, fyTokenReserves, fyDai_.mul(BigNumber.from('-1')), timeTillMaturity);
    const daiWithoutFee:BigNumber = sellFYToken(baseReserves, fyTokenReserves, fyDai_.mul(BigNumber.from('-1')), timeTillMaturity, true);
    fee_ = (new Decimal(daiWithoutFee.toString())).sub(new Decimal(daiWithFee.toString()));
  }
  return toBn(fee_);
}

// export function fyDaiForMint(
//   baseReserves: BigNumber |string,
//   fyDaiRealReserves: BigNumber|string,
//   fyDaiVirtualReserves: BigNumber|string,
//   base: BigNumber|string,
//   timeTillMaturity: BigNumber|string,
// ): string {
//   const baseReserves_ = new Decimal(baseReserves.toString());
//   const fyDaiRealReserves_ = new Decimal(fyDaiRealReserves.toString());
//   const timeTillMaturity_ = new Decimal(timeTillMaturity.toString());
//   const dai_ = new Decimal(base.toString());

//   let min = ZERO;
//   let max = dai_;
//   let yOut = Decimal.floor((min.add(max)).div(TWO));

//   let i = 0;
//   while (true) {
//     const zIn = new Decimal(
//       buyFYDai(
//         baseReserves,
//         fyDaiVirtualReserves,
//         BigNumber.from(yOut.toFixed(0)),
//         timeTillMaturity_.toString(),
//       ),
//     );
//     const Z_1 = baseReserves_.add(zIn); // New base reserves
//     const Y_1 = fyDaiRealReserves_.sub(yOut); // New fyToken reserves
//     const pz = (dai_.sub(zIn)).div((dai_.sub(zIn)).add(yOut)); // base proportion in my assets
//     const PZ = Z_1.div(Z_1.add(Y_1)); // base proportion in the reserves

//     // The base proportion in my assets needs to be higher than but very close to the base proportion in the reserves, to make sure all the fyToken is used.
//     if (PZ.mul(new Decimal(1.000001)) <= pz) min = yOut;
//     yOut = (yOut.add(max)).div(TWO); // bought too little fyToken, buy some more

//     if (pz <= PZ) max = yOut;
//     yOut = (yOut.add(min)).div(TWO); // bought too much fyToken, buy a bit less
//     if (PZ.mul(new Decimal(1.000001)) > pz && pz > PZ) return Decimal.floor(yOut).toFixed(); // Just right

//     // eslint-disable-next-line no-plusplus
//     if (i++ > 10000) return Decimal.floor(yOut).toFixed();
//   }
// }

/**
   * Split a certain amount of X liquidity into its two componetnts (eg. base and fyToken)
   * @param { BigNumber } xReserves // eg. base reserves
   * @param { BigNumber } yReserves // eg. fyToken reservers
   * @param {BigNumber} xAmount // amount to split in wei
   * @returns  [ BigNumber, BigNumber ] returns an array of [base, fyToken]
   */
export const splitLiquidity = (
  xReserves: BigNumber | string,
  yReserves: BigNumber | string,
  xAmount: BigNumber | string,
) : [string, string] => {
  const xReserves_ = new Decimal(xReserves.toString());
  const yReserves_ = new Decimal(yReserves.toString());
  const xAmount_ = new Decimal(xAmount.toString());
  const xPortion = (xAmount_.mul(xReserves_)).div(yReserves_.add(xReserves_));
  const yPortion = xAmount_.sub(xPortion);
  return [xPortion.toFixed(), yPortion.toFixed()];
};

/**
   * Calculate Slippage
   * @param { BigNumber } value
   * @param { BigNumber } slippage optional: defaults to 0.005 (0.5%)
   * @param { number } minimise optional: whether the resutl should be a minimum or maximum (default max)
   * @returns { string } human readable string
   */
export const calculateSlippage = (
  value: BigNumber | string,
  slippage: BigNumber | string = '0.005',
  minimise:boolean = false,
): string => {
  const value_ = new Decimal(value.toString());
  const _slippageAmount = floorDecimal(mulDecimal(value, slippage));
  if (minimise) {
    return value_.sub(_slippageAmount).toFixed();
  }
  return value_.add(_slippageAmount).toFixed();
};

/**
   * Calculate Annualised Yield Rate
   * @param { BigNumber | string } rate // current [base] price per unit y[base]
   * @param { BigNumber | string } amount // y[base] amount at maturity
   * @param { number } maturity  // date of maturity
   * @param { number } fromDate // ***optional*** start date - defaults to now()
   * @returns { string | undefined } human readable string
   */
export const calculateAPR = (
  tradeValue: BigNumber | string,
  amount: BigNumber | string,
  maturity: number,
  fromDate: number = (Math.round(new Date().getTime() / 1000)), // if not provided, defaults to current time.
): string | undefined => {
  const tradeValue_ = new Decimal(tradeValue.toString());
  const amount_ = new Decimal(amount.toString());

  if (
    maturity > Math.round(new Date().getTime() / 1000)
  ) {
    const secsToMaturity = maturity - fromDate;
    const propOfYear = new Decimal(secsToMaturity / SECONDS_PER_YEAR);
    const priceRatio = amount_.div(tradeValue_);
    const powRatio = ONE.div(propOfYear);
    const apr = (priceRatio.pow(powRatio)).sub(ONE);

    if (apr.gt(ZERO) && apr.lt(100)) {
      return apr.mul(100).toFixed();
    }
    return undefined;
  }
  return undefined;
};

/**
   * Calculates the collateralization ratio
   * based on the collat amount and value and debt value.
   * @param { BigNumber | string } collateralAmount  amount of collateral ( in wei)
   * @param { BigNumber | string } collateralPrice price of collateral (in USD)
   * @param { BigNumber | string } debtValue value of base debt (in USD)
   * @param {boolean} asPercent OPTIONAL: flag to return ratio as a percentage
   * @returns { string | undefined }
   */
export const collateralizationRatio = (
  collateralAmount: BigNumber | string,
  collateralPrice: BigNumber | string,
  debtValue: BigNumber | string,
  asPercent: boolean = false, // OPTIONAL:  flag to return as percentage
): string | undefined => {
  if (
    ethers.BigNumber.isBigNumber(debtValue) ? debtValue.isZero() : debtValue === '0'
  ) {
    return undefined;
  }
  const _colVal = mulDecimal(collateralAmount, collateralPrice);
  const _ratio = divDecimal(_colVal, debtValue);

  if (asPercent) {
    return mulDecimal('100', _ratio);
  }
  return _ratio;
};

/**
   * Calcualtes the amount (base, or other variant) that can be borrowed based on
   * an amount of collateral (ETH, or other), and collateral price.
   *
   * @param {BigNumber | string} collateralAmount amount of collateral
   * @param {BigNumber | string} collateralPrice price of unit collateral (in currency x)
   * @param {BigNumber | string} debtValue value of debt (in currency x)
   * @param {BigNumber | string} liquidationRatio  OPTIONAL: 1.5 (150%) as default
   *
   * @returns {string}
   */
export const borrowingPower = (
  collateralAmount: BigNumber | string,
  collateralPrice: BigNumber | string,
  debtValue: BigNumber | string,
  liquidationRatio: string = '1.5', // OPTIONAL: 150% as default
): string => {
  const collateralValue = mulDecimal(collateralAmount, collateralPrice);
  const maxSafeDebtValue_ = new Decimal(divDecimal(collateralValue, liquidationRatio));
  const debtValue_ = new Decimal(debtValue.toString());
  const _max = debtValue_.lt(maxSafeDebtValue_) ? maxSafeDebtValue_.sub(debtValue_) : new Decimal('0');
  return _max.toFixed(0);
};
