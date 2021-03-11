// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./YieldMath.sol";
import "./helpers/Delegable.sol";
import "./helpers/SafeCast.sol";
import "./helpers/ERC20Permit.sol";
import "./helpers/SafeERC20Namer.sol";
import "./interfaces/IFYDai.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolFactory.sol";


/// @dev The Pool contract exchanges baseToken for fyToken at a price defined by a specific formula.
contract Pool is IPool, Delegable(), ERC20Permit {
    using SafeMath for uint256;

    event Trade(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens);
    event Liquidity(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens, int256 poolTokens);
    event Sync(uint112 baseTokenReserve, uint112 storedFYTokenReserve, uint256 cumulativeReserveRatio);

    int128 constant public k = int128(uint256((1 << 64)) / 126144000); // 1 / Seconds in 4 years, in 64.64
    int128 constant public g1 = int128(uint256((950 << 64)) / 1000); // To be used when selling baseToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    int128 constant public g2 = int128(uint256((1000 << 64)) / 950); // To be used when selling fyToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    uint128 immutable public maturity;

    IERC20 public immutable override baseToken;
    IFYDai public immutable override fyToken;

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
        IFYDai _fyToken = IFYDai(IPoolFactory(msg.sender).nextFYToken());
        fyToken = _fyToken;
        baseToken = IERC20(IPoolFactory(msg.sender).nextToken());

        maturity = toUint128(_fyToken.maturity());
    }

    /// @dev Trading can only be done before maturity
    modifier beforeMaturity() {
        require(
            block.timestamp < maturity,
            "Pool: Too late"
        );
        _;
    }

    /// @dev Overflow-protected addition, from OpenZeppelin
    function add(uint128 a, uint128 b)
        internal pure returns (uint128)
    {
        uint128 c = a + b;
        require(c >= a, "Pool: Base reserves too high");

        return c;
    }

    /// @dev Overflow-protected substraction, from OpenZeppelin
    function sub(uint128 a, uint128 b) internal pure returns (uint128) {
        require(b <= a, "Pool: fy reserves too low");
        uint128 c = a - b;

        return c;
    }

    /// @dev Safe casting from uint256 to uint128
    function toUint128(uint256 x) internal pure returns(uint128) {
        require(
            x <= type(uint128).max,
            "Pool: Cast overflow"
        );
        return uint128(x);
    }

    /// @dev Safe casting from uint256 to int256
    function toInt256(uint256 x) internal pure returns(int256) {
        require(
            x <= uint256(type(int256).max),
            "Pool: Cast overflow"
        );
        return int256(x);
    }

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
        baseToken.transferFrom(msg.sender, address(this), baseTokenIn);
        _mint(msg.sender, baseTokenIn);

        _update(getBaseTokenReserves(), getFYTokenReserves(), 0, 0);

        emit Liquidity(maturity, msg.sender, msg.sender, -toInt256(baseTokenIn), 0, toInt256(baseTokenIn));

        return baseTokenIn;
    }

    /// @dev Update reserves and, on the first call per block, ratio accumulators
    function _update(uint128 baseBalance, uint128 fyBalance, uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) private {
        require(baseBalance <= type(uint112).max && fyBalance <= type(uint112).max, 'OVERFLOW');
        uint32 blockTimestamp = uint32(block.timestamp);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && _storedBaseTokenReserve != 0 && _storedFYTokenReserve != 0) {
            uint256 scaledFYReserve = uint256(_storedFYTokenReserve) * 1e27;
            cumulativeReserveRatio += scaledFYReserve / _storedBaseTokenReserve * timeElapsed;
        }
        storedBaseTokenReserve = uint112(baseBalance);
        storedFYTokenReserve = uint112(fyBalance);
        blockTimestampLast = blockTimestamp;
        emit Sync(storedBaseTokenReserve, storedFYTokenReserve, cumulativeReserveRatio);
    }

    /// @dev Mint liquidity tokens in exchange for adding baseToken and fyToken
    /// The liquidity provider needs to have called `baseToken.approve` and `fyToken.approve`.
    /// @param from Wallet providing the baseToken and fyToken. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param tokenOffered Amount of `baseToken` being invested, an appropriate amount of `fyToken` to be invested alongside will be calculated and taken by this function from the caller.
    /// @return The amount of liquidity tokens minted.
    function mint(address from, address to, uint256 tokenOffered)
        external override
        onlyHolderOrDelegate(from)
        returns (uint256)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint256 supply = totalSupply();
        if (supply == 0) return init(tokenOffered);

        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        // use the actual reserves rather than the virtual reserves
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));
        uint256 tokensMinted = supply.mul(tokenOffered).div(baseTokenReserves);
        uint256 fyTokenRequired = fyTokenReserves.mul(tokensMinted).div(supply);

        {
            uint256 newBaseTokenReserves = baseTokenReserves.add(tokenOffered);
            uint256 newFYTokenReserves = supply.add(fyTokenReserves.add(fyTokenRequired));

            require(newBaseTokenReserves <= type(uint128).max); // fyTokenReserves can't go over type(uint128).max
            require(newFYTokenReserves <= type(uint128).max); // fyTokenReserves can't go over type(uint128).max

            _update(
                toUint128(newBaseTokenReserves),
                toUint128(newFYTokenReserves.add(tokensMinted)), // Account for the "virtual" fyDai from the new minted LP tokens
                _storedBaseTokenReserve,
                _storedFYTokenReserve
            );
        }

        require(baseToken.transferFrom(from, address(this), tokenOffered));
        require(fyToken.transferFrom(from, address(this), fyTokenRequired));
        _mint(to, tokensMinted);


        emit Liquidity(maturity, from, to, -toInt256(tokenOffered), -toInt256(fyTokenRequired), toInt256(tokensMinted));

        return tokensMinted;
    }

    /// @dev Mint liquidity tokens in exchange for adding only baseToken
    /// The liquidity provider needs to have called `baseToken.approve`.
    /// @param from Wallet providing the baseToken and fyToken. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool, from this we calculate how much baseToken it will be taken in.
    /// @return The amount of liquidity tokens minted.
    function mintWithToken(address from, address to, uint256 fyTokenToBuy) // TODO: Rename to mintWithBaseToken
        external
        onlyHolderOrDelegate(from)
        returns (uint256, uint256)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint256 supply = totalSupply();
        require(supply > 0, "Pool: Use mint first");

        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        uint256 fyTokenReserves = fyToken.balanceOf(address(this));

        uint256 baseTokenIn = _buyFYTokenPreview(
            toUint128(fyTokenToBuy),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        ); // This is a virtual buy

        require(fyTokenReserves >= fyTokenToBuy, "Pool: Not enough fyDai");
        uint256 tokensMinted = supply.mul(fyTokenToBuy).div(fyTokenReserves.sub(fyTokenToBuy));
        baseTokenIn = baseTokenReserves.add(baseTokenIn).mul(tokensMinted).div(supply);

        uint256 newBaseTokenReserves = baseTokenReserves.add(baseTokenIn);
        require(newBaseTokenReserves <= type(uint128).max/*, "Pool: Too much baseToken"*/);

        require(baseToken.transferFrom(from, address(this), baseTokenIn)/*, "Pool: baseToken transfer failed"*/);
        _mint(to, tokensMinted);

        _update(
            toUint128(newBaseTokenReserves),
            toUint128(fyTokenReserves.add(supply).add(tokensMinted)), // Add LP tokens to get virtual fyToken reserves
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Liquidity(maturity, from, to, -toInt256(baseTokenIn), 0, toInt256(tokensMinted));

        return (baseTokenIn, tokensMinted);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken and fyToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param from Wallet providing the liquidity tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @return The amount of reserve tokens returned (daiTokens, fyDaiTokens).
    function burn(address from, address to, uint256 tokensBurned)
        external override
        onlyHolderOrDelegate(from)
        returns (uint256, uint256)
    {
        uint256 supply = totalSupply();
        uint256 baseTokenReserves = baseToken.balanceOf(address(this));
        // use the actual reserves rather than the virtual reserves
        uint256 tokenOut;
        uint256 fyTokenOut;
        { // avoiding stack too deep
            uint256 fyTokenReserves = fyToken.balanceOf(address(this));
            tokenOut = tokensBurned.mul(baseTokenReserves).div(supply);
            fyTokenOut = tokensBurned.mul(fyTokenReserves).div(supply);

            uint256 newFYTokenReserves = fyTokenReserves.sub(fyTokenOut).add(supply).sub(tokensBurned);

            (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
                (storedBaseTokenReserve, storedFYTokenReserve);

            _update(
                toUint128(baseTokenReserves.sub(tokenOut)),
                toUint128(newFYTokenReserves),
                _storedBaseTokenReserve,
                _storedFYTokenReserve
            );
        }

        _burn(from, tokensBurned); // TODO: Fix to check allowance
        baseToken.transfer(to, tokenOut);
        fyToken.transfer(to, fyTokenOut);

        emit Liquidity(maturity, from, to, toInt256(tokenOut), toInt256(fyTokenOut), -toInt256(tokensBurned));

        return (tokenOut, fyTokenOut);
    }

    /// @dev Burn liquidity tokens in exchange for baseToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param from Wallet providing the liquidity tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the baseToken and fyToken.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @return The amount of base tokens returned.
    function burnForBaseToken(address from, address to, uint256 tokensBurned)
        external
        onlyHolderOrDelegate(from)
        returns (uint256)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint256 supply = totalSupply();
        // use the actual reserves rather than the virtual reserves
        uint256 tokenOut;
        uint256 fyTokenObtained;
        { // avoiding stack too deep
            uint256 fyTokenReserves = fyToken.balanceOf(address(this));
            tokenOut = tokensBurned.mul(_storedBaseTokenReserve).div(supply);
            fyTokenObtained = tokensBurned.mul(fyTokenReserves).div(supply);

            tokenOut = tokenOut.add(
                YieldMath.daiOutForFYDaiIn(                            // This is a virtual sell
                    toUint128(uint256(_storedBaseTokenReserve).sub(tokenOut)),                // Real reserves, minus virtual burn
                    sub(_storedFYTokenReserve, toUint128(fyTokenObtained)), // Virtual reserves, minus virtual burn
                    toUint128(fyTokenObtained),                          // Sell the virtual fyToken obtained
                    toUint128(maturity - block.timestamp),             // This can't be called after maturity
                    k,
                    g2
                )
            );

            _update(
                toUint128(baseToken.balanceOf(address(this)).sub(tokenOut)),
                toUint128(fyTokenReserves.add(supply).sub(tokensBurned)),
                _storedBaseTokenReserve,
                _storedFYTokenReserve
            );
        }

        _burn(from, tokensBurned); // TODO: Fix to check allowance
        baseToken.transfer(to, tokenOut);

        emit Liquidity(maturity, from, to, toInt256(tokenOut), 0, -toInt256(tokensBurned));

        return tokenOut;
    }

    /// @dev Sell baseToken for fyToken
    /// The trader needs to have called `baseToken.approve`
    /// @param from Wallet providing the baseToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyToken being bought
    /// @param baseTokenIn Amount of baseToken being sold that will be taken from the user's wallet
    /// @return Amount of fyToken that will be deposited on `to` wallet
    function sellBaseToken(address from, address to, uint128 baseTokenIn)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint128 fyTokenOut = _sellBaseTokenPreview(
            baseTokenIn,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        baseToken.transferFrom(from, address(this), baseTokenIn);
        fyToken.transfer(to, fyTokenOut);

        _update(
            getBaseTokenReserves(),
            getFYTokenReserves(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Trade(maturity, from, to, -toInt256(baseTokenIn), toInt256(fyTokenOut));

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
        uint128 fyTokenOut = YieldMath.fyDaiOutForDaiIn(
            baseTokenReserves,
            fyTokenReserves,
            baseTokenIn,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g1
        );

        require(
            sub(fyTokenReserves, fyTokenOut) >= add(baseTokenReserves, baseTokenIn),
            "Pool: fy reserves too low"
        );

        return fyTokenOut;
    }

    /// @dev Buy baseToken for fyToken
    /// The trader needs to have called `fyToken.approve`
    /// @param from Wallet providing the fyToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the baseToken being bought
    /// @param tokenOut Amount of baseToken being bought that will be deposited in `to` wallet
    /// @return Amount of fyToken that will be taken from `from` wallet
    function buyBaseToken(address from, address to, uint128 tokenOut)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint128 fyTokenIn = _buyBaseTokenPreview(tokenOut, _storedBaseTokenReserve, _storedFYTokenReserve);

        fyToken.transferFrom(from, address(this), fyTokenIn);
        baseToken.transfer(to, tokenOut);

        _update(
            getBaseTokenReserves(),
            getFYTokenReserves(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Trade(maturity, from, to, toInt256(tokenOut), -toInt256(fyTokenIn));

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
        return YieldMath.fyDaiInForDaiOut(
            baseTokenReserves,
            fyTokenReserves,
            tokenOut,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Sell fyToken for baseToken
    /// The trader needs to have called `fyToken.approve`
    /// @param from Wallet providing the fyToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the baseToken being bought
    /// @param fyTokenIn Amount of fyToken being sold that will be taken from the user's wallet
    /// @return Amount of baseToken that will be deposited on `to` wallet
    function sellFYToken(address from, address to, uint128 fyTokenIn)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint128 tokenOut = _sellFYTokenPreview(
            fyTokenIn,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        fyToken.transferFrom(from, address(this), fyTokenIn);
        baseToken.transfer(to, tokenOut);

        _update(
            getBaseTokenReserves(),
            getFYTokenReserves(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Trade(maturity, from, to, toInt256(tokenOut), -toInt256(fyTokenIn));

        return tokenOut;
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
        return YieldMath.daiOutForFYDaiIn(
            baseTokenReserves,
            fyTokenReserves,
            fyTokenIn,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Buy fyToken for baseToken
    /// The trader needs to have called `baseToken.approve`
    /// @param from Wallet providing the baseToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyToken being bought
    /// @param fyTokenOut Amount of fyToken being bought that will be deposited in `to` wallet
    /// @return Amount of baseToken that will be taken from `from` wallet
    function buyFYToken(address from, address to, uint128 fyTokenOut)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        uint128 baseTokenIn = _buyFYTokenPreview(
            fyTokenOut,
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        baseToken.transferFrom(from, address(this), baseTokenIn);
        fyToken.transfer(to, fyTokenOut);

        _update(
            getBaseTokenReserves(),
            getFYTokenReserves(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Trade(maturity, from, to, -toInt256(baseTokenIn), toInt256(fyTokenOut));

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
        uint128 baseTokenIn = YieldMath.daiInForFYDaiOut(
            baseTokenReserves,
            fyTokenReserves,
            fyTokenOut,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g1
        );

        require(
            sub(fyTokenReserves, fyTokenOut) >= add(baseTokenReserves, baseTokenIn),
            "Pool: fy reserves too low"
        );

        return baseTokenIn;
    }

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

    /// @dev Sell fyTokens in exchange for fyTokens from a different pool. Both pools must have the same base token.
    /// User must have approved the pool2 to operate for him in pool1 with `pool1.addDelegate(pool2.address)`.
    /// User must have approved the pool1 to take from him fyToken1 with `fyToken1.approve(pool1.address, fyTokenIn)`.
    /// @param from Wallet providing the LP tokens.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param pool Origin pool for the fyToken being rolled.
    /// @param fyTokenIn Amount of `fyToken` that will be rolled.
    // @return The amount of `fyToken` obtained.
    function rollFYToken(address from, address to, IPool pool, uint128 fyTokenIn)
        external
        onlyHolderOrDelegate(from)
        returns (uint256)
    {
        (uint112 _storedBaseTokenReserve, uint112 _storedFYTokenReserve) =
            (storedBaseTokenReserve, storedFYTokenReserve);

        // TODO: Either whitelist the pools, or check balances before and after
        uint128 baseTokenIn = pool.sellFYToken(from, address(this), fyTokenIn);
        uint128 baseTokenReserves = sub(_storedBaseTokenReserve, baseTokenIn);

        uint128 fyTokenOut = YieldMath.fyDaiOutForDaiIn(
            baseTokenReserves,
            _storedFYTokenReserve,
            baseTokenIn,
            uint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g1
        );

        require(
            sub(_storedFYTokenReserve, fyTokenOut) >= add(baseTokenReserves, baseTokenIn),
            "Pool: fyToken reserves too low"
        );

        fyToken.transfer(to, fyTokenOut);

        _update(
            getBaseTokenReserves(),
            getFYTokenReserves(),
            _storedBaseTokenReserve,
            _storedFYTokenReserve
        );

        emit Trade(maturity, from, to, -toInt256(baseTokenIn), -toInt256(fyTokenOut));

        return fyTokenOut;
    }

    /// @dev Returns the "virtual" fyToken reserves
    function getFYTokenReserves()
        public view override
        returns(uint128)
    {
        return toUint128(fyToken.balanceOf(address(this)).add(totalSupply()));
    }

    /// @dev Returns the baseToken reserves
    function getBaseTokenReserves()
        public view override
        returns(uint128)
    {
        return toUint128(baseToken.balanceOf(address(this)));
    }
}
