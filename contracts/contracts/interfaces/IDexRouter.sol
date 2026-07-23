// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDexRouter
/// @notice Minimal Uniswap V2-style router interface used at graduation to seed
///         the liquidity pool. Robinhood Chain's canonical DEX router address is
///         set by the launchpad owner via `setDexRouter` once known, so this
///         interface is intentionally small and DEX-agnostic.
interface IDexRouter {
    function factory() external view returns (address);

    function WETH() external view returns (address);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}
