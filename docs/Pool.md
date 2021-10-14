
The Pool contract exchanges base for fyToken at a price defined by a specific formula.

## Functions
### sync
```solidity
  function sync(
  ) external
```

Updates the cache to match the actual balances.


### getCache
```solidity
  function getCache(
  ) external returns (uint112, uint112, uint32)
```

Returns the cached balances & last updated timestamp.


#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Cached`|  | base token balance.
|`Cached`|  | virtual FY token balance.
|`Timestamp`|  | that balances were last cached.
### getFYTokenBalance
```solidity
  function getFYTokenBalance(
  ) public returns (uint112)
```

Returns the "virtual" fyToken balance, which is the real balance plus the pool token supply.


### getBaseBalance
```solidity
  function getBaseBalance(
  ) public returns (uint112)
```

Returns the base balance


### _getFYTokenBalance
```solidity
  function _getFYTokenBalance(
  ) internal returns (uint112)
```

Returns the "virtual" fyToken balance, which is the real balance plus the pool token supply.


### _getBaseBalance
```solidity
  function _getBaseBalance(
  ) internal returns (uint112)
```

Returns the base balance


### retrieveBase
```solidity
  function retrieveBase(
  ) external returns (uint128 retrieved)
```

Retrieve any base tokens not accounted for in the cache


### retrieveFYToken
```solidity
  function retrieveFYToken(
  ) external returns (uint128 retrieved)
```

Retrieve any fyTokens not accounted for in the cache


### mint
```solidity
  function mint(
    address to,
    bool calculateFromBase,
    uint256 minRatio,
    uint256 maxRatio
  ) external returns (uint256, uint256, uint256)
```

Mint liquidity tokens in exchange for adding base and fyToken
The amount of liquidity tokens to mint is calculated from the amount of unaccounted for base tokens in this contract.
A proportional amount of fyTokens needs to be present in this contract, also unaccounted for.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the minted liquidity tokens.
|`calculateFromBase` | bool | Calculate the amount of tokens to mint from the base tokens available, leaving a fyToken surplus.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`The`| address | amount of liquidity tokens minted.
### mintWithBase
```solidity
  function mintWithBase(
    address to,
    uint256 fyTokenToBuy,
    uint256 minRatio,
    uint256 maxRatio
  ) external returns (uint256, uint256, uint256)
```

Mint liquidity tokens in exchange for adding only base
The amount of liquidity tokens is calculated from the amount of fyToken to buy from the pool.
The base tokens need to be present in this contract, unaccounted for.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the minted liquidity tokens.
|`fyTokenToBuy` | uint256 | Amount of `fyToken` being bought in the Pool, from this we calculate how much base it will be taken in.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`The`| address | amount of liquidity tokens minted.
### _mintInternal
```solidity
  function _mintInternal(
    address to,
    bool calculateFromBase,
    uint256 fyTokenToBuy,
    uint256 minRatio,
    uint256 maxRatio
  ) internal returns (uint256 baseIn, uint256 fyTokenIn, uint256 tokensMinted)
```

Mint liquidity tokens in exchange for adding only base, if fyTokenToBuy > 0.
If fyTokenToBuy == 0, mint liquidity tokens for both basea and fyToken.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the minted liquidity tokens.
|`calculateFromBase` | bool | Calculate the amount of tokens to mint from the base tokens available, leaving a fyToken surplus.
|`fyTokenToBuy` | uint256 | Amount of `fyToken` being bought in the Pool, from this we calculate how much base it will be taken in.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

### burn
```solidity
  function burn(
    address baseTo,
    address fyTokenTo,
    uint256 minRatio,
    uint256 maxRatio
  ) external returns (uint256, uint256, uint256)
```

Burn liquidity tokens in exchange for base and fyToken.
The liquidity tokens need to be in this contract.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseTo` | address | Wallet receiving the base.
|`fyTokenTo` | address | Wallet receiving the fyToken.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`The`| address | amount of tokens burned and returned (tokensBurned, bases, fyTokens).
### burnForBase
```solidity
  function burnForBase(
    address to,
    uint256 minRatio,
    uint256 maxRatio
  ) external returns (uint256 tokensBurned, uint256 baseOut)
