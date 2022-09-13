import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import '@typechain/hardhat'
import "solidity-coverage"
import "hardhat-gas-reporter"



// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: "0.8.10",
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,      
    },
    "develop": {
      chainId: 4447,
      url: "http://localhost:8545",      
    },
    "fuse": {
      chainId: 122,
      url: "https://rpc.fuse.io",      
    }
    
  }
};

export default config;
