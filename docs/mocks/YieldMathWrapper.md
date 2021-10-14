Wrapper for the  Yield Math Smart Contract Library.


## Functions
### fyTokenOutForBaseIn
```solidity
  function fyTokenOutForBaseIn(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 baseAmount,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the amount of fyToken a user would get for given amount of Base.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`baseAmount` | uint128 | Base amount to be traded
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`| uint128 | amount of fyToken a user would get for given amount of Base
### baseOutForFYTokenIn
```solidity
  function baseOutForFYTokenIn(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 fyTokenAmount,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the amount of Base a user would get for certain amount of fyToken.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`fyTokenAmount` | uint128 | fyToken amount to be traded
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`| uint128 | amount of Base a user would get for given amount of fyToken
### fyTokenInForBaseOut
```solidity
  function fyTokenInForBaseOut(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 baseAmount,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the amount of fyToken a user could sell for given amount of Base.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`baseAmount` | uint128 | Base amount to be traded
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`| uint128 | amount of fyToken a user could sell for given amount of Base
### baseInForFYTokenOut
```solidity
  function baseInForFYTokenOut(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 fyTokenAmount,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the amount of Base a user would have to pay for certain amount of
fyToken.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`fyTokenAmount` | uint128 | fyToken amount to be traded
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`the`| uint128 | amount of Base a user would have to pay for given amount of
        fyToken
### pow
```solidity
  function pow(
    uint128 x,
    uint128 y,
    uint128 z
  ) public returns (bool, uint256)
```
Raise given number x into power specified as a simple fraction y/z and then
multiply the result by the normalization factor 2^(128 *(1 - y/z)).
Revert if z is zero, or if both x and y are zeros.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`x` | uint128 | number to raise into given power y/z
|`y` | uint128 | numerator of the power to raise x into
|`z` | uint128 | denominator of the power to raise x into

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`x`| uint128 | raised into power y/z and then multiplied by 2^(128 *(1 - y/z))
### log_2
```solidity
  function log_2(
    uint128 x
  ) public returns (bool, uint128)
```
Calculate base 2 logarithm of an unsigned 128-bit integer number.  Revert
in case x is zero.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`x` | uint128 | number to calculate 2-base logarithm of

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`base`| uint128 | logarithm of x, multiplied by 2^121
### pow_2
```solidity
  function pow_2(
    uint128 x
  ) public returns (bool, uint128)
```
Calculate 2 raised into given power.



#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`x` | uint128 | power to raise 2 into, multiplied by 2^121

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`2`| uint128 | raised into given power