```

Burn liquidity tokens in exchange for base.
The liquidity provider needs to have called `pool.approve`.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the base and fyToken.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`tokensBurned`| address | The amount of lp tokens burned.
|`baseOut`| uint256 | The amount of base tokens returned.
### _burnInternal
```solidity
  function _burnInternal(
    address baseTo,
    address fyTokenTo,
    bool tradeToBase,
    uint256 minRatio,
    uint256 maxRatio
  ) internal returns (uint256 tokensBurned, uint256 tokenOut, uint256 fyTokenOut)
```

Burn liquidity tokens in exchange for base.
The liquidity provider needs to have called `pool.approve`.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseTo` | address | Wallet receiving the base.
|`fyTokenTo` | address | Wallet receiving the fyToken.
|`tradeToBase` | bool | Whether the resulting fyToken should be traded for base tokens.
|`minRatio` | uint256 | Minimum ratio of base to fyToken in the pool.
|`maxRatio` | uint256 | Minimum ratio of base to fyToken in the pool.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`tokensBurned`| address | The amount of pool tokens burned.
|`tokenOut`| address | The amount of base tokens returned.
|`fyTokenOut`| bool | The amount of fyTokens returned.
### sellBase
```solidity
  function sellBase(
    address to,
    uint128 min
  ) external returns (uint128)
```

Sell base for fyToken.
The trader needs to have transferred the amount of base to sell to the pool before in the same transaction.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the fyToken being bought
|`min` | uint128 | Minimm accepted amount of fyToken

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| address | of fyToken that will be deposited on `to` wallet
### sellBasePreview
```solidity
  function sellBasePreview(
    uint128 baseIn
  ) external returns (uint128)
```

Returns how much fyToken would be obtained by selling `baseIn` base

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`baseIn` | uint128 | Amount of base hypothetically sold.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| uint128 | of fyToken hypothetically bought.
### buyBase
```solidity
  function buyBase(
    address to,
    uint128 tokenOut,
    uint128 max
  ) external returns (uint128)
```

Buy base for fyToken
The trader needs to have called `fyToken.approve`

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the base being bought
|`tokenOut` | uint128 | Amount of base being bought that will be deposited in `to` wallet
|`max` | uint128 | Maximum amount of fyToken that will be paid for the trade

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| address | of fyToken that will be taken from caller
### buyBasePreview
```solidity
  function buyBasePreview(
    uint128 tokenOut
  ) external returns (uint128)
```

Returns how much fyToken would be required to buy `tokenOut` base.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`tokenOut` | uint128 | Amount of base hypothetically desired.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| uint128 | of fyToken hypothetically required.
### sellFYToken
```solidity
  function sellFYToken(
    address to,
    uint128 min
  ) external returns (uint128)
```

Sell fyToken for base
The trader needs to have transferred the amount of fyToken to sell to the pool before in the same transaction.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the base being bought
|`min` | uint128 | Minimm accepted amount of base

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| address | of base that will be deposited on `to` wallet
### sellFYTokenPreview
```solidity
  function sellFYTokenPreview(
    uint128 fyTokenIn
  ) external returns (uint128)
```

Returns how much base would be obtained by selling `fyTokenIn` fyToken.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`fyTokenIn` | uint128 | Amount of fyToken hypothetically sold.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| uint128 | of base hypothetically bought.
### buyFYToken
```solidity
  function buyFYToken(
    address to,
    uint128 fyTokenOut,
    uint128 max
  ) external returns (uint128)
```

Buy fyToken for base
The trader needs to have called `base.approve`

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`to` | address | Wallet receiving the fyToken being bought
|`fyTokenOut` | uint128 | Amount of fyToken being bought that will be deposited in `to` wallet
|`max` | uint128 | Maximum amount of base token that will be paid for the trade

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| address | of base that will be taken from caller's wallet
### buyFYTokenPreview
```solidity
  function buyFYTokenPreview(
    uint128 fyTokenOut
  ) external returns (uint128)
```

Returns how much base would be required to buy `fyTokenOut` fyToken.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`fyTokenOut` | uint128 | Amount of fyToken hypothetically desired.

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Amount`| uint128 | of base hypothetically required.
## Events
### Trade
```solidity
  event Trade(
  )
```



### Liquidity
```solidity
  event Liquidity(
  )
```



### Sync
```solidity
  event Sync(
  )
```



