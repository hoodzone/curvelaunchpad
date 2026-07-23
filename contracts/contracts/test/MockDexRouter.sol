// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal stand-in for a Uniswap V2-style router, used only in tests
///         to verify the graduation flow (pulls tokens + ETH, mints fake LP).
contract MockDexRouter {
    address public immutable weth;

    event LiquidityAdded(address token, uint256 amountToken, uint256 amountETH, address to);

    constructor(address weth_) {
        weth = weth_;
    }

    function WETH() external view returns (address) {
        return weth;
    }

    function factory() external view returns (address) {
        return address(this);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256, /* amountTokenMin */
        uint256, /* amountETHMin */
        address to,
        uint256 /* deadline */
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        emit LiquidityAdded(token, amountTokenDesired, msg.value, to);
        return (amountTokenDesired, msg.value, amountTokenDesired);
    }
}
