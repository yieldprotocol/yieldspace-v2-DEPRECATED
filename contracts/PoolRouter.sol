// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./IPoolRouter.sol";
import "./PoolTokenTypes.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "@yield-protocol/utils/contracts/token/IERC2612.sol";
import "dss-interfaces/src/dss/DaiAbstract.sol";
import "./helpers/Batchable.sol";
import "./helpers/Ownable.sol";
import "./helpers/RevertMsgExtractor.sol";
import "./helpers/TransferFromHelper.sol";


contract PoolRouter is IPoolRouter, Ownable, Batchable {
    using TransferFromHelper for IERC20;

    enum TokenType { BASE, FYTOKEN, LP }

    mapping(address => mapping(address => IPool)) public pools;

    /// @dev Allow owner to register pools
    function setPool(address base, address fyToken, IPool pool)
        public override
        onlyOwner
    {
        pools[base][fyToken] = pool;
        emit PoolRegistered(base, fyToken, address(pool));
    }

    function _findPool(address base, address fyToken) internal returns (IPool pool) {
        pool = pools[base][fyToken];
        require (pool != IPool(address(0)), "Pool not found");
    }

    function _findToken(address base, address fyToken, PoolTokenTypes.TokenType tokenType) internal returns (IPool pool, address token) {
        pool = _findPool(base, fyToken);
        if (tokenType == PoolTokenTypes.TokenType.BASE)
            token = address(pool.baseToken());
        if (tokenType == PoolTokenTypes.TokenType.FYTOKEN)
            token = address(pool.fyToken());
        if (tokenType == PoolTokenTypes.TokenType.LP)
            token = address(pool);
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
    function forwardPermit(address base, address fyToken, PoolTokenTypes.TokenType tokenType, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
        (, address token) = _findToken(base, fyToken, tokenType);
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken
    function forwardDaiPermit(address base, address fyToken, PoolTokenTypes.TokenType tokenType, address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s) public {
        (, address token) = _findToken(base, fyToken, tokenType);
        DaiAbstract(token).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }
}