// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title MemeToken
/// @notice A fixed-supply ERC20 meme token. The entire supply is minted to the
///         Launchpad at deployment; the Launchpad sells it out along a bonding
///         curve and seeds the remainder as DEX liquidity on graduation.
/// @dev    No mint function exists after construction, so supply is immutable.
///         `ERC20Burnable` lets holders voluntarily burn their own tokens.
contract MemeToken is ERC20, ERC20Burnable {
    /// @notice The launchpad that created and initially holds this token.
    address public immutable launchpad;

    /// @notice The account that requested the token launch.
    address public immutable creator;

    /// @notice Off-chain metadata pointer (JSON with image, description, socials).
    string public tokenURI;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address launchpad_,
        address creator_,
        string memory uri_
    ) ERC20(name_, symbol_) {
        launchpad = launchpad_;
        creator = creator_;
        tokenURI = uri_;
        _mint(launchpad_, supply_);
    }
}
