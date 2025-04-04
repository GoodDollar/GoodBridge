import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-verify';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-deploy';
import { HttpNetworkAccountsConfig } from 'hardhat/types';
import { configDotenv } from 'dotenv';

configDotenv();

const pkey = process.env.PRIVATE_KEY;
const mnemonic = process.env.MNEMONIC;

let accounts: unknown = 'remote';
if (pkey) {
  accounts = [pkey];
} else if (mnemonic) {
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
        runs: 0,
      },
    },
  },
  networks: {
    develop: {
      chainId: 4447,
      url: 'http://localhost:8545',
    },
    mainnet: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 1,
      url: 'https://rpc.ankr.com/eth',
      gasPrice: 5e9,
    },
    fuse: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 122,
      url: 'https://rpc.fuse.io',
    },
    fuse_testnet: {
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
      verify: {
        etherscan: {
          apiUrl: 'https://api.celoscan.io',
          apiKey: process.env.CELOSCAN_KEY,
        },
      },
    },
    celo_testnet: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 42220,
      url: 'https://forno.celo.org',
      verify: {
        etherscan: {
          apiUrl: 'https://api.celoscan.io',
          apiKey: process.env.CELOSCAN_KEY,
        },
      },
    },
    alfajores: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 44787,
      url: `https://alfajores-forno.celo-testnet.org`,
      gasPrice: 5000000000,
      verify: {
        etherscan: {
          apiUrl: 'https://alfajores.celoscan.io',
          apiKey: process.env.CELOSCAN_KEY,
        },
      },
    },
    goerli: {
      accounts: accounts as HttpNetworkAccountsConfig,
      url: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      gas: 3000000,
      gasPrice: 2e9,
      chainId: 5,
    },
  },
  sourcify: {
    enabled: true,
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_KEY,
    },
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_KEY || '',
      mainnet: process.env.ETHERSCAN_KEY || '',
      celo: process.env.CELOSCAN_KEY || '',
      fuse: 'x',
    },
    customChains: [
      {
        chainId: 42220,
        network: 'celo',
        urls: {
          apiURL: 'https://api.celoscan.io/api',
          browserURL: 'https://celoscan.io',
        },
      },
      {
        chainId: 122,
        network: 'fuse',
        urls: {
          apiURL: '',
          browserURL: 'https://explorer.celo.org',
        },
      },
    ],
  },
  contractSizer: {
    runOnCompile: true,
  },
};

export default config;
