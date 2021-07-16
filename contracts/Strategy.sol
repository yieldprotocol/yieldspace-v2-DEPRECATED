// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.1;

import "@yield-protocol/utils-v2/contracts/access/AccessControl.sol";
import "@yield-protocol/utils-v2/contracts/token/ERC20Permit.sol";
import "@yield-protocol/utils-v2/contracts/token/TransferHelper.sol";
import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/vault-interfaces/IFYToken.sol";
import "@yield-protocol/vault-interfaces/ICauldron.sol";
import "@yield-protocol/vault-interfaces/ILadle.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";


/// @dev The Pool contract exchanges base for fyToken at a price defined by a specific formula.
contract Strategy is AccessControl, ERC20Permit {

    ILadle public immutable ladle;              // Gateway to the Yield v2 Collateralized Debt Engine
    IERC20 public immutable token;              // Base token for this strategy
    bytes6 public immutable tokenId;            // Identifier for the base token in Yieldv2
    address public immutable tokenJoin;         // Yield v2 Join to deposit token when borrowing
    IPool public pool;                          // Pool that this strategy invests in
    IFYToken public fyToken;                    // Current fyToken for this strategy
    uint256 public balance;                     // Unallocated base token in this strategy
    bytes6 public vaultId;                      // Vault used to borrow fyToken

    constructor(ILadle ladle_, IERC20 token_, bytes6 tokenId_)
        ERC20Permit(
            "Yield LP Strategy",
            "fyLPSTRAT",
            18
        )
    { 
        require(
            ladle.cauldron().assets(tokenId_) == address(token_),
            "Mismatched tokenId"
        );
        ladle = ladle_;
        token = token_;
        tokenId = tokenId_;
        tokenJoin = address(ladle.joins(tokenId_));
    }

    /// @dev Swap funds to a new pool (auth)
    /// @notice First the strategy must be fully divested from the old pool.
    /// @notice First the strategy must repaid all debts from the old series.
    function swapPool(IPool pool_, bytes6 seriesId_)
        public
        auth
    {
        require(
            ladle.cauldron().assets(seriesId_).fyToken == pool_.fyToken,
            "Mismatched seriesId"
        );
        require(
            vaultId == bytes12(0) || ladle.batch(DESTROY, abi.encode(vaultId)),
            "Repay all debt first"
        );
        
        // Build a new vault
        bytes12 vaultId = abi.decode(ladle.batch(BUILD, abi.encode(seriesId, tokenId)), (bytes12));
        pool = pool_;
        fyToken = pool_.fyToken();
        emit PoolSwapped();
    }

    /// @dev Value of the stratefy in token terms
    function strategyValue()
        external view
        returns (uint256 strategy)
    {
        strategy = _value();
    }

    /// @dev Value of the stratefy in token terms
    function _strategyValue()
        internal view
        returns (uint256 strategy)
    {
        //  - Can we use 1 fyToken = 1 token for this purpose? It overvalues the value of the strategy.
        //  - If so lpTokens/lpSupply * (lpReserves + lpFYReserves) = value_in_token(strategy)
        strategy = (token.balanceOf(address(pool)) + fyToken.balanceOf(address(pool))) * pool.balanceOf(address(this)) / pool.totalSupply();
    }

    /// @dev Mint strategy tokens. The underlying tokens that the user contributes need to have been transferred previously.
    function mint(address to)
        public
        returns (uint256 minted)
    {
        // Find value of strategy
        // Find value of deposit. Straightforward if done in token
        // minted = supply * deposit/strategy
        uint256 deposited = token.balanceOf(this) - balance;
        uint256 minted = _totalSupply - deposited / _strategyValue();
        balance += deposited;
        _mint(to, minted);
    }

    /// @dev Burn strategy tokens to withdraw funds. Replenish the available funds buffer if below levels
    function burn(address to)
        public
        returns (uint256 withdrawal)
    {
        // Find value of strategy
        // Find value of burnt tokens. Straightforward if withdrawal done in token
        // strategy * burnt/supply = withdrawal
        uint256 toBurn = _balanceOf[address(this)];
        withdrawal = _strategyValue() * toBurn / _totalSupply;
        if (withdrawal > balance || balance - withdrawal < bufferLow) {
            _fillBuffer(withdrawal, minTokenReceived, minFYTokenReceived); // TODO: Set slippage via governance, and calculate limits on the fly
        }
        balance -= withdrawal; // TODO: Divest if this would lead to `balance` below `BUFFER_LOW`
        _burn(address(this), toBurn);
        token.transfer(to, withdrawal);
    }

    /// @dev Fill the available funds buffer
    function fillBuffer(uint256 minTokenReceived, uint256 minFYTokenReceived)
        public
        auth
        returns (uint256 tokenDivested, uint256 fyTokenDivested)
    {
        (tokenDivested, fyTokenDivested) = _fillBuffer(0, minTokenReceived, minFYTokenReceived);
    }

    /// @dev Fill the available funds buffer, after an hypothetical withdrawal
    function _fillBuffer(uint256 withdrawal, uint256 minTokenReceived, uint256 minFYTokenReceived)
        internal
        returns (uint256 tokenDivested, uint256 fyTokenDivested)
    {
        require(
            balance - withdrawal < bufferHigh,
            "Buffer is full"
        );

        // Find out how many lp tokens we need to burn so that balance - withdrawal = bufferHigh
        uint256 toObtain = bufferHigh + withdrawal - balance;
        // Find value of lp tokens in token terms, scaled up for precision
        uint256 lpValueUp = (1e18 * (token.balanceOf(address(pool)) + fyToken.balanceOf(address(pool)))) / pool.totalSupply();
        uint256 toDivest = (1e18 * toObtain) / lpValueUp;
        // Divest and repay
        (tokenDivested, fyTokenDivested) = divestAndRepay(toDivest, minTokenReceived, minFYTokenReceived);
    }

    /// @dev Invest available funds from the strategy into YieldSpace LP (auth) - Borrow and mint
    function borrowAndInvest(uint256 tokenInvested, uint256 min)
        public
        auth
        returns (uint256 minted)
    {
        balance -= tokenInvested;

        // Find pool proportion p = fyTokenReserves/tokenReserves
        uint256 proportion = 1e18 * fyToken.balanceOf(address(pool)) / token.balanceOf(address(pool));
        // Deposit (investment * p) token to borrow (investment * p) fyToken
        //   (investment * p) fyToken + (investment * (1 - p)) token = investment
        //   (investment * p) / ((investment * p) + (investment * (1 - p))) = p
        //   (investment * (1 - p)) / ((investment * p) + (investment * (1 - p))) = 1 - p
        uint256 fyTokenToPool = tokenInvested.wmul(proportion);
        uint256 tokenToPool = tokenInvested - fyTokenToPool;

        token.transfer(address(pool), tokenToPool);

        token.transfer(tokenJoin, fyTokenToPool);
        tokenJoin.join(address(0), fyTokenToPool);
        ladle.batch(POUR, abi.encode(vaultId, address(pool), fyTokenToPool, fyTokenToPool));

        // Mint LP tokens with (investment * p) fyToken and (investment * (1 - p)) token
        minted = pool.mint(address(this), true, min);
    }

    /// @dev Invest available funds from the strategy into YieldSpace LP (auth) - Buy and mint
    /// @notice Decide off-chain how much fyToken to buy
    function buyAndInvest(uint256 tokenInvested, uint256 fyTokenToBuy, uint256 minTokensMinted)
        public
        auth
        returns (uint256 minted)
    {
        balance -= tokenInvested;
        token.transfer(address(pool), tokenInvested);
        (,, minted) = pool.mintWithBase(address(this), fyTokenToBuy, minTokensMinted);
    }

    /// @dev Divest from YieldSpace LP into available funds for the strategy (auth) - Burn and repay
    function divestAndRepay(uint256 lpBurnt, uint256 minTokenReceived, uint256 minFYTokenReceived)
        public
        auth
        returns (uint256 tokenDivested, uint256 fyTokenDivested)
    {
        // Burn lpTokens
        pool.transfer(address(pool), lpBurnt);
        (, tokenDivested, fyTokenDivested) = pool.burn(address(this), minTokenReceived, minFYTokenReceived);
        // Repay with fyToken. Reverts if there isn't enough debt
        fyToken.transfer(address(fyToken), fyTokenDivested);
        ladle.batch(POUR, abi.encode(vaultId, address(this), fyTokenDivested, fyTokenDivested));
        balance += tokenDivested;  
    }

    /// @dev Divest from YieldSpace LP into available funds for the strategy (auth) - Burn and sell
    function divestAndSell(uint256 lpBurnt, uint256 minTokenReceived)
        public
        auth
        returns (uint256 tokenDivested)
    {
        // Burn lpTokens, selling all obtained fyToken
        pool.transfer(address(pool), lpBurnt);
        (, tokenDivested) = pool.burnForBase(address(this), minTokenReceived);
        balance += tokenDivested;
    }

    /// @dev Divest from YieldSpace LP into available funds for the strategy (auth) - Burn and redeem
    function divestAndRedeem(uint256 lpBurnt, uint256 minTokenReceived, uint256 minFYTokenReceived)
        public
        auth
        returns (uint256 tokenDivested)
    {
        // Burn lpTokens
        pool.transfer(address(pool), lpBurnt);
        (, tokenDivested, fyTokenDivested) = pool.burn(address(this), minTokenReceived, minFYTokenReceived);
        // Redeem all obtained fyToken
        fyToken.transfer(address(fyToken), fyTokenDivested);
        tokenDivested += fyToken.redeem(address(this), fyTokenDivested);
        balance += tokenDivested;
    }
}
