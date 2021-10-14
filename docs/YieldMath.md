Ethereum smart contract library implementing Yield Math model.


## Functions
### invariant
```solidity
  function invariant(
  ) public returns (uint128)
```
Calculate a YieldSpace pool invariant according to the whitepaper



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
https://www.desmos.com/calculator/5nf2xuy6yb


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`baseAmount` | uint128 | base amount to be traded
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
Calculate the amount of base a user would get for certain amount of fyToken.
https://www.desmos.com/calculator/6jlrre7ybt


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | base reserves amount
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
https://www.desmos.com/calculator/0rgnmtckvy


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | base reserves amount
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
Calculate the amount of base a user would have to pay for certain amount of fyToken.
https://www.desmos.com/calculator/ws5oqj8x5i


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
|`the`| uint128 | amount of base a user would have to pay for given amount of
        fyToken
### maxFYTokenOut
```solidity
  function maxFYTokenOut(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the max amount of fyTokens that can be bought from the pool without making the interest rate negative.
See section 6.3 of the YieldSpace White paper


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`max`| uint128 | amount of fyTokens that can be bought from the pool
### maxFYTokenIn
```solidity
  function maxFYTokenIn(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the max amount of fyTokens that can be sold to into the pool.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`max`| uint128 | amount of fyTokens that can be sold to into the pool
### maxBaseIn
```solidity
  function maxBaseIn(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the max amount of base that can be sold to into the pool without making the interest rate negative.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`max`| uint128 | amount of base that can be sold to into the pool
### maxBaseOut
```solidity
  function maxBaseOut(
    uint128 baseReserves,
    uint128 fyTokenReserves,
    uint128 timeTillMaturity,
    int128 ts,
    int128 g
  ) public returns (uint128)
```
Calculate the max amount of base that can be bought from the pool.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseReserves` | uint128 | Base reserves amount
|`fyTokenReserves` | uint128 | fyToken reserves amount
|`timeTillMaturity` | uint128 | time till maturity in seconds
|`ts` | int128 | time till maturity coefficient, multiplied by 2^64
|`g` | int128 | fee coefficient, multiplied by 2^64

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`max`| uint128 | amount of base that can be bought from the pool
