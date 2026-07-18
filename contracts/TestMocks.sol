// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Holder that reverts on plain ETH receive — used to prove the game
///      escrows instead of bricking.
contract RevertingReceiver {
    bool public accept;
    function setAccept(bool a) external { accept = a; }
    function take(address game, uint256 price) external payable {
        (bool ok, ) = game.call{value: price}(abi.encodeWithSignature("takePotato()"));
        require(ok, "take failed");
    }
    function withdrawFrom(address game) external {
        (bool ok, ) = game.call(abi.encodeWithSignature("withdraw()"));
        require(ok, "withdraw failed");
    }
    receive() external payable { require(accept, "nope"); }
}

/// @dev Fake V2 router: pulls tokens, pays a fixed ETH amount.
contract MockRouter {
    uint256 public ethOut;
    function setEthOut(uint256 e) external { ethOut = e; }
    function swapExactTokensForETH(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path,
        address to, uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        require(ethOut >= amountOutMin, "slippage");
        (bool ok, ) = to.call{value: ethOut}("");
        require(ok, "eth send failed");
        amounts = new uint256[](2);
        amounts[0] = amountIn; amounts[1] = ethOut;
    }
    receive() external payable {}
}

/// @dev Fixed-rate oracle stub.
contract MockOracle {
    uint256 public potatoPerEth;
    constructor(uint256 r) { potatoPerEth = r; }
    function set(uint256 r) external { potatoPerEth = r; }
}
