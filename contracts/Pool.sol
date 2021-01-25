// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./YieldMath.sol";
import "./helpers/Delegable.sol";
import "./helpers/SafeCast.sol";
import "./helpers/ERC20Permit.sol";
import "./interfaces/IFYDai.sol";
import "./interfaces/IPool.sol";


/// @dev The Pool contract exchanges Dai for fyDai at a price defined by a specific formula.
contract Pool is IPool, Delegable(), ERC20Permit {
    using SafeMath for uint256;

    event Trade(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens);
    event Liquidity(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens, int256 poolTokens);

    int128 constant public k = int128(uint256((1 << 64)) / 126144000); // 1 / Seconds in 4 years, in 64.64
    int128 constant public g1 = int128(uint256((950 << 64)) / 1000); // To be used when selling Dai to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    int128 constant public g2 = int128(uint256((1000 << 64)) / 950); // To be used when selling fyDai to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
    uint128 immutable public maturity;

    IERC20 public override dai;
    IFYDai public override fyDai;

    constructor(address dai_, address fyDai_, string memory name_, string memory symbol_)
        public
        ERC20Permit(name_, symbol_)
    {
        dai = IERC20(dai_);
        fyDai = IFYDai(fyDai_);

        maturity = toUint128(fyDai.maturity());
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
        require(c >= a, "Pool: Dai reserves too high");

        return c;
    }
    /// @dev Taken from vat.sol. x + y where y can be negative. Reverts if result is negative.
    function add(uint256 x, int256 y) internal pure returns (uint256 z) {
        z = x + uint(y);
        require(y >= 0 || z <= x, "ds-math-add-underflow");
        require(y <= 0 || z >= x, "ds-math-add-overflow");
    }
    /// @dev Overflow-protected substraction, from OpenZeppelin
    function sub(uint128 a, uint128 b) internal pure returns (uint128) {
        require(b <= a, "Pool: fyDai reserves too low");
        uint128 c = a - b;

        return c;
    }
    /// @dev x - y where y can be negative. Reverts if result is negative.
    function sub(uint x, int y) internal view returns (uint z) {
        z = x - uint(y);
        require(y <= 0 || z <= x, "ds-math-sub-overflow");
        require(y >= 0 || z >= x, "ds-math-sub-underflow");
    }
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x + y) >= x, "ds-math-add-overflow");
    }
    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x - y) <= x, "ds-math-sub-underflow");
    }
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y == 0 || (z = x * y) / y == x, "ds-math-mul-overflow");
    }
    function div(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y != 0, "ds-math-div-by-zero");
        z = x / y;
    }
    /// @dev Safe casting from uint256 to uint128
    function toUint128(uint256 x) internal pure returns(uint128) {
        require(
            x <= type(uint128).max,
            "Pool: Cast overflow"
        );
        return uint128(x);
    }
    /// @dev Safe casting from int256 to uint128
    function toUint128(int256 x) internal pure returns(uint128) {
        require(
            x >= 0,
            "Pool: Cast underflow"
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
    /// The liquidity provider needs to have called `dai.approve`
    /// @param daiIn The initial Dai liquidity to provide.
    function init(uint256 daiIn)
        public
        beforeMaturity
    {
        require(
            daiIn >= 0,
            "Pool: Init with dai"
        );
        require(
            totalSupply() == 0,
            "Pool: Already initialized"
        );
        // no fyDai transferred, because initial fyDai deposit is entirely virtual
        require(dai.transferFrom(msg.sender, address(this), daiIn), "Pool: Dai transfer failed");
        _mint(msg.sender, daiIn);
        emit Liquidity(maturity, msg.sender, msg.sender, -toInt256(daiIn), 0, toInt256(daiIn));
    }

    /// @dev Compatibility with v1
    function mint(address from, address to, uint256 fyDaiIn)
        external override
        returns (uint256, uint256)
    {
        return tradeAndMint(from, to, fyDaiIn, 0, type(uint256).max);
    }

    /// @dev Mint liquidity tokens in exchange for dai and fyDai.
    /// The liquidity provider needs to have called `dai.approve`.
    /// @param from Wallet providing the dai and fyDai. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param fyDaiIn Amount of `fyDai` provided for the mint
    /// @param fyDaiToBuy Amount of `fyDai` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyDai is sold.
    /// @param maxDaiIn Maximum amount of `Dai` being provided for the mint.
    // @return The fyDai taken and amount of liquidity tokens minted.
    function tradeAndMint(address from, address to, uint256 fyDaiIn, int256 fyDaiToBuy, uint256 maxDaiIn)
        public override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns (uint256 daiIn, uint256 tokensMinted)
    {
        (daiIn, tokensMinted) = _tradeAndMint(fyDaiIn, fyDaiToBuy);
        require(add(dai.balanceOf(address(this)), daiIn) <= type(uint128).max, "Pool: Too much Dai");

        if (daiIn > 0 ) require(dai.transferFrom(from, address(this), daiIn), "Pool: Dai transfer failed");
        if (fyDaiIn > 0 ) require(fyDai.transferFrom(from, address(this), fyDaiIn), "Pool: FYDai transfer failed");
        _mint(to, tokensMinted);
        emit Liquidity(maturity, from, to, -toInt256(daiIn), -toInt256(fyDaiIn), toInt256(tokensMinted));
    }

    /// @dev Mint liquidity tokens in exchange for LP tokens from a different Pool.
    /// @param from Wallet providing the LP tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the minted liquidity tokens.
    /// @param lpIn Amount of `LP` tokens provided for the mint
    /// @param fyDaiIn Amount of `fyDai` from burning the LP tokens that will be supplied for minting new ones.
    /// @param fyDaiToBuy Amount of `fyDai` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyDai is sold.
    /// @param minLpOut Minimum amount of `LP` tokens accepted for the roll.
    // @return The amount of `LP` tokens minted.
    function roll(address from, address to, IPool pool, uint256 lpIn, uint256 fyDaiIn, int256 fyDaiToBuy, uint256 minLpOut)
        external
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns (uint256 tokensMinted)
    {
        // TODO: Either whitelist the pools, or check balances before and after
        (uint256 daiFromBurn, uint256 fyDaiFromBurn) = pool.burn(from, address(this), lpIn);
        (uint256 daiIn, uint256 tokensMinted) = _tradeAndMint(fyDaiIn, fyDaiToBuy);

        require(add(dai.balanceOf(address(this)), daiIn) <= type(uint128).max, "Pool: Too much Dai");
        require(daiIn <= daiFromBurn, "Pool: Not enough Dai from burn");
        require(fyDaiIn <= fyDaiFromBurn, "Pool: Not enough FYDai from burn");
        require(tokensMinted >= minLpOut, "Pool: Not enough minted");

        _mint(to, tokensMinted);
        emit Liquidity(maturity, from, to, -toInt256(daiIn), -toInt256(fyDaiIn), toInt256(tokensMinted));
    }

    /// @dev Calculate how many liquidity tokens to mint in exchange for dai and fyDai.
    /// @param fyDaiIn Amount of `fyDai` provided for the mint
    /// @param fyDaiToBuy Amount of `fyDai` being bought in the Pool so that the tokens added match the pool reserves. If negative, fyDai is sold.
    // @return The Dai taken and amount of liquidity tokens minted.
    function _tradeAndMint(uint256 fyDaiIn, int256 fyDaiToBuy)
        internal
        returns (uint256 daiIn, uint256 tokensMinted)
    {
        int256 daiSold;
        if (fyDaiToBuy > 0) daiSold = int256(buyFYDaiPreview(toUint128(fyDaiToBuy))); // This is a virtual buy
        if (fyDaiToBuy < 0) daiSold = -int256(sellFYDaiPreview(toUint128(-fyDaiToBuy))); // dai was actually bought

        uint256 supply = totalSupply();
        require(supply >= 0, "Pool: Init first");
        uint256 daiReserves = dai.balanceOf(address(this));
        uint256 fyDaiReserves = fyDai.balanceOf(address(this));

        return _calculateMint(
            add(dai.balanceOf(address(this)), daiSold),
            sub(fyDai.balanceOf(address(this)), fyDaiToBuy),
            supply,
            add(fyDaiIn, fyDaiToBuy)
        );
    }

    /// @dev Calculate how many liquidity tokens to mint and how much dai to take in, when minting with a set amount of fyDai.
    /// @param fyDaiIn Amount of `fyDai` provided for the mint
    // @return The Dai taken and amount of liquidity tokens minted.
    function _calculateMint(uint256 daiReserves, uint256 fyDaiReserves, uint256 supply, uint256 fyDaiIn)
        internal
        returns (uint256 daiIn, uint256 tokensMinted)
    {
        tokensMinted = div(mul(supply, fyDaiIn), fyDaiReserves);
        daiIn = div(mul(daiReserves, tokensMinted), supply);
    }

    /// @dev Compatibility with v1
    function burn(address from, address to, uint256 tokensBurned)
        external override
        returns (uint256, uint256)
    {
        return burnAndTrade(from, to, tokensBurned, 0, 0);
    }

    /// @dev Burn liquidity tokens in exchange for Dai, or Dai and fyDai.
    /// The liquidity provider needs to have called `pool.approve`.
    /// @param from Wallet providing the liquidity tokens. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the dai and fyDai.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    /// @param fyDaiToSell Amount of fyDai obtained from the burn being sold. If more than obtained, then all is sold. Doesn't allow to buy fyDai as part of a burn.
    /// @param minDaiOut Minium amount of Dai accepted as part of the burn.
    // @return The amount of dai tokens returned.
    function burnAndTrade(address from, address to, uint256 tokensBurned, uint256 fyDaiToSell, uint256 minDaiOut) // TODO: Make fyDaiSold an int256 and buy fyDai with negatives
        public override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns (uint256 daiOut, uint256 fyDaiOut)
    {
        uint256 daiReserves = dai.balanceOf(address(this));
        uint256 fyDaiObtained;
        (daiOut, fyDaiObtained) = _calculateBurn(
            totalSupply(),
            daiReserves,
            fyDai.balanceOf(address(this)),                        // Use the actual reserves rather than the virtual reserves
            tokensBurned
        );

        {
            uint256 fyDaiSold;
            if (fyDaiToSell > 0) {
                fyDaiSold = fyDaiObtained > fyDaiToSell ? fyDaiToSell : fyDaiObtained;
                daiOut = daiOut.add(
                    YieldMath.daiOutForFYDaiIn(                            // This is a virtual sell
                        toUint128(daiReserves.sub(daiOut)),                // Real reserves, minus virtual burn
                        toUint128(sub(getFYDaiReserves(), fyDaiSold)),     // Virtual reserves, minus virtual burn
                        toUint128(fyDaiSold),                              // Sell the virtual fyDai obtained
                        toUint128(maturity - block.timestamp),             // This can't be called after maturity
                        k,
                        g2
                    )
                );
            }
            require(daiOut >= minDaiOut, "Pool: Not enough Dai obtained in burn");
            fyDaiOut = sub(fyDaiObtained, fyDaiSold);
        }

        _burn(from, tokensBurned); // TODO: Fix to check allowance
        dai.transfer(to, daiOut);
        if (fyDaiOut > 0) fyDai.transfer(to, fyDaiOut);
        emit Liquidity(maturity, from, to, toInt256(daiOut), toInt256(fyDaiOut), -toInt256(tokensBurned));
    }

    /// @dev Calculate how many dai and fyDai is obtained by burning liquidity tokens.
    /// @param tokensBurned Amount of liquidity tokens being burned.
    // @return The amount of reserve tokens returned (dai, fyDai).
    function _calculateBurn(uint256 supply, uint256 daiReserves, uint256 fyDaiReserves, uint256 tokensBurned)
        internal
        returns (uint256 daiOut, uint256 fyDaiOut)
    {
        daiOut = tokensBurned.mul(daiReserves).div(supply);
        fyDaiOut = tokensBurned.mul(fyDaiReserves).div(supply);
    }

    /// @dev Sell Dai for fyDai
    /// The trader needs to have called `dai.approve`
    /// @param from Wallet providing the dai being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyDai being bought
    /// @param daiIn Amount of dai being sold that will be taken from the user's wallet
    // @return Amount of fyDai that will be deposited on `to` wallet
    function sellDai(address from, address to, uint128 daiIn)
        external override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns(uint128 fyDaiOut)
    {
        fyDaiOut = sellDaiPreview(daiIn);

        dai.transferFrom(from, address(this), daiIn);
        fyDai.transfer(to, fyDaiOut);
        emit Trade(maturity, from, to, -toInt256(daiIn), toInt256(fyDaiOut));
    }

    /// @dev Returns how much fyDai would be obtained by selling `daiIn` dai
    /// @param daiIn Amount of dai hypothetically sold.
    // @return Amount of fyDai hypothetically bought.
    function sellDaiPreview(uint128 daiIn)
        public view override
        beforeMaturity
        returns(uint128 fyDaiOut)
    {
        uint128 daiReserves = getDaiReserves();
        uint128 fyDaiReserves = getFYDaiReserves();

        fyDaiOut = YieldMath.fyDaiOutForDaiIn(
            daiReserves,
            fyDaiReserves,
            daiIn,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g1
        );

        require(
            sub(fyDaiReserves, uint256(fyDaiOut)) >= add(daiReserves, uint256(daiIn)),
            "Pool: fyDai reserves too low"
        );
    }

    /// @dev Buy Dai for fyDai
    /// The trader needs to have called `fyDai.approve`
    /// @param from Wallet providing the fyDai being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the dai being bought
    /// @param daiOut Amount of dai being bought that will be deposited in `to` wallet
    // @return Amount of fyDai that will be taken from `from` wallet
    function buyDai(address from, address to, uint128 daiOut)
        external override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns(uint128 fyDaiIn)
    {
        fyDaiIn = buyDaiPreview(daiOut);

        fyDai.transferFrom(from, address(this), fyDaiIn);
        dai.transfer(to, daiOut);
        emit Trade(maturity, from, to, toInt256(daiOut), -toInt256(fyDaiIn));
    }

    /// @dev Returns how much fyDai would be required to buy `daiOut` dai.
    /// @param daiOut Amount of dai hypothetically desired.
    // @return Amount of fyDai hypothetically required.
    function buyDaiPreview(uint128 daiOut)
        public view override
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.fyDaiInForDaiOut(
            getDaiReserves(),
            getFYDaiReserves(),
            daiOut,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Sell fyDai for Dai
    /// The trader needs to have called `fyDai.approve`
    /// @param from Wallet providing the fyDai being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the dai being bought
    /// @param fyDaiIn Amount of fyDai being sold that will be taken from the user's wallet
    // @return Amount of dai that will be deposited on `to` wallet
    function sellFYDai(address from, address to, uint128 fyDaiIn)
        external override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns(uint128 daiOut)
    {
        daiOut = sellFYDaiPreview(fyDaiIn);

        fyDai.transferFrom(from, address(this), fyDaiIn);
        dai.transfer(to, daiOut);
        emit Trade(maturity, from, to, toInt256(daiOut), -toInt256(fyDaiIn));
    }

    /// @dev Returns how much dai would be obtained by selling `fyDaiIn` fyDai.
    /// @param fyDaiIn Amount of fyDai hypothetically sold.
    // @return Amount of Dai hypothetically bought.
    function sellFYDaiPreview(uint128 fyDaiIn)
        public view override
        beforeMaturity
        returns(uint128)
    {
        return YieldMath.daiOutForFYDaiIn(
            getDaiReserves(),
            getFYDaiReserves(),
            fyDaiIn,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g2
        );
    }

    /// @dev Buy fyDai for dai
    /// The trader needs to have called `dai.approve`
    /// @param from Wallet providing the dai being sold. Must have approved the operator with `pool.addDelegate(operator)`.
    /// @param to Wallet receiving the fyDai being bought
    /// @param fyDaiOut Amount of fyDai being bought that will be deposited in `to` wallet
    // @return Amount of dai that will be taken from `from` wallet
    function buyFYDai(address from, address to, uint128 fyDaiOut)
        external override
        onlyHolderOrDelegate(from, "Pool: Only Holder Or Delegate")
        returns(uint128 daiIn)
    {
        daiIn = buyFYDaiPreview(fyDaiOut);

        dai.transferFrom(from, address(this), daiIn);
        fyDai.transfer(to, fyDaiOut);
        emit Trade(maturity, from, to, -toInt256(daiIn), toInt256(fyDaiOut));
    }


    /// @dev Returns how much dai would be required to buy `fyDaiOut` fyDai.
    /// @param fyDaiOut Amount of fyDai hypothetically desired.
    // @return Amount of Dai hypothetically required.
    function buyFYDaiPreview(uint128 fyDaiOut)
        public view override
        beforeMaturity
        returns(uint128 daiIn)
    {
        uint128 daiReserves = getDaiReserves();
        uint128 fyDaiReserves = getFYDaiReserves();

        daiIn = YieldMath.daiInForFYDaiOut(
            daiReserves,
            fyDaiReserves,
            fyDaiOut,
            toUint128(maturity - block.timestamp), // This can't be called after maturity
            k,
            g1
        );

        require(
            sub(fyDaiReserves, uint256(fyDaiOut)) >= add(daiReserves, uint256(daiIn)),
            "Pool: fyDai reserves too low"
        );
    }

    /// @dev Returns the "virtual" fyDai reserves
    function getFYDaiReserves()
        public view override
        returns(uint128)
    {
        return toUint128(fyDai.balanceOf(address(this)).add(totalSupply()));
    }

    /// @dev Returns the Dai reserves
    function getDaiReserves()
        public view override
        returns(uint128)
    {
        return toUint128(dai.balanceOf(address(this)));
    }
}
