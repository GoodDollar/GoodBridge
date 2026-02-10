/***
 * Script to set OFT adapter as operator on GoodDollarMinterBurner via DAO governance
 * 
 * This script must be run after deploying the OFT contracts.
 * It sets the GoodDollarOFTAdapter as an operator on GoodDollarMinterBurner,
 * which allows the adapter to mint and burn tokens for cross-chain transfers.
 * 
 * This operation requires DAO governance since MinterBurner is DAO-controlled.
 */

import { network, ethers } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import release from '../../release/deployment-oft.json';

const { name: networkName } = network;

export const setOFTOperator = async () => {
  const [root] = await ethers.getSigners();

  console.log('Setting OFT operator:', {
    networkName,
    root: root.address,
    balance: await ethers.provider.getBalance(root.address).then((_) => _.toString()),
  });

  // Get contract addresses from GoodProtocol deployment
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(
      `No GoodProtocol contracts found for network ${networkName}. Please check @gooddollar/goodprotocol/releases/deployment.json`,
    );
  }

  // Get Controller address directly from GoodProtocol contracts (or via NameService if needed)
  let controllerAddress = goodProtocolContracts.Controller;
  if (!controllerAddress) {
    // Fallback: try to get Controller via NameService interface
    const nameServiceAddress = goodProtocolContracts.NameService;
    if (!nameServiceAddress) {
      throw new Error(
        `NameService address not found in GoodProtocol deployment for network ${networkName}. Please deploy NameService first.`,
      );
    }
    const INameService = await ethers.getContractAt(
      '@gooddollar/goodprotocol/contracts/Interfaces.sol:INameService',
      nameServiceAddress,
    );
    controllerAddress = await INameService.getAddress('CONTROLLER');
    if (!controllerAddress || controllerAddress === ethers.constants.AddressZero) {
      throw new Error(`Controller address not found in GoodProtocol deployment for network ${networkName}`);
    }
  }

  // Get deployed contract addresses
  const currentRelease = release[networkName] || {};
  const minterBurnerAddress = currentRelease.GoodDollarMinterBurner;
  const oftAdapterAddress = currentRelease.GoodDollarOFTAdapter;

  if (!minterBurnerAddress) {
    throw new Error(
      `GoodDollarMinterBurner not found in deployment for network ${networkName}. Please deploy OFT contracts first.`,
    );
  }

  if (!oftAdapterAddress) {
    throw new Error(
      `GoodDollarOFTAdapter not found in deployment for network ${networkName}. Please deploy OFT contracts first.`,
    );
  }

  console.log('Contract addresses:', {
    MinterBurner: minterBurnerAddress,
    OFTAdapter: oftAdapterAddress,
  });

  // Get Controller and Avatar addresses
  const Controller = await ethers.getContractAt('Controller', controllerAddress);
  const avatarAddress = await Controller.avatar();

  if (!avatarAddress || avatarAddress === ethers.constants.AddressZero) {
    throw new Error(`Avatar address is invalid: ${avatarAddress}`);
  }

  // Get MinterBurner contract
  const MinterBurner = await ethers.getContractAt('GoodDollarMinterBurner', minterBurnerAddress);

  // Check if OFT adapter is already an operator
  const isOperator = await MinterBurner.operators(oftAdapterAddress);

  if (!isOperator) {
    console.log('Setting OFT adapter as operator on MinterBurner via DAO...');
    console.log(`  MinterBurner address: ${minterBurnerAddress}`);
    console.log(`  OFTAdapter address: ${oftAdapterAddress}`);

    // Encode the setOperator function call
    const setOperatorEncoded = MinterBurner.interface.encodeFunctionData('setOperator', [oftAdapterAddress, true]);

    // Execute via Controller/Avatar
    try {
      const tx = await Controller.genericCall(minterBurnerAddress, setOperatorEncoded, avatarAddress, 0);
      await tx.wait();
      console.log('✅ Successfully set OFT adapter as operator on MinterBurner');
      console.log('Transaction hash:', tx.hash);

      // Verify it was set
      const isOperatorAfter = await MinterBurner.operators(oftAdapterAddress);
      if (isOperatorAfter) {
        console.log('✅ Verified: OFT adapter is now an operator');
      } else {
        console.log('⚠️  Warning: Operator status not set. Please check the transaction.');
      }
    } catch (error: any) {
      console.error('❌ Error setting operator:');
      if (error.message) {
        console.error('Error message:', error.message);
      }
      if (error.reason) {
        console.error('Reason:', error.reason);
      }
      throw error;
    }
  } else {
    console.log('✅ OFT adapter is already an operator on MinterBurner');
  }

  console.log('\n=== Operator Setup Summary ===');
  console.log('Network:', networkName);
  console.log('GoodDollarMinterBurner:', minterBurnerAddress);
  console.log('GoodDollarOFTAdapter:', oftAdapterAddress);
  console.log('Operator Status:', isOperator ? 'Already set' : 'Set successfully');
  console.log('==============================\n');
};

export const main = async () => {
  await setOFTOperator();
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

