module.exports = {
  istanbulReporter: ['html', 'text'],
  skipFiles: ['test', 'utils/MPT.sol', 'utils/RLPReader.sol'],
  mocha: {
    grep: '@skip-on-coverage', // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
};
