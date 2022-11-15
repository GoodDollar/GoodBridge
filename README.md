# Bridge app based on block header proofs

The repository contains two packages:

- bridge-app
  - App/Docker to run by validators to submit signed block hashes to the registry on Fuse
  - SDK to submit signed blocks and execute receipt proofs
- bridge-contracts
  - blockRegistry - a smart contract that emit events when Fuse validators submit signed block hashes
  - bridge - Smart contracts for building generic bridges using block header proofs
