// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >= 0.8.0;

import "@yield-protocol/utils-v2/contracts/access/Ownable.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20Metadata.sol";
import "@yield-protocol/utils-v2/contracts/token/ERC20Permit.sol";
import "@yield-protocol/utils-v2/contracts/token/SafeERC20Namer.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "@yield-protocol/vault-interfaces/IFYToken.sol";
import "./YieldMath.sol";


library SafeCast256 {
    /// @dev Safely cast an uint256 to an uint112
    function u112(uint256 x) internal pure returns (uint112 y) {
        require (x <= type(uint112).max, "Cast overflow");
        y = uint112(x);
    }

    /// @dev Safely cast an uint256 to an uint128
    function u128(uint256 x) internal pure returns (uint128 y) {
        require (x <= type(uint128).max, "Cast overflow");
        y = uint128(x);
    }

    /// @dev Safe casting from uint256 to int256
    function i256(uint256 x) internal pure returns(int256) {
        require(x <= uint256(type(int256).max), "Cast overflow");
        return int256(x);
    }
}

library SafeCast128 {
    /// @dev Safely cast an uint128 to an int128
    function i128(uint128 x) internal pure returns (int128 y) {
        require (x <= uint128(type(int128).max), "Cast overflow");
        y = int128(x);
    }

    /// @dev Safely cast an uint128 to an uint112
    function u112(uint128 x) internal pure returns (uint112 y) {
        require (x <= uint128(type(uint112).max), "Cast overflow");
        y = uint112(x);
    }
}


