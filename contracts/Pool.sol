// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "./YieldMath.sol";
import "./helpers/Delegable.sol";
import "./helpers/ERC20Permit.sol";
import "./helpers/SafeCast.sol";
import "./helpers/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./helpers/SafeERC20Namer.sol";
import "./interfaces/IFYToken.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolFactory.sol";


/// @dev The Pool contract exchanges base for fyToken at a price defined by a specific formula.
contract Pool is IPool, Delegable(), ERC20Permit {
    using SafeMath for uint256;
    using SafeMath for uint128;
    using SafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;

    event Trade(uint256 maturity, address indexed from, address indexed to, int256 baseTokens, int256 fyTokens);
    event Liquidity(uint256 maturity, address indexed from, address indexed to, int256 baseTokens, int256 fyTokens, int256 poolTokens);

    int128 constant public k = int128(uint256((1 << 64)) / 126144000); // 1 / Seconds in 4 years, in 64.64
    int128 constant public g1 = int128(uint256((950 << 64)) / 1000); // To be used when selling base to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    int128 constant public g2 = int128(uint256((1000 << 64)) / 950); // To be used when selling fyToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    uint128 immutable public maturity;

    IERC20 public immutable override base;
    IFYToken public immutable override fyToken;

    constructor()
        ERC20Permit(
            string(abi.encodePacked("Yield ", SafeERC20Namer.tokenName(IPoolFactory(msg.sender).nextFYToken()), " LP Token")),
            string(abi.encodePacked(SafeERC20Namer.tokenSymbol(IPoolFactory(msg.sender).nextFYToken()), "LP"))
        )
    {
        IFYToken _fyToken = IFYToken(IPoolFactory(msg.sender).nextFYToken());
        fyToken = _fyToken;
        base = IERC20(IPoolFactory(msg.sender).nextToken());

        maturity = _fyToken.maturity().uint256ToUint128();
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

    // -----------------------------------------------------------
    // Liquidity management
    // -----------------------------------------------------------



    /// @dev Mint initial liquidity tokens.
    /// The liquidity provider needs to have called `base.approve`
    /// @param baseIn The initial base liquidity to provide.
    function init(uint256 baseIn)
        public
        beforeMaturity
    {
        require(
            baseIn >= 0,
            "Pool: Init with base token"
        );
        require(
            totalSupply() == 0,
            "Pool: Already initialized"
        );

        // no fyToken transferred, because initial fyToken deposit is entirely virtual
        base.transferFrom(msg.sender, address(this), baseIn);
        _mint(msg.sender, baseIn);
        emit Liquidity(maturity, msg.sender, msg.sender, -toInt256(baseIn), 0, toInt256(baseIn));
    }
    /// @dev Compatibility with v1
    function mint(address from, address to, uint256 fyTokenIn)
        external override
        returns (uint256, uint256)
    {
        return tradeAndMint(from, to, fyTokenIn, 0, type(uint256).max, 0);
    }

    /// @dev Compatibility with v1
    function burn(address from, address to, uint256 tokensBurned)
        external override
        returns (uint256, uint256)
    {
        return burnAndTrade(from, to, tokensBurned, 0, 0, 0);
    }

    /// @dev Mint liquidity tokens in exchange for base and fyToken.
    /// The liquidity provider needs to have called `base.approve`.
    /// @param from Wallet providing the base and fyToken. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyTokenIn Amount of `fyToken` provided for the mint
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyToken is sold.
    /// @param maxBaseIn Maximum amount of `Base` being provided for the mint.
    /// @param minLPOut Minimum amount of LP tokens accepted as part of the mint.
    // @return The fyToken taken and amount of liquidity tokens minted.
    function tradeAndMint(address from, address to, uint256 fyTokenIn, int256 fyTokenToBuy, uint256 maxBaseIn, uint256 minLPOut)
        public override
        onlyHolderOrDelegate(from)
        returns (uint256 baseIn, uint256 tokensMinted)
    {
        (baseIn, tokensMinted) = _calculateTradeAndMint(fyTokenIn, fyTokenToBuy);
        require(baseIn <= maxBaseIn, "Pool: Too much Base required");
        require(tokensMinted >= minLPOut, "Pool: Not enough LP minted");
        require(base.balanceOf(address(this)).add(baseIn) <= type(uint128).max, "Pool: Too much Base for the Pool");

        if (baseIn > 0 ) require(base.transferFrom(from, address(this), baseIn), "Pool: Base transfer failed");
        if (fyTokenIn > 0 ) require(fyToken.transferFrom(from, address(this), fyTokenIn), "Pool: FYToken transfer failed");
        _mint(to, tokensMinted);
        emit Liquidity(maturity, from, to, -(baseIn.uint256ToInt256()), -(fyTokenIn.uint256ToInt256()), tokensMinted.uint256ToInt256());
    }

    /// @dev Burn liquidity tokens in exchange for Base, or Base and fyToken.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param from Wallet providing the liquidity tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the base and fyToken.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @param fyTokenToSell Amount of fyToken obtained from the burn being sold. If more than obtained, then all is sold. Doesn't allow to buy fyToken as part of a burn.
    /// @param minBaseOut Minium amount of Base accepted as part of the burn.
    /// @param minFYTokenOut Minium amount of FYToken accepted as part of the burn.
    // @return The amount of base tokens returned.
    function burnAndTrade(address from, address to, uint256 tokensBurned, uint256 fyTokenToSell, uint256 minBaseOut, uint256 minFYTokenOut) // TODO: Make fyTokenSold an int256 and buy fyToken with negatives
        public override
        onlyHolderOrDelegate(from)
        returns (uint256 baseOut, uint256 fyTokenOut)
    {
        { // Crazy stack depth
            uint256 baseReserves = base.balanceOf(address(this));
            uint256 fyTokenObtained;
            (baseOut, fyTokenObtained) = _calculateBurn(
                totalSupply(),
                baseReserves,
                fyToken.balanceOf(address(this)),                        // Use the actual reserves rather than the virtual reserves
                tokensBurned
            );

            uint256 fyTokenSold;
            if (fyTokenToSell > 0) {
                fyTokenSold = fyTokenObtained > fyTokenToSell ? fyTokenToSell : fyTokenObtained;
                baseOut = baseOut.add(
                    YieldMath.baseOutForFYTokenIn(                                        // This is a virtual sell
                        baseReserves.sub(baseOut).uint256ToUint128(),                    // Real reserves, minus virtual burn
                        uint256(getFYTokenReserves()).sub(fyTokenSold).uint256ToUint128(), // Virtual reserves, minus virtual burn
                        fyTokenSold.uint256ToUint128(),                                  // Sell the virtual fyToken obtained
                        (maturity - block.timestamp).uint256ToUint128(),               // This can't be called after maturity
                        k,
                        g2
                    )
                );
            }
            fyTokenOut = fyTokenObtained.sub(fyTokenSold);
            require(baseOut >= minBaseOut, "Pool: Not enough Base obtained in burn");
            require(fyTokenOut >= minFYTokenOut, "Pool: Not enough FYToken obtained in burn");
        
            _burn(from, tokensBurned); // TODO: Fix to check allowance
            base.transfer(to, baseOut);
            if (fyTokenOut > 0) fyToken.transfer(to, fyTokenOut);
        }
        emit Liquidity(maturity, from, to, baseOut.uint256ToInt256(), fyTokenOut.uint256ToInt256(), -(tokensBurned.uint256ToInt256()));
    }

    /// @dev Mint liquidity tokens in exchange for LP tokens from a different Pool.
    /// @param from Wallet providing the LP tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param pool Pool for the tokens being burnt.
    /// @param lpIn Amount of `LP` tokens provided for the mint
    /// @param fyTokenIn Amount of `fyToken` from burning the LP tokens that will be supplied for minting new ones.
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyToken is sold.
    /// @param minLpOut Minimum amount of `LP` tokens accepted for the roll.
    // @return The amount of `LP` tokens minted.
    /*
    function rollLiquidity(address from, address to, IPool pool, uint256 lpIn, uint256 fyTokenIn, int256 fyTokenToBuy, uint256 minLpOut)
        external
        onlyHolderOrDelegate(from)
        returns (uint256)
    {
        // TODO: Either whitelist the pools, or check balances before and after
        (uint256 baseFromBurn, uint256 fyTokenFromBurn) = pool.burn(from, address(this), lpIn);
        (uint256 baseIn, uint256 tokensMinted) = _calculateTradeAndMint(fyTokenIn, fyTokenToBuy);

        require(base.balanceOf(address(this)).add(baseIn) <= type(uint128).max, "Pool: Too much Base");
        require(baseIn <= baseFromBurn, "Pool: Not enough Base from burn");
        require(fyTokenIn <= fyTokenFromBurn, "Pool: Not enough FYToken from burn");
        require(tokensMinted >= minLpOut, "Pool: Not enough minted");

        _mint(to, tokensMinted);
        emit Liquidity(maturity, from, to, -(baseIn.uint256ToInt256()), -(fyTokenIn.uint256ToInt256()), tokensMinted.uint256ToInt256());
        return tokensMinted;
    }
    */

    /// @dev Calculate how many liquidity tokens to mint and how much base to take in, when minting with a set amount of fyToken.
    /// @param fyTokenIn Amount of `fyToken` provided for the mint
    // @return The Base taken and amount of liquidity tokens minted.
    function _calculateMint(uint256 baseReserves, uint256 fyTokenReserves, uint256 supply, uint256 fyTokenIn)
        internal pure
        returns (uint256 baseIn, uint256 tokensMinted)
    {
        tokensMinted = supply.mul(fyTokenIn).div(fyTokenReserves);
        baseIn = baseReserves.mul(tokensMinted).div(supply);
    }

    /// @dev Calculate how many base and fyToken is obtained by burning liquidity tokens.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    // @return The amount of reserve tokens returned (base, fyToken).
    function _calculateBurn(uint256 supply, uint256 baseReserves, uint256 fyTokenReserves, uint256 tokensBurned)
        internal pure
        returns (uint256 baseOut, uint256 fyTokenOut)
    {
        baseOut = tokensBurned.mul(baseReserves).div(supply);
        fyTokenOut = tokensBurned.mul(fyTokenReserves).div(supply);
    }

    /// @dev Calculate how many liquidity tokens to mint in exchange for base and fyToken.
    /// @param fyTokenIn Amount of `fyToken` provided for the mint
    /// @param fyTokenToBuy Amount of `fyToken` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyToken is sold.
    // @return The Base taken and amount of liquidity tokens minted.
    function _calculateTradeAndMint(uint256 fyTokenIn, int256 fyTokenToBuy)
        internal view
        returns (uint256 baseIn, uint256 tokensMinted)
    {
        int256 baseSold;
        if (fyTokenToBuy > 0) baseSold = int256(buyFYTokenPreview(fyTokenToBuy.int256ToUint128())); // This is a virtual buy
        if (fyTokenToBuy < 0) baseSold = -int256(sellFYTokenPreview((-fyTokenToBuy).int256ToUint128())); // base was actually bought

        uint256 supply = totalSupply();
        require(supply >= 0, "Pool: Init first");

        return _calculateMint(
            base.balanceOf(address(this)).add3(baseSold),
            fyToken.balanceOf(address(this)).sub3(fyTokenToBuy),
            supply,
            fyTokenIn.add3(fyTokenToBuy)
        );
    }

    // -----------------------------------------------------------
    // Trading
    // -----------------------------------------------------------

    /// @dev Returns the "virtual" fyToken reserves
    function getFYTokenReserves()
        public view override
        returns(uint128)
    {
        return fyToken.balanceOf(address(this)).add(totalSupply()).uint256ToUint128();
    }

    /// @dev Returns the Base reserves
    function getBaseReserves()
        public view override
        returns(uint128)
    {
        return base.balanceOf(address(this)).uint256ToUint128();
    }

    /// @dev Sell Base for fyToken
    /// The trader needs to have called `base.approve`
    /// @param from Wallet providing the base being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyToken being bought
    /// @param baseIn Amount of base being sold that will be taken from the user's wallet
    // @return Amount of fyToken that will be deposited on `to` wallet
    function sellBase(address from, address to, uint128 baseIn)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128 fyTokenOut)
    {
        fyTokenOut = sellBasePreview(baseIn);

        base.transferFrom(from, address(this), baseIn);
        fyToken.transfer(to, fyTokenOut);
        emit Trade(maturity, from, to, -(baseIn.uint128ToInt256()), fyTokenOut.uint128ToInt256());
    }

    /// @dev Returns how much fyToken would be obtained by selling `baseIn` base
    /// @param baseIn Amount of base hypothetically sold.
    // @return Amount of fyToken hypothetically bought.
    function sellBasePreview(uint128 baseIn)
        public view override
        beforeMaturity
        returns(uint128 fyTokenOut)
    {
        uint128 baseReserves = getBaseReserves();
        uint128 fyTokenReserves = getFYTokenReserves();

        fyTokenOut = YieldMath.fyTokenOutForBaseIn(
            baseReserves,
            fyTokenReserves,
            baseIn,
            (maturity - block.timestamp).uint256ToUint128(), // This can't be called after maturity
            k,
            g1
        );

        require(
            fyTokenReserves.sub(fyTokenOut) >= baseReserves.add(baseIn),
            "Pool: fyToken reserves too low"
        );
    }

    /// @dev Buy Base for fyToken
    /// The trader needs to have called `fyToken.approve`
    /// @param from Wallet providing the fyToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the base being bought
    /// @param baseOut Amount of base being bought that will be deposited in `to` wallet
    // @return Amount of fyToken that will be taken from `from` wallet
    function buyBase(address from, address to, uint128 baseOut)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128 fyTokenIn)
    {
        fyTokenIn = buyBasePreview(baseOut);

        fyToken.transferFrom(from, address(this), fyTokenIn);
        base.transfer(to, baseOut);
        emit Trade(maturity, from, to, baseOut.uint128ToInt256(), -(fyTokenIn.uint128ToInt256()));
    }

    /// @dev Returns how much fyToken would be required to buy `baseOut` base.
    /// @param baseOut Amount of base hypothetically desired.
    // @return Amount of fyToken hypothetically required.
    function buyBasePreview(uint128 baseOut)
        public view override
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.fyTokenInForBaseOut(
            getBaseReserves(),
            getFYTokenReserves(),
            baseOut,
            (maturity - block.timestamp).uint256ToUint128(), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Sell fyToken for Base
    /// The trader needs to have called `fyToken.approve`
    /// @param from Wallet providing the fyToken being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the base being bought
    /// @param fyTokenIn Amount of fyToken being sold that will be taken from the user's wallet
    // @return Amount of base that will be deposited on `to` wallet
    function sellFYToken(address from, address to, uint128 fyTokenIn)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128 baseOut)
    {
        baseOut = sellFYTokenPreview(fyTokenIn);

        fyToken.transferFrom(from, address(this), fyTokenIn);
        base.transfer(to, baseOut);
        emit Trade(maturity, from, to, baseOut.uint128ToInt256(), -(fyTokenIn.uint128ToInt256()));
    }

    /// @dev Returns how much base would be obtained by selling `fyTokenIn` fyToken.
    /// @param fyTokenIn Amount of fyToken hypothetically sold.
    // @return Amount of Base hypothetically bought.
    function sellFYTokenPreview(uint128 fyTokenIn)
        public view override
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.baseOutForFYTokenIn(
            getBaseReserves(),
            getFYTokenReserves(),
            fyTokenIn,
            (maturity - block.timestamp).uint256ToUint128(), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Buy fyToken for base
    /// The trader needs to have called `base.approve`
    /// @param from Wallet providing the base being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyToken being bought
    /// @param fyTokenOut Amount of fyToken being bought that will be deposited in `to` wallet
    // @return Amount of base that will be taken from `from` wallet
    function buyFYToken(address from, address to, uint128 fyTokenOut)
        external override
        onlyHolderOrDelegate(from)
        returns(uint128 baseIn)
    {
        baseIn = buyFYTokenPreview(fyTokenOut);

        base.transferFrom(from, address(this), baseIn);
        fyToken.transfer(to, fyTokenOut);
        emit Trade(maturity, from, to, -(baseIn.uint128ToInt256()), fyTokenOut.uint128ToInt256());
    }

    /// @dev Returns how much base would be required to buy `fyTokenOut` fyToken.
    /// @param fyTokenOut Amount of fyToken hypothetically desired.
    // @return Amount of Base hypothetically required.
    function buyFYTokenPreview(uint128 fyTokenOut)
        public view override
        beforeMaturity
        returns(uint128 baseIn)
    {
        uint128 baseReserves = getBaseReserves();
        uint128 fyTokenReserves = getFYTokenReserves();

        baseIn = YieldMath.baseInForFYTokenOut(
            baseReserves,
            fyTokenReserves,
            fyTokenOut,
            (maturity - block.timestamp).uint256ToUint128(), // This can't be called after maturity
            k,
            g1
        );

        require(
            fyTokenReserves.sub(fyTokenOut) >= baseReserves.add(baseIn),
            "Pool: fyToken reserves too low"
        );
    }

    /// @dev Mint liquidity tokens in exchange for LP tokens from a different Pool.
    /// @param from Wallet providing the LP tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param pool Origin pool for the fyToken being rolled.
    /// @param fyTokenIn Amount of `fyToken` that will be rolled.
    // @return The amount of `fyToken` obtained.
    function rollFYToken(address from, address to, IPool pool, uint128 fyTokenIn)
        external
        onlyHolderOrDelegate(from)
        returns (uint256 fyTokenOut)
    {
        // TODO: Either whitelist the pools, or check balances before and after
        uint128 baseIn = pool.sellFYToken(from, address(this), fyTokenIn);
        uint128 baseReserves = getBaseReserves().sub2(baseIn);
        uint128 fyTokenReserves = getFYTokenReserves();

        fyTokenOut = YieldMath.fyTokenOutForBaseIn(
            baseReserves,
            fyTokenReserves,
            baseIn,
            (maturity - block.timestamp).uint256ToUint128(), // This can't be called after maturity
            k,
            g1
        );

        require(
            fyTokenReserves.sub(fyTokenOut) >= baseReserves.add(baseIn),
            "Pool: fyToken reserves too low"
        );

        fyToken.transfer(to, fyTokenOut);
        emit Trade(maturity, from, to, -(baseIn.uint256ToInt256()), fyTokenOut.uint256ToInt256());
    }
}
