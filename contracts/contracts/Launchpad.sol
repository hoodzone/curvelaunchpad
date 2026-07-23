// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MemeToken} from "./MemeToken.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";

/// @title Launchpad
/// @notice A pump.fun-style memecoin launchpad for Robinhood Chain.
///
/// Each launched token trades against a constant-product bonding curve using
/// *virtual* reserves. ETH raised on the curve accumulates until a per-token
/// graduation target is reached, at which point curve trading halts and the
/// collected ETH plus the reserved token allocation are migrated into a DEX
/// liquidity pool (LP tokens are burned to the dead address, permanently
/// locking liquidity).
///
/// ## Curve design
/// Let `Ve` = virtual ETH reserve, `Vt` = virtual token reserve, `k = Ve * Vt`.
///  - buy:  tokensOut = Vt * ethIn / (Ve + ethIn)
///  - sell: ethOut    = Ve * tokIn / (Vt + tokIn)
/// Reserves are seeded so that when exactly `CURVE_SUPPLY` tokens have been
/// sold, the real ETH collected equals the graduation target and `Vt` has
/// decayed to `LP_TOKEN_RESERVE`. See the constants below for the derivation.
///
/// Invariants maintained by construction:
///  - `virtualEth == INITIAL_VIRTUAL_ETH + ethReserve`
///  - `virtualToken >= LP_TOKEN_RESERVE` (curve never sells the LP allocation)
contract Launchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for MemeToken;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 internal constant BPS = 10_000;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Total fixed supply minted per token (1,000,000,000 with 18 decimals).
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    /// @notice Virtual token reserve at launch. Chosen equal to TOTAL_SUPPLY so
    ///         the curve starts "full".
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_000_000_000 ether;

    /// @notice Tokens reserved for the DEX liquidity pool at graduation. Equal to
    ///         the residual virtual token reserve when the curve is exhausted.
    uint256 public constant LP_TOKEN_RESERVE = 200_000_000 ether;

    /// @notice Tokens sold to buyers over the life of the curve
    ///         (= INITIAL_VIRTUAL_TOKEN - LP_TOKEN_RESERVE).
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;

    // With CURVE_SUPPLY / INITIAL_VIRTUAL_TOKEN = 0.8, the constant-product
    // relation forces INITIAL_VIRTUAL_ETH = target / 4 for the curve to sell
    // exactly CURVE_SUPPLY tokens as the raise reaches `target`.
    uint256 internal constant VIRTUAL_ETH_DIVISOR = 4;

    /// @notice Upper bound on the platform fee (10%).
    uint256 public constant MAX_FEE_BPS = 1_000;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Pool {
        address token; // token contract (also the mapping key)
        address creator; // launcher
        uint256 virtualEth; // virtual ETH reserve (Ve)
        uint256 virtualToken; // virtual token reserve (Vt)
        uint256 ethReserve; // real ETH collected on the curve (net of fees)
        uint256 graduationTarget; // real ETH needed to graduate (snapshot at create)
        uint256 createdAt; // block timestamp of creation
        bool halted; // curve trading stopped (target reached)
        bool graduated; // liquidity migrated to the DEX
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(address => Pool) private _pools;
    address[] private _allTokens;

    /// @notice Platform trade fee in basis points.
    uint256 public feeBps;
    /// @notice Recipient of accrued platform fees.
    address public feeRecipient;
    /// @notice Fees collected (in wei) awaiting withdrawal.
    uint256 public accruedFees;
    /// @notice Default graduation ETH target applied to newly created tokens.
    uint256 public defaultTargetRaise;
    /// @notice Uniswap V2-style router used to seed liquidity at graduation.
    ///         Zero until the owner sets it (Robinhood Chain DEX TBD).
    address public dexRouter;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string uri,
        uint256 graduationTarget,
        uint256 timestamp
    );

    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount, // ETH added to / removed from the curve (excl. fee)
        uint256 tokenAmount, // tokens received / sold
        uint256 feeAmount, // platform fee in wei
        uint256 virtualEth,
        uint256 virtualToken,
        uint256 ethReserve,
        uint256 timestamp
    );

    event Halted(address indexed token, uint256 ethReserve, uint256 timestamp);

    event Graduated(
        address indexed token,
        uint256 ethLiquidity,
        uint256 tokenLiquidity,
        uint256 lpTokens,
        uint256 timestamp
    );

    event FeeUpdated(uint256 feeBps, address feeRecipient);
    event DexRouterUpdated(address router);
    event DefaultTargetRaiseUpdated(uint256 target);
    event FeesWithdrawn(address to, uint256 amount);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        address owner_,
        address feeRecipient_,
        uint256 feeBps_,
        uint256 defaultTargetRaise_
    ) Ownable(owner_) {
        require(feeRecipient_ != address(0), "fee recipient zero");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        require(defaultTargetRaise_ >= VIRTUAL_ETH_DIVISOR, "target too small");
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        defaultTargetRaise = defaultTargetRaise_;
    }

    // ---------------------------------------------------------------------
    // Token creation
    // ---------------------------------------------------------------------

    /// @notice Launch a new meme token onto its own bonding curve.
    /// @param name   ERC20 name.
    /// @param symbol ERC20 symbol.
    /// @param uri    Off-chain metadata pointer (image, description, socials).
    /// @return token The address of the newly deployed token.
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata uri
    ) external nonReentrant returns (address token) {
        uint256 target = defaultTargetRaise;

        MemeToken meme = new MemeToken(name, symbol, TOTAL_SUPPLY, address(this), msg.sender, uri);
        token = address(meme);

        Pool storage p = _pools[token];
        p.token = token;
        p.creator = msg.sender;
        p.virtualEth = target / VIRTUAL_ETH_DIVISOR;
        p.virtualToken = INITIAL_VIRTUAL_TOKEN;
        p.ethReserve = 0;
        p.graduationTarget = target;
        p.createdAt = block.timestamp;

        _allTokens.push(token);

        emit TokenCreated(token, msg.sender, name, symbol, uri, target, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Buy tokens from the curve with ETH.
    /// @param token        The token to buy.
    /// @param minTokensOut Slippage guard: revert if fewer tokens would be received.
    /// @param deadline     Unix timestamp after which the trade reverts.
    function buy(
        address token,
        uint256 minTokensOut,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 tokensOut) {
        require(block.timestamp <= deadline, "expired");
        Pool storage p = _pools[token];
        require(p.token != address(0), "unknown token");
        require(!p.halted, "not tradable");
        require(msg.value > 0, "zero eth");

        // How much *net* ETH the curve can still absorb before graduating.
        uint256 remaining = p.graduationTarget - p.ethReserve;

        // Gross ETH (fee-inclusive) that yields `remaining` net after fee.
        uint256 grossCap = feeBps == 0
            ? remaining
            : Math.mulDiv(remaining, BPS, BPS - feeBps, Math.Rounding.Ceil);

        uint256 grossIn = msg.value;
        uint256 refund = 0;
        bool graduate = false;

        if (grossIn >= grossCap) {
            refund = grossIn - grossCap;
            grossIn = grossCap;
            graduate = true;
        }

        uint256 fee = Math.mulDiv(grossIn, feeBps, BPS);
        uint256 curveEth = grossIn - fee;
        if (graduate) {
            // Land exactly on the target regardless of rounding.
            curveEth = remaining;
            fee = grossIn - curveEth;
        }

        tokensOut = Math.mulDiv(p.virtualToken, curveEth, p.virtualEth + curveEth);

        // The curve must never sell into the reserved LP allocation.
        uint256 sellable = p.virtualToken - LP_TOKEN_RESERVE;
        if (tokensOut > sellable) {
            tokensOut = sellable;
        }
        require(tokensOut >= minTokensOut, "slippage");
        require(tokensOut > 0, "dust");

        // effects
        p.virtualEth += curveEth;
        p.virtualToken -= tokensOut;
        p.ethReserve += curveEth;
        accruedFees += fee;

        // interactions
        IERC20(token).safeTransfer(msg.sender, tokensOut);
        if (refund > 0) {
            _sendEth(msg.sender, refund);
        }

        emit Trade(
            token,
            msg.sender,
            true,
            curveEth,
            tokensOut,
            fee,
            p.virtualEth,
            p.virtualToken,
            p.ethReserve,
            block.timestamp
        );

        if (graduate) {
            _halt(token);
        }
    }

    /// @notice Sell tokens back to the curve for ETH.
    /// @param token     The token to sell.
    /// @param tokenIn   Amount of tokens to sell (must be approved to this contract).
    /// @param minEthOut Slippage guard: revert if less ETH would be received.
    /// @param deadline  Unix timestamp after which the trade reverts.
    function sell(
        address token,
        uint256 tokenIn,
        uint256 minEthOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 ethOut) {
        require(block.timestamp <= deadline, "expired");
        Pool storage p = _pools[token];
        require(p.token != address(0), "unknown token");
        require(!p.halted, "not tradable");
        require(tokenIn > 0, "zero tokens");

        uint256 grossEthOut = Math.mulDiv(p.virtualEth, tokenIn, p.virtualToken + tokenIn);
        require(grossEthOut > 0, "dust");
        require(grossEthOut <= p.ethReserve, "insufficient liquidity");

        uint256 fee = Math.mulDiv(grossEthOut, feeBps, BPS);
        ethOut = grossEthOut - fee;
        require(ethOut >= minEthOut, "slippage");

        // effects
        p.virtualEth -= grossEthOut;
        p.virtualToken += tokenIn;
        p.ethReserve -= grossEthOut;
        accruedFees += fee;

        // interactions
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenIn);
        _sendEth(msg.sender, ethOut);

        emit Trade(
            token,
            msg.sender,
            false,
            grossEthOut,
            tokenIn,
            fee,
            p.virtualEth,
            p.virtualToken,
            p.ethReserve,
            block.timestamp
        );
    }

    // ---------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------

    function _halt(address token) internal {
        Pool storage p = _pools[token];
        p.halted = true;
        emit Halted(token, p.ethReserve, block.timestamp);
        // Migrate immediately if a DEX router is configured; otherwise the pool
        // stays halted and awaits `finalizeGraduation` once the owner sets one.
        if (dexRouter != address(0)) {
            _finalize(token);
        }
    }

    /// @notice Migrate a halted pool's ETH + reserved tokens into the DEX.
    ///         Permissionless: anyone can trigger it once the pool has halted
    ///         and a router is configured. LP tokens are burned (locked).
    function finalizeGraduation(address token) external nonReentrant {
        _finalize(token);
    }

    function _finalize(address token) internal {
        Pool storage p = _pools[token];
        require(p.halted, "not halted");
        require(!p.graduated, "graduated");
        address router = dexRouter;
        require(router != address(0), "no router");

        p.graduated = true;

        uint256 ethLiquidity = p.ethReserve;
        p.ethReserve = 0;
        uint256 tokenLiquidity = IERC20(token).balanceOf(address(this));

        IERC20(token).forceApprove(router, tokenLiquidity);
        (, , uint256 lp) = IDexRouter(router).addLiquidityETH{value: ethLiquidity}(
            token,
            tokenLiquidity,
            0,
            0,
            DEAD,
            block.timestamp + 1 hours
        );
        // Clear any residual approval.
        IERC20(token).forceApprove(router, 0);

        emit Graduated(token, ethLiquidity, tokenLiquidity, lp, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Quotes & views
    // ---------------------------------------------------------------------

    /// @notice Net tokens received for `ethIn` wei (fee-inclusive input).
    function getBuyQuote(address token, uint256 ethIn) external view returns (uint256 tokensOut) {
        Pool storage p = _pools[token];
        require(p.token != address(0), "unknown token");
        if (p.halted || ethIn == 0) return 0;
        uint256 fee = Math.mulDiv(ethIn, feeBps, BPS);
        uint256 curveEth = ethIn - fee;
        tokensOut = Math.mulDiv(p.virtualToken, curveEth, p.virtualEth + curveEth);
        uint256 sellable = p.virtualToken - LP_TOKEN_RESERVE;
        if (tokensOut > sellable) tokensOut = sellable;
    }

    /// @notice Net ETH (wei) received for selling `tokenIn` tokens.
    function getSellQuote(address token, uint256 tokenIn) external view returns (uint256 ethOut) {
        Pool storage p = _pools[token];
        require(p.token != address(0), "unknown token");
        if (p.halted || tokenIn == 0) return 0;
        uint256 grossEthOut = Math.mulDiv(p.virtualEth, tokenIn, p.virtualToken + tokenIn);
        if (grossEthOut > p.ethReserve) grossEthOut = p.ethReserve;
        uint256 fee = Math.mulDiv(grossEthOut, feeBps, BPS);
        ethOut = grossEthOut - fee;
    }

    /// @notice Spot price in wei per whole (1e18) token.
    function currentPrice(address token) external view returns (uint256) {
        Pool storage p = _pools[token];
        require(p.token != address(0), "unknown token");
        return Math.mulDiv(p.virtualEth, 1e18, p.virtualToken);
    }

    function getPool(address token) external view returns (Pool memory) {
        return _pools[token];
    }

    function tokensCount() external view returns (uint256) {
        return _allTokens.length;
    }

    /// @notice Paginated list of launched token addresses, newest first.
    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = _allTokens.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        uint256 len = end - offset;
        page = new address[](len);
        // newest first
        for (uint256 i = 0; i < len; i++) {
            page[i] = _allTokens[n - 1 - offset - i];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setFee(uint256 newFeeBps, address newFeeRecipient) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "fee too high");
        require(newFeeRecipient != address(0), "fee recipient zero");
        feeBps = newFeeBps;
        feeRecipient = newFeeRecipient;
        emit FeeUpdated(newFeeBps, newFeeRecipient);
    }

    function setDexRouter(address router) external onlyOwner {
        dexRouter = router;
        emit DexRouterUpdated(router);
    }

    function setDefaultTargetRaise(uint256 target) external onlyOwner {
        require(target >= VIRTUAL_ETH_DIVISOR, "target too small");
        defaultTargetRaise = target;
        emit DefaultTargetRaiseUpdated(target);
    }

    function withdrawFees() external nonReentrant {
        uint256 amount = accruedFees;
        require(amount > 0, "nothing to withdraw");
        accruedFees = 0;
        _sendEth(feeRecipient, amount);
        emit FeesWithdrawn(feeRecipient, amount);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _sendEth(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "eth transfer failed");
    }
}