/// @dev The Pool contract exchanges baseToken for fyToken at a price defined by a specific formula.
contract Pool is IPool, ERC20Permit, Ownable {
    using SafeCast256 for uint256;
    using SafeCast128 for uint128;
    using TransferHelper for IERC20;

    event Trade(uint32 maturity, address indexed from, address indexed to, int256 baseTokens, int256 fyTokenTokens);
    event Liquidity(uint32 maturity, address indexed from, address indexed to, int256 baseTokens, int256 fyTokenTokens, int256 poolTokens);
    event Sync(uint112 baseTokenReserve, uint112 storedFYTokenReserve, uint256 cumulativeReserveRatio);
    event ParameterSet(bytes32 parameter, int128 k);

    int128 private k1 = int128(uint128(uint256((1 << 64))) / 126144000); // 1 / Seconds in 4 years, in 64.64
    int128 private g1 = int128(uint128(uint256((950 << 64))) / 1000); // To be used when selling baseToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    int128 private k2 = int128(uint128(uint256((1 << 64))) / 126144000); // k is stored twice to be able to recover with 1 SLOAD alongside both g1 and g2
    int128 private g2 = int128(uint128(uint256((1000 << 64))) / 950); // To be used when selling fyToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    uint32 public immutable override maturity;

    IERC20 public immutable override baseToken;
    IFYToken public immutable override fyToken;

    uint112 private storedBaseTokenReserve;           // uses single storage slot, accessible via getReserves
    uint112 private storedFYTokenReserve;           // uses single storage slot, accessible via getReserves
    uint32  private blockTimestampLast; // uses single storage slot, accessible via getReserves

    uint256 public cumulativeReserveRatio;

    constructor()
        ERC20Permit(
            string(abi.encodePacked("Yield ", SafeERC20Namer.tokenName(IPoolFactory(msg.sender).nextFYToken()), " LP Token")),
            string(abi.encodePacked(SafeERC20Namer.tokenSymbol(IPoolFactory(msg.sender).nextFYToken()), "LP")),
            SafeERC20Namer.tokenDecimals(IPoolFactory(msg.sender).nextToken())
        )
    {
        IFYToken _fyToken = IFYToken(IPoolFactory(msg.sender).nextFYToken());
        fyToken = _fyToken;
        baseToken = IERC20(IPoolFactory(msg.sender).nextToken());

        uint256 _maturity = _fyToken.maturity();
        require (_maturity <= type(uint32).max, "Pool: Maturity too far in the future");
        maturity = uint32(_maturity);
    }

    /// @dev Trading can only be done before maturity
    modifier beforeMaturity() {
        require(
            block.timestamp < maturity,
            "Pool: Too late"
        );
        _;
    }

    // ---- Administration ----

    /// @dev Set the k, g1 or g2 parameters
    function setParameter(bytes32 parameter, int128 value) public onlyOwner {
        if (parameter == "k") k1 = k2 = value;
        else if (parameter == "g1") g1 = value;
        else if (parameter == "g2") g2 = value;
        else revert("Pool: Unrecognized parameter");
        emit ParameterSet(parameter, value);
    }

    /// @dev Get k
    function getK() public view returns (int128) {
        assert(k1 == k2);
        return k1;
    }

    /// @dev Get g1
    function getG1() public view returns (int128) {
        return g1;
    }

    /// @dev Get g2
    function getG2() public view returns (int128) {
        return g2;
    }

    // ---- Reserves management ----

    /// @dev Updates the stored reserves to match the actual reserve balances.
    function sync() external {
        _update(getBaseTokenReserves(), getFYTokenReserves(), storedBaseTokenReserve, storedFYTokenReserve);
    }

    /// @dev Returns the stored reserve balances & last updated timestamp.
    /// @return Stored base token reserves.
    /// @return Stored virtual FY token reserves.
    /// @return Timestamp that reserves were last stored.
    function getStoredReserves() public view returns (uint112, uint112, uint32) {
        return (storedBaseTokenReserve, storedFYTokenReserve, blockTimestampLast);
    }

    /// @dev Returns the "virtual" fyToken reserves
    function getFYTokenReserves()
        public view override
        returns(uint112)
    {
        return (fyToken.balanceOf(address(this)) + _totalSupply).u112();
    }

    /// @dev Returns the baseToken reserves
    function getBaseTokenReserves()
        public view override
        returns(uint112)
    {
        return baseToken.balanceOf(address(this)).u112();
    }

    /// @dev Retrieve any base okens not accounted for in the stored reserves
    function retrieveBaseToken(address to)
        external override
        returns(uint128 retrieved)
    {
        retrieved = getBaseTokenReserves() - storedBaseTokenReserve; // Stored reserves can never be above actual reserves
        baseToken.safeTransfer(to, retrieved);
        // Now the current reserves match the stored reserves, so no need to update the TWAR
    }

    /// @dev Retrieve any fyTokens not accounted for in the stored reserves
    function retrieveFYToken(address to)
        external override
        returns(uint128 retrieved)
    {
        retrieved = getFYTokenReserves() - storedFYTokenReserve; // Stored reserves can never be above actual reserves
        IERC20(address(fyToken)).safeTransfer(to, retrieved);
        // Now the current reserves match the stored reserves, so no need to update the TWAR
    }

    /// @dev Update reserves and, on the first call per block, ratio accumulators
    function _update(uint128 baseBalance, uint128 fyBalance, uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) private {
        uint32 blockTimestamp = uint32(block.timestamp);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && _storedBaseTokenReserve != 0 && _storedFYTokenReserve != 0) {
            uint256 scaledFYReserve = uint256(_storedFYTokenReserve) * 1e27;
            cumulativeReserveRatio += scaledFYReserve / _storedBaseTokenReserve * timeElapsed;
        }
        storedBaseTokenReserve = baseBalance.u112();
        storedFYTokenReserve = fyBalance.u112();
        blockTimestampLast = blockTimestamp;
        emit Sync(storedBaseTokenReserve, storedFYTokenReserve, cumulativeReserveRatio);
    }

    // ---- Liquidity ----

    /// @dev Mint liquidity tokens in exchange for adding baseToken and fyToken
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

    /// @dev Mint liquidity tokens in exchange for adding only baseToken
    /// The amount of liquidity tokens is calculated from the amount of fyToken to buy from the pool.
    /// The base tokens need to be present in this contract, unaccounted for.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much baseToken it will be taken in.
    /// @param minTokensMinted Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function mintWithBaseToken(address to, uint256 fyTokenToBuy, uint256 minTokensMinted)
        external override
        returns (uint256, uint256, uint256)
    {
        return _mintInternal(to, false, fyTokenToBuy, minTokensMinted);
    }

    /// @dev Mint liquidity tokens in exchange for adding only baseToken, if fyTokenToBuy > 0.
    /// If fyTokenToBuy == 0, mint liquidity tokens for both baseTokena and fyToken.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param calculateFromBase Calculate the amount of tokens to mint from the base tokens available, leaving a fyToken surplus.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much baseToken it will be taken in.
    /// @param minTokensMinted Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function _mintInternal(address to, bool calculateFromBase, uint256 fyTokenToBuy, uint256 minTokensMinted)
        internal
        returns (uint256, uint256, uint256)
    {
        // Gather data
        uint256 supply = _totalSupply;
        (uint112 realStoredBaseTokenReserve, uint112 virtualStoredFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint256 realStoredFYTokenReserve = virtualStoredFYTokenReserve - supply;    // The stored fyToken reserves include the virtual fyToken, equal to the supply

        // Calculate trade
        uint256 tokensMinted;
        uint256 baseTokenIn;
        uint256 fyTokenIn;

        if (supply == 0) {
            require (calculateFromBase && fyTokenToBuy == 0, "Pool: Initialize only from base");
            baseTokenIn = baseToken.balanceOf(address(this)) - realStoredBaseTokenReserve;
            tokensMinted = baseTokenIn;   // If supply == 0 we are initializing the pool and tokensMinted == baseTokenIn; fyTokenIn == 0
        } else {
            // There is an optional virtual trade before the mint
            uint256 baseTokenToSell;
            if (fyTokenToBuy > 0) {     // calculateFromBase == true and fyTokenToBuy > 0 can't happen in this implementation. To implement a virtual trade and calculateFromBase the trade would need to be a BaseToBuy parameter.
                baseTokenToSell = _buyFYTokenPreview(
                    fyTokenToBuy.u128(),
                    realStoredBaseTokenReserve,
                    virtualStoredFYTokenReserve
                ); 
            }

            if (calculateFromBase) {   // We use all the available base tokens, surplus is in fyTokens
                baseTokenIn = baseToken.balanceOf(address(this)) - realStoredBaseTokenReserve;
                tokensMinted = (supply * baseTokenIn) / realStoredBaseTokenReserve;
                fyTokenIn = (realStoredFYTokenReserve * tokensMinted) / supply;
                require(realStoredFYTokenReserve + fyTokenIn <= fyToken.balanceOf(address(this)), "Pool: Not enough fyToken in");
            } else {                   // We use all the available fyTokens, plus a virtual trade if it happened, surplus is in base tokens
                fyTokenIn = fyToken.balanceOf(address(this)) - realStoredFYTokenReserve;
                tokensMinted = (supply * (fyTokenToBuy + fyTokenIn)) / (realStoredFYTokenReserve - fyTokenToBuy);
                baseTokenIn = baseTokenToSell + ((realStoredBaseTokenReserve + baseTokenToSell) * tokensMinted) / supply;
                require(baseToken.balanceOf(address(this)) - realStoredBaseTokenReserve >= baseTokenIn, "Pool: Not enough base token in");
            }
        }

        // Slippage
        require (tokensMinted >= minTokensMinted, "Pool: Not enough tokens minted");

        // Update TWAR
        _update(
            (realStoredBaseTokenReserve + baseTokenIn).u128(),
            (virtualStoredFYTokenReserve + fyTokenIn + tokensMinted).u128(), // Account for the "virtual" fyToken from the new minted LP tokens
            realStoredBaseTokenReserve,
            virtualStoredFYTokenReserve
        );

        // Execute mint
        _mint(to, tokensMinted);

        emit Liquidity(maturity, msg.sender, to, -(baseTokenIn.i256()), -(fyTokenIn.i256()), tokensMinted.i256());
        return (baseTokenIn, fyTokenIn, tokensMinted);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken and fyToken.
    /// The liquidity tokens need to be in this contract.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @return The amount of reserve tokens burned and returned (tokensBurned, baseTokens, fyTokenTokens).
    function burn(address to, uint256 minBaseTokenOut, uint256 minFYTokenOut)
        external override
        returns (uint256, uint256, uint256)
    {
        return _burnInternal(to, false, minBaseTokenOut, minFYTokenOut);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @return The amount of base tokens returned.
    function burnForBaseToken(address to, uint256 minBaseTokenOut, uint256 minFYTokenOut)
        external override
        returns (uint256, uint256, uint256)
    {
        return _burnInternal(to, true, minBaseTokenOut, minFYTokenOut);
    }


    /// @dev Burn liquidity tokens in exchange for baseToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @param tradeToBase Whether the resulting fyToken should be traded for base tokens.
    /// @return The amount of base tokens returned.
    function _burnInternal(address to, bool tradeToBase, uint256 minBaseTokenOut, uint256 minFYTokenOut)
        internal
        returns (uint256, uint256, uint256)
    {
        
        uint256 tokensBurned = _balanceOf[address(this)];
        uint256 supply = _totalSupply;
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));             // use the actual reserves rather than the virtual reserves
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        (uint112 realStoredBaseTokenReserve, uint112 virtualStoredFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        // Calculate trade
        uint256 tokenOut = (tokensBurned * baseTokenReserves) / supply;
        uint256 fyTokenOut = (tokensBurned * fyTokenReserves) / supply;

        if (tradeToBase) {
            (int128 _k, int128 _g2) = (k2, g2);
            tokenOut += YieldMath.baseOutForFYTokenIn(                      // This is a virtual sell
                realStoredBaseTokenReserve - tokenOut.u128(),               // Real reserves, minus virtual burn
                virtualStoredFYTokenReserve - fyTokenOut.u128(),            // Virtual reserves, minus virtual burn
                fyTokenOut.u128(),                                          // Sell the virtual fyToken obtained
                maturity - uint32(block.timestamp),                         // This can't be called after maturity
                _k,
                _g2
            );
            fyTokenOut = 0;
        }

        // Slippage
        require (tokenOut >= minBaseTokenOut, "Pool: Not enough base tokens obtained");
        require (fyTokenOut >= minFYTokenOut, "Pool: Not enough fyToken obtained");

        // Update TWAR
        _update(
            (baseTokenReserves - tokenOut).u128(),
            (fyTokenReserves - fyTokenOut + supply - tokensBurned).u128(),
            realStoredBaseTokenReserve,
            virtualStoredFYTokenReserve
        );

        // Transfer assets
        _burn(address(this), tokensBurned);
        baseToken.safeTransfer(to, tokenOut);
        if (fyTokenOut > 0) IERC20(address(fyToken)).safeTransfer(to, fyTokenOut);

        emit Liquidity(maturity, msg.sender, to, tokenOut.i256(), fyTokenOut.i256(), -(tokensBurned.i256()));
        return (tokensBurned, tokenOut, 0);
    }

    // ---- Trading ----

    /// @dev Sell baseToken for fyToken.
    /// The trader needs to have transferred the amount of base to sell to the pool before in the same transaction.
    /// @param to Wallet receiving the fyToken being bought
    /// @param min Minimm accepted amount of fyToken
    /// @return Amount of fyToken that will be deposited on `to` wallet
    function sellBaseToken(address to, uint128 min)
        external override
        returns(uint128)
    {
        // Calculate trade
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint112 _baseTokenReserves = getBaseTokenReserves();
        uint112 _fyTokenReserves = getFYTokenReserves();
        uint128 baseTokenIn = _baseTokenReserves - _storedBaseTokenReserve;
        uint128 fyTokenOut = _sellBaseTokenPreview(
            baseTokenIn,
            _storedBaseTokenReserve,
            _fyTokenReserves
        );

        // Slippage check
        require(
            fyTokenOut >= min,
            "Pool: Not enough fyToken obtained"
        );

        // Update TWAR
        _update(
            _baseTokenReserves,
            _fyTokenReserves - fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        // Transfer assets
        IERC20(address(fyToken)).safeTransfer(to, fyTokenOut);

        emit Trade(maturity, msg.sender, to, -(baseTokenIn.i128()), fyTokenOut.i128());
        return fyTokenOut;
    }

    /// @dev Returns how much fyToken would be obtained by selling `baseTokenIn` baseToken
    /// @param baseTokenIn Amount of baseToken hypothetically sold.
    /// @return Amount of fyToken hypothetically bought.
    function sellBaseTokenPreview(uint128 baseTokenIn)
        external view override
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        return _sellBaseTokenPreview(baseTokenIn, _storedBaseTokenReserve, _storedFYTokenReserve);
    }

    /// @dev Returns how much fyToken would be obtained by selling `baseTokenIn` baseToken
    function _sellBaseTokenPreview(
        uint128 baseTokenIn,
        uint112 baseTokenReserves,
        uint112 fyTokenReserves
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        (int128 _k, int128 _g1) = (k1, g1);
        uint128 fyTokenOut = YieldMath.fyTokenOutForBaseIn(
            baseTokenReserves,
            fyTokenReserves,
            baseTokenIn,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            _k,
            _g1
        );

        require(
            fyTokenReserves - fyTokenOut >= baseTokenReserves + baseTokenIn,
            "Pool: fy reserves too low"
        );

        return fyTokenOut;
    }

    /// @dev Buy baseToken for fyToken
    /// The trader needs to have called `fyToken.approve`
    /// @param to Wallet receiving the baseToken being bought
    /// @param tokenOut Amount of baseToken being bought that will be deposited in `to` wallet
    /// @param max Maximum amount of fyToken that will be paid for the trade
    /// @return Amount of fyToken that will be taken from caller
    function buyBaseToken(address to, uint128 tokenOut, uint128 max)
        external override
        returns(uint128)
    {
        // Calculate trade
        uint128 fyTokenReserves = getFYTokenReserves();
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint128 fyTokenIn = _buyBaseTokenPreview(
            tokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );
        require(
            fyTokenReserves - _storedFYTokenReserve >= fyTokenIn,
            "Pool: Not enough fyToken in"
        );

        // Slippage check
        require(
            fyTokenIn <= max,
            "Pool: Too much fyToken in"
        );

        // Update TWAR
        _update(
            _storedBaseTokenReserve - tokenOut,
            _storedFYTokenReserve + fyTokenIn,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        // Transfer assets
        baseToken.safeTransfer(to, tokenOut);

        emit Trade(maturity, msg.sender, to, tokenOut.i128(), -(fyTokenIn.i128()));
        return fyTokenIn;
    }

    /// @dev Returns how much fyToken would be required to buy `tokenOut` baseToken.
    /// @param tokenOut Amount of baseToken hypothetically desired.
    /// @return Amount of fyToken hypothetically required.
    function buyBaseTokenPreview(uint128 tokenOut)
        external view override
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        return _buyBaseTokenPreview(tokenOut, _storedBaseTokenReserve, _storedFYTokenReserve);
    }

    /// @dev Returns how much fyToken would be required to buy `tokenOut` baseToken.
    function _buyBaseTokenPreview(
        uint128 tokenOut,
        uint112 baseTokenReserves,
        uint112 fyTokenReserves
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        (int128 _k, int128 _g2) = (k2, g2);
        return YieldMath.fyTokenInForBaseOut(
            baseTokenReserves,
            fyTokenReserves,
            tokenOut,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            _k,
            _g2
        );
    }

    /// @dev Sell fyToken for baseToken
    /// The trader needs to have transferred the amount of fyToken to sell to the pool before in the same transaction.
    /// @param to Wallet receiving the baseToken being bought
    /// @param min Minimm accepted amount of baseToken
    /// @return Amount of baseToken that will be deposited on `to` wallet
    function sellFYToken(address to, uint128 min)
        external override
        returns(uint128)
    {
        // Calculate trade
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint112 _fyTokenReserves = getFYTokenReserves();
        uint112 _baseTokenReserves = getBaseTokenReserves();
        uint128 fyTokenIn = _fyTokenReserves - _storedFYTokenReserve;
        uint128 baseTokenOut = _sellFYTokenPreview(
            fyTokenIn,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        // Slippage check
        require(
            baseTokenOut >= min,
            "Pool: Not enough baseToken obtained"
        );

        // Update TWAR
        _update(
            _baseTokenReserves - baseTokenOut,
            _fyTokenReserves,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        // Transfer assets
        baseToken.safeTransfer(to, baseTokenOut);

        emit Trade(maturity, msg.sender, to, baseTokenOut.i128(), -(fyTokenIn.i128()));
        return baseTokenOut;
    }

    /// @dev Returns how much baseToken would be obtained by selling `fyTokenIn` fyToken.
    /// @param fyTokenIn Amount of fyToken hypothetically sold.
    /// @return Amount of baseToken hypothetically bought.
    function sellFYTokenPreview(uint128 fyTokenIn)
        external view override
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        return _sellFYTokenPreview(fyTokenIn, _storedBaseTokenReserve, _storedFYTokenReserve);
    }

    /// @dev Returns how much baseToken would be obtained by selling `fyTokenIn` fyToken.
    function _sellFYTokenPreview(
        uint128 fyTokenIn,
        uint112 baseTokenReserves,
        uint112 fyTokenReserves
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        (int128 _k, int128 _g2) = (k2, g2);
        return YieldMath.baseOutForFYTokenIn(
            baseTokenReserves,
            fyTokenReserves,
            fyTokenIn,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            _k,
            _g2
        );
    }

    /// @dev Buy fyToken for baseToken
    /// The trader needs to have called `baseToken.approve`
    /// @param to Wallet receiving the fyToken being bought
    /// @param fyTokenOut Amount of fyToken being bought that will be deposited in `to` wallet
    /// @param max Maximum amount of base token that will be paid for the trade
    /// @return Amount of baseToken that will be taken from caller's wallet
    function buyFYToken(address to, uint128 fyTokenOut, uint128 max)
        external override
        returns(uint128)
    {
        // Calculate trade
        uint128 baseTokenReserves = getBaseTokenReserves();
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint128 baseTokenIn = _buyFYTokenPreview(
            fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );
        require(
            baseTokenReserves - _storedBaseTokenReserve >= baseTokenIn,
            "Pool: Not enough base token in"
        );

        // Slippage check
        require(
            baseTokenIn <= max,
            "Pool: Too much base token in"
        );

        // Update TWAR
        _update(
            _storedBaseTokenReserve + baseTokenIn,
            _storedFYTokenReserve - fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        // Transfer assets
        IERC20(address(fyToken)).safeTransfer(to, fyTokenOut);

        emit Trade(maturity, msg.sender, to, -(baseTokenIn.i128()), fyTokenOut.i128());
        return baseTokenIn;
    }

    /// @dev Returns how much baseToken would be required to buy `fyTokenOut` fyToken.
    /// @param fyTokenOut Amount of fyToken hypothetically desired.
    /// @return Amount of baseToken hypothetically required.
    function buyFYTokenPreview(uint128 fyTokenOut)
        external view override
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        return _buyFYTokenPreview(fyTokenOut, _storedBaseTokenReserve, _storedFYTokenReserve);
    }

    /// @dev Returns how much baseToken would be required to buy `fyTokenOut` fyToken.
    function _buyFYTokenPreview(
        uint128 fyTokenOut,
        uint128 baseTokenReserves,
        uint128 fyTokenReserves
    )
        private view
        beforeMaturity
        returns(uint128)
    {
        (int128 _k, int128 _g1) = (k1, g1);
        uint128 baseTokenIn = YieldMath.baseInForFYTokenOut(
            baseTokenReserves,
            fyTokenReserves,
            fyTokenOut,
            maturity - uint32(block.timestamp),             // This can't be called after maturity
            _k,
            _g1
        );

        require(
            fyTokenReserves - fyTokenOut >= baseTokenReserves + baseTokenIn,
            "Pool: fy reserves too low"
        );

        return baseTokenIn;
    }
}
