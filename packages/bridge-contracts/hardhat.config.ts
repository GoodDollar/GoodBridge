import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@openzeppelin/hardhat-upgrades';

import { HttpNetworkAccountsConfig } from 'hardhat/types';

const pkey = process.env.PRIVATE_KEY;
const mnemonic = process.env.MNEMONIC;

let accounts: unknown = 'remote';
if (pkey) {
  accounts = [pkey];
}
if (mnemonic) {
  accounts = { mnemonic };
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.10',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    develop: {
      chainId: 4447,
      url: 'http://localhost:8545',
    },
    fuse: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 122,
      url: 'https://rpc.fuse.io',
    },
    staging: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 122,
      url: 'https://rpc.fuse.io',
    },
    production: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 122,
      url: 'https://rpc.fuse.io',
    },
    celo: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 42220,
      url: 'https://forno.celo.org',
    },
  },
  contractSizer: {
    runOnCompile: true,
  },
};

export default config;
