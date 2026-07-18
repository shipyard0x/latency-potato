// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 *  PotatoTwapOracle — Uniswap V3 TWAP price source for LatencyPotato.
 *
 *  Reads the time-weighted average tick of the POTATO/WETH V3 pool over a
 *  configurable window (default 5 min) and converts it to "POTATO per 1 ETH"
 *  with 18 decimals — the format LatencyPotato.potatoRate() expects.
 *
 *  A TWAP over a meaningful window makes single-block price manipulation of
 *  the 5%-discount payment path economically unattractive, unlike a spot
 *  price or an owner-set rate.
 *
 *  UNAUDITED — audit before mainnet.
 */

interface IUniswapV3PoolMinimal {
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);

    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract PotatoTwapOracle {
    IUniswapV3PoolMinimal public immutable pool;
    address public immutable potato;
    address public immutable wethAddr;
    uint32 public immutable twapWindow; // seconds

    /// @dev true when POTATO is token0 in the pool (price math direction).
    bool private immutable potatoIsToken0;

    error BadWindow();
    error TokenNotInPool();

    constructor(address _pool, address _potato, address _weth, uint32 _window) {
        if (_window < 60 || _window > 1 days) revert BadWindow();
        pool = IUniswapV3PoolMinimal(_pool);
        potato = _potato;
        wethAddr = _weth;
        twapWindow = _window;

        address t0 = pool.token0();
        address t1 = pool.token1();
        if (t0 == _potato && t1 == _weth) potatoIsToken0 = true;
        else if (t0 == _weth && t1 == _potato) potatoIsToken0 = false;
        else revert TokenNotInPool();
    }

    /// @notice POTATO per 1 ETH, 18 decimals, averaged over `twapWindow`.
    function potatoPerEth() external view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = twapWindow;
        ago[1] = 0;
        (int56[] memory ticks, ) = pool.observe(ago);

        int56 delta = ticks[1] - ticks[0];
        int24 avgTick = int24(delta / int56(uint56(twapWindow)));
        // round toward negative infinity (Uniswap convention)
        if (delta < 0 && (delta % int56(uint56(twapWindow)) != 0)) avgTick--;

        // price(token1 per token0) = 1.0001^tick
        // If POTATO is token0: WETH-per-POTATO = 1.0001^tick,
        //   so POTATO-per-ETH = 1.0001^(-tick).
        // If POTATO is token1: POTATO-per-ETH = 1.0001^tick.
        int24 t = potatoIsToken0 ? -avgTick : avgTick;
        return _tickToPrice1e18(t);
    }

    /// @dev 1.0001^tick scaled to 1e18, via exponentiation by squaring on
    ///      Q128 fixed-point (same approach as Uniswap's TickMath, condensed).
    function _tickToPrice1e18(int24 tick) internal pure returns (uint256) {
        uint256 absTick = tick < 0 ? uint256(uint24(-tick)) : uint256(uint24(tick));
        require(absTick <= 887272, "tick range");

        uint256 ratio = absTick & 0x1 != 0
            ? 0xfffcb933bd6fad37aa2d162d1a594001
            : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick < 0) ratio = type(uint256).max / ratio;

        // ratio is Q128; scale to 1e18
        return (ratio * 1e18) >> 128;
    }
}
