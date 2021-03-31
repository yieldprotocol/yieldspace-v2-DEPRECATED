// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./IPoolRouter.sol";
import "./PoolTokenTypes.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "@yield-protocol/utils/contracts/token/IERC2612.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "dss-interfaces/src/dss/DaiAbstract.sol";
import "./helpers/Batchable.sol";
import "./helpers/RevertMsgExtractor.sol";
import "./helpers/TransferFromHelper.sol";
import "./IWETH9.sol";


contract PoolRouter is IPoolRouter, Batchable {
    using TransferFromHelper for IERC20;

    enum TokenType { BASE, FYTOKEN, LP }

    IPoolFactory public immutable factory;

    constructor(address _factory) {
        factory = IPoolFactory(_factory);
    }

    /// @dev Return which pool contract matches the base and fyToken
    function _findPool(address base, address fyToken)
        internal view returns (IPool pool)
    {
        pool = IPool(factory.getPool(base, fyToken));
        require (pool != IPool(address(0)), "Pool not found");
    }

    /// @dev Return which pool contract and token contract match the base, fyToken, and token type.
    function _findToken(address base, address fyToken, PoolTokenTypes.TokenType tokenType)
        internal view returns (IPool pool, address token)
    {
        pool = _findPool(base, fyToken);
        if (tokenType == PoolTokenTypes.TokenType.BASE) token = base;
        if (tokenType == PoolTokenTypes.TokenType.FYTOKEN) token = fyToken;
        if (tokenType == PoolTokenTypes.TokenType.LP) token = address(pool);
    }

    /// @dev Allow users to route calls to a pool, to be used with multicall
    function route(address base, address fyToken, bytes calldata data, bool revertOnFail)
        public payable override
        returns (bool success, bytes memory result)
    {
        (success, result) = address(_findPool(base, fyToken)).call{ value: msg.value }(data);
        require(success || !revertOnFail, RevertMsgExtractor.getRevertMsg(result));
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with multicall
    function transferToPool(address base, address fyToken, PoolTokenTypes.TokenType tokenType, uint128 wad)
        public payable override
        returns (bool)
    {
        (IPool pool, address token) = _findToken(base, fyToken, tokenType);
        IERC20(token).safeTransferFrom(msg.sender, address(pool), wad);
        return true;
    }

    // ---- Permit management ----

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken
    function forwardPermit(address base, address fyToken, PoolTokenTypes.TokenType tokenType, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        public
    {
        (, address token) = _findToken(base, fyToken, tokenType);
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken
    function forwardDaiPermit(address base, address fyToken, PoolTokenTypes.TokenType tokenType, address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s)
        public
    {
        (, address token) = _findToken(base, fyToken, tokenType);
        DaiAbstract(token).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }

    // ---- Ether management ----

    /// @dev The WETH9 contract will send ether to the PoolRouter on `weth.withdraw` using this function.
    receive() external payable { }

    /// @dev Accept Ether, wrap it and forward it to the WethJoin
    /// This function should be called first in a multicall, and the Join should keep track of stored reserves
    /// Passing the id for a join that doesn't link to a contract implemnting IWETH9 will fail
    function joinEther(address base, address fyToken)
        public payable
        returns (uint256 ethTransferred)
    {
        ethTransferred = address(this).balance;

        IPool pool = _findPool(base, fyToken);
        IWETH9 weth = IWETH9(base);

        weth.deposit{ value: ethTransferred }();   // TODO: Test gas savings using WETH10 `depositTo`
        weth.transfer(address(pool), ethTransferred);
    }

    /// @dev Unwrap Wrapped Ether held by this Ladle, and send the Ether
    /// This function should be called last in a multicall, and the Ladle should have no reason to keep an WETH balance
    function exitEther(IWETH9 weth, address payable to)
        public payable
        returns (uint256 ethTransferred)
    {
        // TODO: Set the WETH contract on constructor or as governance, to avoid calls to unknown contracts
        ethTransferred = weth.balanceOf(address(this));

        weth.withdraw(ethTransferred);   // TODO: Test gas savings using WETH10 `withdrawTo`
        to.transfer(ethTransferred); /// TODO: Consider reentrancy and safe transfers
    }
}