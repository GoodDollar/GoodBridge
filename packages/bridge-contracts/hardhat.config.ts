import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import 'solidity-coverage';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-deploy';
import { HttpNetworkAccountsConfig } from 'hardhat/types';
import { configDotenv } from 'dotenv';
import * as envEnc from '@chainlink/env-enc';

import '@layerzerolabs/toolbox-hardhat';
import { EndpointId } from '@layerzerolabs/lz-definitions';

import './scripts/oft/configure-oft';

configDotenv();
envEnc.config();

const pkey = process.argv.find((_) => _.includes('testnet') || _.includes('staging'))
  ? process.env.DEV_KEY
  : process.env.PRIVATE_KEY;
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
    compilers: [
      {
        version: '0.8.22',
        settings: {
          optimizer: {
            enabled: true,
            runs: 0,
          },
        },
      },
      {
        version: '0.8.10',
        settings: {
          optimizer: {
            enabled: true,
            runs: 0,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    develop: {
      chainId: 4447,
      url: 'http://localhost:8545',
    },
    mainnet: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 1,
      url: 'https://eth.drpc.org',
      gasPrice: 8e8,
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
    },
    celo_testnet: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 42220,
      url: 'https://forno.celo.org',
    },
    xdc: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 50,
      url: 'https://rpc.ankr.com/xdc',
      // url: 'http://localhost:8545',
    },
    xdc_testnet: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 50,
      url: 'https://rpc.ankr.com/xdc',
      // url: 'http://localhost:8545',
    },
    alfajores: {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 44787,
      url: `https://alfajores-forno.celo-testnet.org`,
      gasPrice: 5000000000,
    },
    goerli: {
      accounts: accounts as HttpNetworkAccountsConfig,
      url: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      gas: 3000000,
      gasPrice: 2e9,
      chainId: 5,
    },
    'development-celo': {
      accounts: accounts as HttpNetworkAccountsConfig,
      url: 'https://forno.celo.org',
      gas: 3000000,
      gasPrice: 26e9,
      chainId: 42220,
      eid: EndpointId.CELO_V2_MAINNET,
    } as any,
    'production-celo': {
      accounts: accounts as HttpNetworkAccountsConfig,
      url: 'https://forno.celo.org',
      gas: 8000000,
      gasPrice: 26e9,
      chainId: 42220,
    },
    'production-xdc': {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 50,
      url: 'https://rpc.xdc.org',
    },
    'development-xdc': {
      accounts: accounts as HttpNetworkAccountsConfig,
      chainId: 50,
      url: 'https://rpc.xdc.org',
      eid: EndpointId.XDC_V2_MAINNET,
    } as any,
  },
  sourcify: {
    enabled: false,
  },
  etherscan: {
    enabled: true,
    apiKey: process.env.ETHERSCAN_API_KEY || '',
    customChains: [
      {
        chainId: 42220,
        network: 'celo',
        urls: {
          apiURL: 'https://api.blockscout.com/122/api',
          browserURL: 'https://celoscan.io',
        },
      },
      {
        network: 'xdc',
        chainId: 50,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=50',
          browserURL: 'https://xdcscan.com/',
        },
      },
    ],
  },
  blockscout: {
    enabled: true,
    customChains: [
      {
        chainId: 122,
        network: 'fuse',
        urls: {
          apiURL: 'https://explorer.fuse.io/api',
          browserURL: 'https://explorer.fuse.io',
        },
      },
    ],
  },
  contractSizer: {
    runOnCompile: true,
  },
  namedAccounts: {
    deployer: {
      default: 0, // Use the first account as deployer
    },
  },
  // hardhat-deploy configuration
  // This ensures LayerZero DevTools can detect hardhat-deploy usage
  paths: {
    deployments: 'deployments',
  },
};

export default config;
