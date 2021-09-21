// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20Metadata.sol";
import "@yield-protocol/utils-v2/contracts/token/ERC20Permit.sol";
import "@yield-protocol/utils-v2/contracts/token/SafeERC20Namer.sol";
import "@yield-protocol/utils-v2/contracts/token/MinimalTransferHelper.sol";
import "@yield-protocol/utils-v2/contracts/cast/CastU256U128.sol";
import "@yield-protocol/utils-v2/contracts/cast/CastU256U112.sol";
import "@yield-protocol/utils-v2/contracts/cast/CastU256I256.sol";
import "@yield-protocol/utils-v2/contracts/cast/CastU128U112.sol";
import "@yield-protocol/utils-v2/contracts/cast/CastU128I128.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "@yield-protocol/vault-interfaces/IFYToken.sol";
import "./YieldMath.sol";


/// @dev The Pool contract exchanges base for fyToken at a price defined by a specific formula.
contract Pool is IPool, ERC20Permit {
    using CastU256U128 for uint256;
    using CastU256U112 for uint256;
    using CastU256I256 for uint256;
    using CastU128U112 for uint128;
    using CastU128I128 for uint128;
    using MinimalTransferHelper for IERC20;

    event Trade(uint32 maturity, address indexed from, address indexed to, int256 bases, int256 fyTokens);
    event Liquidity(uint32 maturity, address indexed from, address indexed to, address indexed fyTokenTo, int256 bases, int256 fyTokens, int256 poolTokens);
    event Sync(uint112 baseCached, uint112 fyTokenCached, uint256 cumulativeBalancesRatio);

    int128 public immutable ts;              // 1 / Seconds in 10 years, in 64.64
    int128 public immutable g1;             // To be used when selling base to the pool
    int128 public immutable g2;             // To be used when selling fyToken to the pool
    uint32 public immutable override maturity;
    uint96 public immutable scaleFactor;    // Scale up to 18 low decimal tokens to get the right precision in YieldMath

    IERC20 public immutable override base;
    IFYToken public immutable override fyToken;

    uint112 private baseCached;              // uses single storage slot, accessible via getCache
    uint112 private fyTokenCached;           // uses single storage slot, accessible via getCache
    uint32  private blockTimestampLast;      // uses single storage slot, accessible via getCache

    uint256 public cumulativeBalancesRatio;  // Fixed point factor with 27 decimals (ray)

    constructor()
        ERC20Permit(
            string(abi.encodePacked("Yield ", SafeERC20Namer.tokenName(IPoolFactory(msg.sender).nextFYToken()), " LP Token")),
            string(abi.encodePacked(SafeERC20Namer.tokenSymbol(IPoolFactory(msg.sender).nextFYToken()), "LP")),
            SafeERC20Namer.tokenDecimals(IPoolFactory(msg.sender).nextBase())
        )
    {
        IPoolFactory _factory = IPoolFactory(msg.sender);
        IFYToken _fyToken = IFYToken(_factory.nextFYToken());
        IERC20 _base = IERC20(_factory.nextBase());
        fyToken = _fyToken;
        base = _base;

        uint256 _maturity = _fyToken.maturity();
        require (_maturity <= type(uint32).max, "Pool: Maturity too far in the future");
        maturity = uint32(_maturity);

        ts = _factory.ts();
        g1 = _factory.g1();
        g2 = _factory.g2();

        scaleFactor = uint96(10 ** (18 - SafeERC20Namer.tokenDecimals(address(_base))));
    }

    /// @dev Trading can only be done before maturity
    modifier beforeMaturity() {
        require(
            block.timestamp < maturity,
            "Pool: Too late"
        );
        _;
    }

    // ---- Balances management ----

    /// @dev Updates the cache to match the actual balances.
    function sync() external {
        _update(_getBaseBalance(), _getFYTokenBalance(), baseCached, fyTokenCached);
    }

    /// @dev Returns the cached balances & last updated timestamp.
    /// @return Cached base token balance.
    /// @return Cached virtual FY token balance.
    /// @return Timestamp that balances were last cached.
    function getCache()
        external view
        returns (uint112, uint112, uint32)
    {
        return (baseCached, fyTokenCached, blockTimestampLast);
    }

    /// @dev Returns the "virtual" fyToken balance, which is the real balance plus the pool token supply.
    function getFYTokenBalance()
        public view override
        returns(uint112)
    {
        return _getFYTokenBalance();
    }

    /// @dev Returns the base balance
    function getBaseBalance()
        public view override
        returns(uint112)
    {
        return _getBaseBalance();
    }

    /// @dev Returns the "virtual" fyToken balance, which is the real balance plus the pool token supply.
    function _getFYTokenBalance()
        internal view
        returns(uint112)
    {
        return (fyToken.balanceOf(address(this)) + _totalSupply).u112();
    }

    /// @dev Returns the base balance
    function _getBaseBalance()
        internal view
        returns(uint112)
    {
        return base.balanceOf(address(this)).u112();
    }

    /// @dev Retrieve any base tokens not accounted for in the cache
    function retrieveBase(address to)
        external override
        returns(uint128 retrieved)
    {
        retrieved = _getBaseBalance() - baseCached; // Cache can never be above balances
        base.safeTransfer(to, retrieved);
        // Now the current balances match the cache, so no need to update the TWAR
    }

    /// @dev Retrieve any fyTokens not accounted for in the cache
    function retrieveFYToken(address to)
        external override
        returns(uint128 retrieved)
    {
        retrieved = _getFYTokenBalance() - fyTokenCached; // Cache can never be above balances
        IERC20(address(fyToken)).safeTransfer(to, retrieved);
        // Now the balances match the cache, so no need to update the TWAR
    }

    /// @dev Update cache and, on the first call per block, ratio accumulators
    function _update(uint128 baseBalance, uint128 fyBalance, uint112 _baseCached, uint112 _fyTokenCached) private {
        uint32 blockTimestamp = uint32(block.timestamp);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && _baseCached != 0 && _fyTokenCached != 0) {
            // We multiply by 1e27 here so that r = t * y/x is a fixed point factor with 27 decimals 
            uint256 scaledFYTokenCached = uint256(_fyTokenCached) * 1e27;
            cumulativeBalancesRatio += scaledFYTokenCached  * timeElapsed / _baseCached;
        }
        baseCached = baseBalance.u112();
        fyTokenCached = fyBalance.u112();
        blockTimestampLast = blockTimestamp;
        emit Sync(baseCached, fyTokenCached, cumulativeBalancesRatio);
    }

    // ---- Liquidity ----

    /// @dev Mint liquidity tokens in exchange for adding base and fyToken
    /// The amount of liquidity tokens to mint is calculated from the amount of unaccounted for base tokens in this contract.
    /// A proportional amount of fyTokens needs to be present in this contract, also unaccounted for.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param calculateFromBase Calculate the amount of tokens to mint from the base tokens available, leaving a fyToken surplus.
    /// @param minTokensMinted Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function mint(address to, bool calculateFromBase, uint256 minTokensMinted)
        external override
        returns (uint256, uint256, uint256)
    {
        return _mintInternal(to, calculateFromBase, 0, minTokensMinted);
    }

    /// @dev Mint liquidity tokens in exchange for adding only base
    /// The amount of liquidity tokens is calculated from the amount of fyToken to buy from the pool.
    /// The base tokens need to be present in this contract, unaccounted for.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much base it will be taken in.
    /// @param minTokensMinted Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function mintWithBase(address to, uint256 fyTokenToBuy, uint256 minTokensMinted)
        external override
        returns (uint256, uint256, uint256)
    {
        return _mintInternal(to, false, fyTokenToBuy, minTokensMinted);
    }

    /// @dev Mint liquidity tokens in exchange for adding only base, if fyTokenToBuy > 0.
    /// If fyTokenToBuy == 0, mint liquidity tokens for both basea and fyToken.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param calculateFromBase Calculate the amount of tokens to mint from the base tokens available, leaving a fyToken surplus.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much base it will be taken in.
    /// @param minTokensMinted Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function _mintInternal(address to, bool calculateFromBase, uint256 fyTokenToBuy, uint256 minTokensMinted)
        internal
        returns (uint256, uint256, uint256)
    {
        // Gather data
        uint256 supply = _totalSupply;
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        uint256 _realFYTokenCached = _fyTokenCached - supply;    // The fyToken cache includes the virtual fyToken, equal to the supply

        // Calculate trade
        uint256 tokensMinted;
        uint256 baseIn;
        uint256 baseReturned;
        uint256 fyTokenIn;

        if (supply == 0) {
            require (calculateFromBase && fyTokenToBuy == 0, "Pool: Initialize only from base");
            baseIn = base.balanceOf(address(this)) - _baseCached;
            tokensMinted = baseIn;   // If supply == 0 we are initializing the pool and tokensMinted == baseIn; fyTokenIn == 0
        } else {
            // There is an optional virtual trade before the mint
            uint256 baseToSell;
            if (fyTokenToBuy > 0) {     // calculateFromBase == true and fyTokenToBuy > 0 can't happen in this implementation. To implement a virtual trade and calculateFromBase the trade would need to be a BaseToBuy parameter.
                baseToSell = _buyFYTokenPreview(
                    fyTokenToBuy.u128(),
                    _baseCached,
                    _fyTokenCached
                ); 
            }

            if (calculateFromBase) {   // We use all the available base tokens, surplus is in fyTokens
                baseIn = base.balanceOf(address(this)) - _baseCached;
                tokensMinted = (supply * baseIn) / _baseCached;
                fyTokenIn = (_realFYTokenCached * tokensMinted) / supply;
                require(_realFYTokenCached + fyTokenIn <= fyToken.balanceOf(address(this)), "Pool: Not enough fyToken in");
            } else {                   // We use all the available fyTokens, plus a virtual trade if it happened, surplus is in base tokens
                fyTokenIn = fyToken.balanceOf(address(this)) - _realFYTokenCached;
                tokensMinted = (supply * (fyTokenToBuy + fyTokenIn)) / (_realFYTokenCached - fyTokenToBuy);
                baseIn = baseToSell + ((_baseCached + baseToSell) * tokensMinted) / supply;
                uint256 _baseBalance = base.balanceOf(address(this));
                require(_baseBalance - _baseCached >= baseIn, "Pool: Not enough base token in");
                
                // If we did a trade means we came in through `mintWithBase`, and want to return the base token surplus
                if (fyTokenToBuy > 0) baseReturned = (_baseBalance - _baseCached) - baseIn;
            }
        }

        // Slippage
        require (tokensMinted >= minTokensMinted, "Pool: Not enough tokens minted");

        // Update TWAR
        _update(
            (_baseCached + baseIn).u128(),
            (_fyTokenCached + fyTokenIn + tokensMinted).u128(), // Account for the "virtual" fyToken from the new minted LP tokens
            _baseCached,
            _fyTokenCached
        );

        // Execute mint
        _mint(to, tokensMinted);

        // Return any unused base if we did a trade, meaning slippage was involved.
        if (supply > 0 && fyTokenToBuy > 0) base.safeTransfer(to, baseReturned);

        emit Liquidity(maturity, msg.sender, to, address(0), -(baseIn.i256()), -(fyTokenIn.i256()), tokensMinted.i256());
        return (baseIn, fyTokenIn, tokensMinted);
    }

    /// @dev Burn liquidity tokens in exchange for base and fyToken.
    /// The liquidity tokens need to be in this contract.
    /// @param baseTo Wallet receiving the base.
    /// @param fyTokenTo Wallet receiving the fyToken.
    /// @return The amount of tokens burned and returned (tokensBurned, bases, fyTokens).
    function burn(address baseTo, address fyTokenTo, uint256 minBaseOut, uint256 minFYTokenOut)
        external override
        returns (uint256, uint256, uint256)
    {
        return _burnInternal(baseTo, fyTokenTo, false, minBaseOut, minFYTokenOut);
    }

    /// @dev Burn liquidity tokens in exchange for base.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param to Wallet receiving the base and fyToken.
    /// @return tokensBurned The amount of lp tokens burned.
    /// @return baseOut The amount of base tokens returned.
    function burnForBase(address to, uint256 minBaseOut)
        external override
        returns (uint256 tokensBurned, uint256 baseOut)
    {
        (tokensBurned, baseOut, ) = _burnInternal(to, address(0), true, minBaseOut, 0);
    }


    /// @dev Burn liquidity tokens in exchange for base.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param baseTo Wallet receiving the base.
    /// @param fyTokenTo Wallet receiving the fyToken.
    /// @param tradeToBase Whether the resulting fyToken should be traded for base tokens.
    /// @return tokensBurned The amount of pool tokens burned.
    /// @return tokenOut The amount of base tokens returned.
    /// @return fyTokenOut The amount of fyTokens returned.
    function _burnInternal(address baseTo, address fyTokenTo, bool tradeToBase, uint256 minBaseOut, uint256 minFYTokenOut)
        internal
        returns (uint256 tokensBurned, uint256 tokenOut, uint256 fyTokenOut)
    {
        
        tokensBurned = _balanceOf[address(this)];
        uint256 supply = _totalSupply;
        uint256 fyTokenBalance = fyToken.balanceOf(address(this));          // use the real balance rather than the virtual one
        uint256 baseBalance = base.balanceOf(address(this));
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);

        // Calculate trade
        tokenOut = (tokensBurned * baseBalance) / supply;
        fyTokenOut = (tokensBurned * fyTokenBalance) / supply;

        if (tradeToBase) {
            tokenOut += YieldMath.baseOutForFYTokenIn(                      // This is a virtual sell
                (_baseCached - tokenOut.u128()) * scaleFactor,              // Cache, minus virtual burn
                (_fyTokenCached - fyTokenOut.u128()) * scaleFactor,         // Cache, minus virtual burn
                fyTokenOut.u128() * scaleFactor,                            // Sell the virtual fyToken obtained
                maturity - uint32(block.timestamp),                         // This can't be called after maturity
                ts,
                g2
            ) / scaleFactor;
            fyTokenOut = 0;
        }

        // Slippage
        require (tokenOut >= minBaseOut, "Pool: Not enough base tokens obtained");
        require (fyTokenOut >= minFYTokenOut, "Pool: Not enough fyToken obtained");

        // Update TWAR
        _update(
            (baseBalance - tokenOut).u128(),
            (fyTokenBalance - fyTokenOut + supply - tokensBurned).u128(),
            _baseCached,
            _fyTokenCached
        );

        // Transfer assets
        _burn(address(this), tokensBurned);
        base.safeTransfer(baseTo, tokenOut);
        if (fyTokenOut > 0) IERC20(address(fyToken)).safeTransfer(fyTokenTo, fyTokenOut);

        emit Liquidity(maturity, msg.sender, baseTo, fyTokenTo, tokenOut.i256(), fyTokenOut.i256(), -(tokensBurned.i256()));
    }

    // ---- Trading ----

    /// @dev Sell base for fyToken.
    /// The trader needs to have transferred the amount of base to sell to the pool before in the same transaction.
    /// @param to Wallet receiving the fyToken being bought
    /// @param min Minimm accepted amount of fyToken
    /// @return Amount of fyToken that will be deposited on `to` wallet
    function sellBase(address to, uint128 min)
        external override
        returns(uint128)
    {
        // Calculate trade
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        uint112 _baseBalance = _getBaseBalance();
        uint112 _fyTokenBalance = _getFYTokenBalance();
        uint128 baseIn = _baseBalance - _baseCached;
        uint128 fyTokenOut = _sellBasePreview(
            baseIn,
            _baseCached,
            _fyTokenBalance
        );

        // Slippage check
        require(
            fyTokenOut >= min,
            "Pool: Not enough fyToken obtained"
        );

        // Update TWAR
        _update(
            _baseBalance,
            _fyTokenBalance - fyTokenOut,
            _baseCached,
            _fyTokenCached
        );

        // Transfer assets
        IERC20(address(fyToken)).safeTransfer(to, fyTokenOut);

        emit Trade(maturity, msg.sender, to, -(baseIn.i128()), fyTokenOut.i128());
        return fyTokenOut;
    }

    /// @dev Returns how much fyToken would be obtained by selling `baseIn` base
    /// @param baseIn Amount of base hypothetically sold.
    /// @return Amount of fyToken hypothetically bought.
    function sellBasePreview(uint128 baseIn)
        external view override
        returns(uint128)
    {
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        return _sellBasePreview(baseIn, _baseCached, _fyTokenCached);
    }

    /// @dev Returns how much fyToken would be obtained by selling `baseIn` base
    function _sellBasePreview(
        uint128 baseIn,
        uint112 baseBalance,
        uint112 fyTokenBalance
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        uint128 fyTokenOut = YieldMath.fyTokenOutForBaseIn(
            baseBalance * scaleFactor,
            fyTokenBalance * scaleFactor,
            baseIn * scaleFactor,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            ts,
            g1
        ) / scaleFactor;

        require(
            fyTokenBalance - fyTokenOut >= baseBalance + baseIn,
            "Pool: fyToken balance too low"
        );

        return fyTokenOut;
    }

    /// @dev Buy base for fyToken
    /// The trader needs to have called `fyToken.approve`
    /// @param to Wallet receiving the base being bought
    /// @param tokenOut Amount of base being bought that will be deposited in `to` wallet
    /// @param max Maximum amount of fyToken that will be paid for the trade
    /// @return Amount of fyToken that will be taken from caller
    function buyBase(address to, uint128 tokenOut, uint128 max)
        external override
        returns(uint128)
    {
        // Calculate trade
        uint128 fyTokenBalance = _getFYTokenBalance();
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        uint128 fyTokenIn = _buyBasePreview(
            tokenOut,
            _baseCached,
            _fyTokenCached
        );
        require(
            fyTokenBalance - _fyTokenCached >= fyTokenIn,
            "Pool: Not enough fyToken in"
        );

        // Slippage check
        require(
            fyTokenIn <= max,
            "Pool: Too much fyToken in"
        );

        // Update TWAR
        _update(
            _baseCached - tokenOut,
            _fyTokenCached + fyTokenIn,
            _baseCached,
            _fyTokenCached
        );

        // Transfer assets
        base.safeTransfer(to, tokenOut);

        emit Trade(maturity, msg.sender, to, tokenOut.i128(), -(fyTokenIn.i128()));
        return fyTokenIn;
    }

    /// @dev Returns how much fyToken would be required to buy `tokenOut` base.
    /// @param tokenOut Amount of base hypothetically desired.
    /// @return Amount of fyToken hypothetically required.
    function buyBasePreview(uint128 tokenOut)
        external view override
        returns(uint128)
    {
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        return _buyBasePreview(tokenOut, _baseCached, _fyTokenCached);
    }

    /// @dev Returns how much fyToken would be required to buy `tokenOut` base.
    function _buyBasePreview(
        uint128 tokenOut,
        uint112 baseBalance,
        uint112 fyTokenBalance
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.fyTokenInForBaseOut(
            baseBalance * scaleFactor,
            fyTokenBalance * scaleFactor,
            tokenOut * scaleFactor,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            ts,
            g2
        ) / scaleFactor;
    }

    /// @dev Sell fyToken for base
    /// The trader needs to have transferred the amount of fyToken to sell to the pool before in the same transaction.
    /// @param to Wallet receiving the base being bought
    /// @param min Minimm accepted amount of base
    /// @return Amount of base that will be deposited on `to` wallet
    function sellFYToken(address to, uint128 min)
        external override
        returns(uint128)
    {
        // Calculate trade
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        uint112 _fyTokenBalance = _getFYTokenBalance();
        uint112 _baseBalance = _getBaseBalance();
        uint128 fyTokenIn = _fyTokenBalance - _fyTokenCached;
        uint128 baseOut = _sellFYTokenPreview(
            fyTokenIn,
            _baseCached,
            _fyTokenCached
        );

        // Slippage check
        require(
            baseOut >= min,
            "Pool: Not enough base obtained"
        );

        // Update TWAR
        _update(
            _baseBalance - baseOut,
            _fyTokenBalance,
            _baseCached,
            _fyTokenCached
        );

        // Transfer assets
        base.safeTransfer(to, baseOut);

        emit Trade(maturity, msg.sender, to, baseOut.i128(), -(fyTokenIn.i128()));
        return baseOut;
    }

    /// @dev Returns how much base would be obtained by selling `fyTokenIn` fyToken.
    /// @param fyTokenIn Amount of fyToken hypothetically sold.
    /// @return Amount of base hypothetically bought.
    function sellFYTokenPreview(uint128 fyTokenIn)
        external view override
        returns(uint128)
    {
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        return _sellFYTokenPreview(fyTokenIn, _baseCached, _fyTokenCached);
    }

    /// @dev Returns how much base would be obtained by selling `fyTokenIn` fyToken.
    function _sellFYTokenPreview(
        uint128 fyTokenIn,
        uint112 baseBalance,
        uint112 fyTokenBalance
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.baseOutForFYTokenIn(
            baseBalance * scaleFactor,
            fyTokenBalance * scaleFactor,
            fyTokenIn * scaleFactor,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            ts,
            g2
        ) / scaleFactor;
    }

    /// @dev Buy fyToken for base
    /// The trader needs to have called `base.approve`
    /// @param to Wallet receiving the fyToken being bought
    /// @param fyTokenOut Amount of fyToken being bought that will be deposited in `to` wallet
    /// @param max Maximum amount of base token that will be paid for the trade
    /// @return Amount of base that will be taken from caller's wallet
    function buyFYToken(address to, uint128 fyTokenOut, uint128 max)
        external override
        returns(uint128)
    {
        // Calculate trade
        uint128 baseBalance = _getBaseBalance();
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        uint128 baseIn = _buyFYTokenPreview(
            fyTokenOut,
            _baseCached,
            _fyTokenCached
        );
        require(
            baseBalance - _baseCached >= baseIn,
            "Pool: Not enough base token in"
        );

        // Slippage check
        require(
            baseIn <= max,
            "Pool: Too much base token in"
        );

        // Update TWAR
        _update(
            _baseCached + baseIn,
            _fyTokenCached - fyTokenOut,
            _baseCached,
            _fyTokenCached
        );

        // Transfer assets
        IERC20(address(fyToken)).safeTransfer(to, fyTokenOut);

        emit Trade(maturity, msg.sender, to, -(baseIn.i128()), fyTokenOut.i128());
        return baseIn;
    }

    /// @dev Returns how much base would be required to buy `fyTokenOut` fyToken.
    /// @param fyTokenOut Amount of fyToken hypothetically desired.
    /// @return Amount of base hypothetically required.
    function buyFYTokenPreview(uint128 fyTokenOut)
        external view override
        returns(uint128)
    {
        (uint112 _baseCached, uint112 _fyTokenCached) =
            (baseCached, fyTokenCached);
        return _buyFYTokenPreview(fyTokenOut, _baseCached, _fyTokenCached);
    }

    /// @dev Returns how much base would be required to buy `fyTokenOut` fyToken.
    function _buyFYTokenPreview(
        uint128 fyTokenOut,
        uint128 baseBalance,
        uint128 fyTokenBalance
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        uint128 baseIn = YieldMath.baseInForFYTokenOut(
            baseBalance * scaleFactor,
            fyTokenBalance * scaleFactor,
            fyTokenOut * scaleFactor,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            ts,
            g1
        ) / scaleFactor;

        require(
            fyTokenBalance - fyTokenOut >= baseBalance + baseIn,
            "Pool: fyToken balance too low"
        );

        return baseIn;
    }

    /// @dev Calculate the invariant for this pool
    function invariant()
        public view override
        returns (uint128)
    {
        uint32 timeToMaturity = (maturity > uint32(block.timestamp)) ? maturity - uint32(block.timestamp) : 0;
        return YieldMath.invariant(
            getBaseBalance(),
            getFYTokenBalance(),
            _totalSupply,
            timeToMaturity,
            ts
        );
    }
}
