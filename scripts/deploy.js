/**
 * Deploy + wire the Latency Potato stack on Robinhood Chain mainnet.
 *
 *   npx hardhat run scripts/deploy.js --network robinhood
 *
 * Two modes:
 *   LAUNCHPAD MODE (recommended): set TOKEN_CA in .env to your launchpad
 *   token's contract address. Deploys ONLY the game and wires it to that CA.
 *
 *   FULL MODE: leave TOKEN_CA empty. Deploys our PotatoToken (tax + permit)
 *   plus the game, and wires them together.
 *
 * Required env: PRIVATE_KEY, PROTOCOL_TREASURY, DEV_TREASURY
 * Optional env: TOKEN_CA, POTATO_PER_ETH (default 1M/ETH), RPC_URL
 */
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const protocol = process.env.PROTOCOL_TREASURY || deployer.address;
  const dev = process.env.DEV_TREASURY || deployer.address;
  const rate = process.env.POTATO_PER_ETH
    ? BigInt(process.env.POTATO_PER_ETH)
    : ethers.parseEther('1000000');
  const tokenCa = process.env.TOKEN_CA;

  console.log('deployer:', deployer.address);
  console.log('balance :', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');

  const game = await (await ethers.getContractFactory('LatencyPotato'))
    .deploy(protocol, dev);
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log('LatencyPotato:', gameAddr);

  let tokenAddr;
  if (tokenCa && tokenCa !== '') {
    tokenAddr = tokenCa;
    console.log('launchpad mode — using existing token CA:', tokenCa);
  } else {
    const token = await (await ethers.getContractFactory('PotatoToken')).deploy();
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();
    console.log('PotatoToken:  ', tokenAddr);
    await (await token.setGameContract(gameAddr)).wait();
  }

  await (await game.setPotatoToken(tokenAddr)).wait();
  await (await game.setPotatoPerEth(rate)).wait();
  console.log('wired ✔  fallback rate:', rate.toString(), 'POTATO/ETH');

  console.log(`
=== PASTE THESE ===
GAME_ADDRESS  = ${gameAddr}
TOKEN_ADDRESS = ${tokenAddr}

-> frontend/src/config.js  (GAME_ADDRESS, TOKEN_ADDRESS)
-> bot/.env                (GAME_ADDRESS)

later, once a real DEX pool exists:
  - deploy PotatoTwapOracle(pool, token, weth, 300); game.setOracle(it)
  - game.setSwapRouter(router, weth) to enable harvestSidepot()`);
}

main().catch((e) => { console.error(e); process.exit(1); });
