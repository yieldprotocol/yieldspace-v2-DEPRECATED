
The PoolFactory can deterministically create new pool instances.

## Functions
### calculatePoolAddress
```solidity
  function calculatePoolAddress(
    address base,
    address fyToken
  ) external returns (address)
```

Calculate the deterministic addreess of a pool, based on the base token & fy token.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`base` | address | Address of the base token (such as Base).
|`fyToken` | address | Address of the fixed yield token (such as fyToken).

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`The`| address | calculated pool address.
### getPool
```solidity
  function getPool(
    address base,
    address fyToken
  ) external returns (address pool)
```

Calculate the addreess of a pool, and return address(0) if not deployed.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`base` | address | Address of the base token (such as Base).
|`fyToken` | address | Address of the fixed yield token (such as fyToken).

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`pool`| address | The deployed pool address.
### createPool
```solidity
  function createPool(
    address base,
    address fyToken
  ) external returns (address)
```

Deploys a new pool.
base & fyToken are written to temporary storage slots to allow for simpler
address calculation, while still allowing the Pool contract to store the values as
immutable.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`base` | address | Address of the base token (such as Base).
|`fyToken` | address | Address of the fixed yield token (such as fyToken).

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`pool`| address | The pool address.
### setParameter
```solidity
  function setParameter(
  ) external
```

Set the ts, g1 or g2 parameters


## Events
### ParameterSet
```solidity
  event ParameterSet(
  )
```



