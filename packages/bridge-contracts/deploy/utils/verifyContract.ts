import { HardhatRuntimeEnvironment } from 'hardhat/types';

/**
 * Verify a contract on block explorer (Etherscan, etc.)
 * 
 * @param hre Hardhat runtime environment
 * @param contractAddress The address of the contract to verify
 * @param constructorArgs Optional constructor arguments array
 * @param contractName Optional contract name for logging
 * @returns Promise that resolves when verification is complete
 */
export async function verifyContract(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  constructorArgs: any[] = [],
  contractName?: string,
): Promise<void> {
  const networkName = hre.network.name;
  const displayName = contractName || contractAddress;

  // Skip verification for local networks
  if (['hardhat', 'localhost', 'develop'].includes(networkName)) {
    console.log(`ℹ️  Skipping verification for ${displayName} on local network: ${networkName}`);
    return;
  }

  console.log(`\n🔍 Verifying ${displayName}...`);
  console.log(`   Address: ${contractAddress}`);
  if (constructorArgs.length > 0) {
    console.log(`   Constructor args: ${JSON.stringify(constructorArgs)}`);
  }

  try {
    await hre.run('verify:verify', {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });
    console.log(`✅ ${displayName} verified successfully`);
  } catch (error: any) {
    const errorMessage = error.message || error.toString() || '';
    
    if (errorMessage.includes('Already Verified') || errorMessage.includes('already verified')) {
      console.log(`ℹ️  ${displayName} already verified`);
    } else {
      console.log(`⚠️  ${displayName} verification error: ${errorMessage}`);
      console.log(`   You can verify manually using:`);
      if (constructorArgs.length > 0) {
        console.log(`   npx hardhat verify --network ${networkName} ${contractAddress} ${constructorArgs.join(' ')}`);
      } else {
        console.log(`   npx hardhat verify --network ${networkName} ${contractAddress}`);
      }
    }
  }
}

/**
 * Verify multiple contracts in sequence
 * 
 * @param hre Hardhat runtime environment
 * @param contracts Array of contract verification configs
 */
export async function verifyContracts(
  hre: HardhatRuntimeEnvironment,
  contracts: Array<{
    address: string;
    constructorArgs?: any[];
    name?: string;
  }>,
): Promise<void> {
  console.log(`\n=== Starting Contract Verification (${contracts.length} contracts) ===`);
  
  for (const contract of contracts) {
    await verifyContract(
      hre,
      contract.address,
      contract.constructorArgs || [],
      contract.name,
    );
  }
  
  // Also verify on Sourcify
  console.log('\n🔍 Verifying on Sourcify...');
  try {
    await hre.run('sourcify');
    console.log('✅ Sourcify verification completed');
  } catch (error: any) {
    console.log('⚠️  Sourcify verification error:', error.message || error.toString());
  }
  
  console.log('=== Contract Verification Complete ===\n');
}

