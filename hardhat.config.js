require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require('hardhat/builtin-tasks/task-names');

// Offline environment: use the locally installed solc-js instead of
// downloading a compiler binary.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === '0.8.28') {
    return {
      compilerPath: require.resolve('solc/soljson.js'),
      isSolcJs: true,
      version: '0.8.28',
      longVersion: '0.8.28+local',
    };
  }
  return runSuper(args);
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    robinhood: {
      url: process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
      chainId: 4663,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
