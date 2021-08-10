// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.1;

import "@yield-protocol/utils-v2/contracts/access/AccessControl.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC2612.sol";
import "@yield-protocol/utils-v2/contracts/token/AllTransferHelper.sol";
import "@yield-protocol/utils-v2/contracts/utils/RevertMsgExtractor.sol";
import "@yield-protocol/utils-v2/contracts/interfaces/IWETH9.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "@yield-protocol/yieldspace-interfaces/PoolDataTypes.sol";
import "dss-interfaces/src/dss/DaiAbstract.sol";


contract PoolRouter is AccessControl {
    using AllTransferHelper for IERC20;
    using AllTransferHelper for address payable;

    event ModuleSet(address indexed module, bool indexed set);
    event TargetSet(address indexed target, bool indexed set);

    IPoolFactory public immutable factory;
    IWETH9 public immutable weth;

    mapping(address => bool) public modules;
    mapping(address => bool) public targets;

    constructor(IPoolFactory factory_, IWETH9 weth_) {
        factory = factory_;
        weth = weth_;
    }

    /// @dev Add or remove a module.
    function setModule(address module, bool set)
        external
        auth
    {
        modules[module] = set;
        emit ModuleSet(module, set);
    }

    /// @dev Add or remove permit or transfer target contracts.
    function setTargets(address[] memory targets_, bool set)
        external
        auth
    {
        for (uint256 i; i < targets_.length; i++) {
            targets[targets_[i]] = set;
            emit TargetSet(targets_[i], set);
        }
    }

    /// @dev Submit a series of calls for execution
    /// @notice Allows batched call to self (this contract).
    /// @param calls An array of inputs for each call.
    function batch(bytes[] calldata calls) external payable returns(bytes[] memory results) {
        results = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(calls[i]);
            if (!success) revert(RevertMsgExtractor.getRevertMsg(result));
            results[i] = result;
        }
    }

    /// @dev Return which pool contract matches the base and fyToken
    function findPool(address base, address fyToken)
        private view returns (address pool)
    {
        pool = factory.getPool(base, fyToken);
        require (pool != address(0), "Pool not found");
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with batch
    function transfer(address token, address receiver, uint128 wad)
        external payable
        returns (bool)
    {
        require(targets[token], "Unknown token");
        IERC20(token).safeTransferFrom(msg.sender, receiver, wad);
        return true;
    }

    /// @dev Allow users to remove tokens from the Router, to be used with batch
    function retrieve(address token, address receiver, uint128 wad)
        external payable
        returns (bool)
    {
        require(targets[token], "Unknown token");
        IERC20(token).safeTransferFrom(address(this), receiver, wad);
        return true;
    }

    /// @dev Allow users to route calls to a pool, to be used with batch
    function route(address base, address fyToken, bytes memory data)
        external payable
        returns (bytes memory result)
    {
        address pool = findPool(base, fyToken);
        bool success;
        (success, result) = pool.call(data);
        if (!success) revert(RevertMsgExtractor.getRevertMsg(result));
    }

    // ---- Permit management ----

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken, to be used with batch
    function forwardPermit(address token, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external payable
    {
        require(targets[token], "Unknown token");
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken, to be used with batch
    function forwardDaiPermit(address token, address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s)
        external payable
    {
        require(targets[token], "Unknown token");
        DaiAbstract(token).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }

    // ---- Ether management ----

    /// @dev The WETH9 contract will send ether to the PoolRouter on `weth.withdraw` using this function.
    receive() external payable {
        require (msg.sender == address(weth), "Only Weth contract allowed");
    }

    /// @dev Accept Ether, wrap it and forward it to the to a pool
    function joinEther(address base, address fyToken)
        external payable
        returns (uint256 ethTransferred)
    {
        address pool = findPool(base, fyToken);
        ethTransferred = address(this).balance;

        weth.deposit{ value: ethTransferred }();   // TODO: Test gas savings using WETH10 `depositTo`
        IERC20(weth).safeTransfer(pool, ethTransferred);
    }

    /// @dev Unwrap Wrapped Ether held by this Router, and send the Ether
    function exitEther(address to)
        external payable
        returns (uint256 ethTransferred)
    {
        ethTransferred = weth.balanceOf(address(this));

        weth.withdraw(ethTransferred);   // TODO: Test gas savings using WETH10 `withdrawTo`
        payable(to).safeTransferETH(ethTransferred);
    }

    // ---- Module router ----

    /// @dev Allow users to use functionality coded in a module, to be used with batch
    function moduleCall(address module, bytes memory data)
        external payable
        returns (bytes memory result)
    {
        require (modules[module], "Unknown module");
        bool success;
        (success, result) = module.delegatecall(data);
        if (!success) revert(RevertMsgExtractor.getRevertMsg(result));
    }
}