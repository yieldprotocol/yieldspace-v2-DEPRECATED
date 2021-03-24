// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.1;

import "@yield-protocol/utils/contracts/token/ERC20Permit.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "@yield-protocol/vault-interfaces/IFYToken.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "./helpers/SafeERC20Namer.sol";
import "./Ownable.sol";
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
            string(abi.encodePacked(SafeERC20Namer.tokenSymbol(IPoolFactory(msg.sender).nextFYToken()), "LP"))
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
        return (fyToken.balanceOf(address(this)) + totalSupply()).u112();
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
        external
        returns(uint128 surplus)
    {
        surplus = getBaseTokenReserves() - storedBaseTokenReserve; // TODO: Consider adding a require for UX
        require(
            baseToken.transfer(to, surplus),
            "Pool: Base transfer failed"
        );
        // Now the current reserves match the stored reserves, so no need to update the TWAR
    }

    /// @dev Retrieve any fyTokens not accounted for in the stored reserves
    function retrieveFYToken(address to)
        external
        returns(uint128 surplus)
    {
        surplus = getFYTokenReserves() - storedFYTokenReserve; // TODO: Consider adding a require for UX
        require(
            fyToken.transfer(to, surplus),
            "Pool: FYToken transfer failed"
        );
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

    /// @dev Mint initial liquidity tokens.
    /// The liquidity provider needs to have called `baseToken.approve`
    /// @param baseTokenIn The initial baseToken liquidity to provide.
    function init(uint256 baseTokenIn)
        internal
        beforeMaturity
        returns (uint256)
    {
        require(
            totalSupply() == 0,
            "Pool: Already initialized"
        );
        // no fyToken transferred, because initial fyToken deposit is entirely virtual
        require(
            baseToken.transferFrom(msg.sender, address(this), baseTokenIn),
            "Pool: Base token transfer failed"
        );
        _mint(msg.sender, baseTokenIn);

        _update(getBaseTokenReserves(), getFYTokenReserves(), 0, 0);

        emit Liquidity(maturity, msg.sender, msg.sender, -(baseTokenIn.i256()), 0, baseTokenIn.i256());

        return baseTokenIn;
    }

    /// @dev Mint liquidity tokens in exchange for adding baseToken and fyToken
    /// The liquidity provider needs to have called `baseToken.approve` and `fyToken.approve`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param tokenOffered Amount of `baseToken` being invested, an appropriate amount of `fyToken` to be invested alongside will be calculated and taken by this function from the caller.
    /// @return The amount of liquidity tokens minted.
    function mint(address to, uint256 tokenOffered)
        external override
        returns (uint256)
    {
        uint256 supply = totalSupply();
        if (supply == 0) return init(tokenOffered);

        // Calculate trade
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));     // use the actual reserves rather than the virtual reserves
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));
        uint256 tokensMinted = (supply * tokenOffered) / baseTokenReserves;
        uint256 fyTokenRequired = (fyTokenReserves * tokensMinted) / supply;

        // Transfer assets
        require(
            baseToken.transferFrom(msg.sender, address(this), tokenOffered),
            "Pool: Base token transfer failed"
        );
        require(
            fyToken.transferFrom(msg.sender, address(this), fyTokenRequired),
            "Pool: fyToken transfer failed"
        );
        _mint(to, tokensMinted);

        // Update TWAR
        _update(
            (baseTokenReserves + tokenOffered).u128(),
            (fyTokenReserves + fyTokenRequired + supply + tokensMinted).u128(), // Account for the "virtual" fyToken from the new minted LP tokens
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Liquidity(maturity, msg.sender, to, -(tokenOffered.i256()), -(fyTokenRequired.i256()), tokensMinted.i256());
        return tokensMinted;
    }

    /// @dev Mint liquidity tokens in exchange for adding only baseToken
    /// The liquidity provider needs to have called `baseToken.approve`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much baseToken it will be taken in.
    /// @return The amount of liquidity tokens minted.
    function mintWithToken(address to, uint256 fyTokenToBuy) // TODO: Rename to mintWithBaseToken
        external
        returns (uint256, uint256)
    {
        uint256 supply = totalSupply();
        require(supply > 0, "Pool: Use mint first");

        // Calculate trade
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));

        uint256 baseTokenIn = _buyFYTokenPreview(
            fyTokenToBuy.u128(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        ); // This is a virtual buy

        require(fyTokenReserves >= fyTokenToBuy, "Pool: Not enough fyToken");
        uint256 tokensMinted = (supply * fyTokenToBuy) / (fyTokenReserves - fyTokenToBuy);
        baseTokenIn = ((baseTokenReserves + baseTokenIn) * tokensMinted) / supply;

        // Transfer assets
        require(
            baseToken.transferFrom(msg.sender, address(this), baseTokenIn),
            "Pool: baseToken transfer failed"
        );
        _mint(to, tokensMinted);

        // Update TWAR
        _update(
            (baseTokenReserves + baseTokenIn).u128(),
            (fyTokenReserves + supply + tokensMinted).u128(), // Add LP tokens to get virtual fyToken reserves
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Liquidity(maturity, msg.sender, to, -(baseTokenIn.i256()), 0, tokensMinted.i256());
        return (baseTokenIn, tokensMinted);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken and fyToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @return The amount of reserve tokens returned (baseTokens, fyTokenTokens).
    function burn(address to, uint256 tokensBurned)
        external override
        returns (uint256, uint256)
    {
        // Calculate trade
        uint256 supply = totalSupply();
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        // use the actual reserves rather than the virtual reserves
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));
        uint256 tokenOut = (tokensBurned * baseTokenReserves) / supply;
        uint256 fyTokenOut = (tokensBurned * fyTokenReserves) / supply;

        // Transfer assets
        _burn(msg.sender, tokensBurned);
        require(
            baseToken.transfer(to, tokenOut),
            "Pool: Base token transfer failed"
        );
        require(
            fyToken.transfer(to, fyTokenOut),
            "Pool: fyToken transfer failed"
        );

        // Update TWAR
        {
            (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
                (storedBaseTokenReserve, storedFYTokenReserve);
            _update(
                (baseTokenReserves - tokenOut).u128(),
                (fyTokenReserves - fyTokenOut + supply - tokensBurned).u128(),
                _storedBaseTokenReserve,
                _storedFYTokenReserve
            );
        }

        emit Liquidity(maturity, msg.sender, to, tokenOut.i256(), fyTokenOut.i256(), -(tokensBurned.i256()));
        return (tokenOut, fyTokenOut);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @return The amount of base tokens returned.
    function burnForBaseToken(address to, uint256 tokensBurned)
        external
        returns (uint256)
    {
        // Calculate trade
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);
        uint256 supply = totalSupply();
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));             // use the actual reserves rather than the virtual reserves
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        uint256 tokenOut = (tokensBurned * baseTokenReserves) / supply;
        uint256 fyTokenObtained = (tokensBurned * fyTokenReserves) / supply;
        {
            (int128 _k, int128 _g2) = (k2, g2);
            tokenOut += YieldMath.baseOutForFYTokenIn(                            // This is a virtual sell
                _storedBaseTokenReserve - tokenOut.u128(),                // Real reserves, minus virtual burn
                _storedFYTokenReserve - fyTokenObtained.u128(), // Virtual reserves, minus virtual burn
                fyTokenObtained.u128(),                          // Sell the virtual fyToken obtained
                maturity - uint32(block.timestamp),             // This can't be called after maturity
                _k,
                _g2
            );
        }

        // Transfer assets
        _burn(msg.sender, tokensBurned); // TODO: Fix to check allowance
        require(
            baseToken.transfer(to, tokenOut),
            "Pool: Base token transfer failed"
        );

        // Update TWAR
        _update(
            (baseTokenReserves - tokenOut).u128(),
            (fyTokenReserves + supply - tokensBurned).u128(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Liquidity(maturity, msg.sender, to, tokenOut.i256(), 0, -(tokensBurned.i256()));
        return tokenOut;
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

        // Transfer assets
        require(
            fyToken.transfer(to, fyTokenOut),
            "Pool: FYToken transfer failed"
        );

        // Update TWAR
        _update(
            _baseTokenReserves,
            _fyTokenReserves - fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

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
            fyTokenReserves - _storedFYTokenReserve > fyTokenIn,
            "Pool: Not enought fyToken in"
        );

        // Slippage check
        require(
            fyTokenIn <= max,
            "Pool: Too much fyToken in"
        );

        // Transfer assets
        require(
            baseToken.transfer(to, tokenOut),
            "Pool: Base token transfer failed"
        );

        // Update TWAR
        _update(
            _storedBaseTokenReserve - tokenOut,
            _storedFYTokenReserve + fyTokenIn,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

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

        // Transfer assets
        require(
            baseToken.transfer(to, baseTokenOut),
            "Pool: Base token transfer failed"
        );

        // Update TWAR
        _update(
            getBaseTokenReserves(),
            _fyTokenReserves,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

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
    /// @return Amount of baseToken that will be taken from caller's wallet
    function buyFYToken(address to, uint128 fyTokenOut)
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
            baseTokenReserves - _storedBaseTokenReserve > baseTokenIn,
            "Pool: Not enought base token in"
        );

        // Transfer assets
        require(
            fyToken.transfer(to, fyTokenOut),
            "Pool: fyToken transfer failed"
        );

        // Update TWAR
        _update(
            _storedBaseTokenReserve + baseTokenIn,
            _storedFYTokenReserve - fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

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
