import "@nomiclabs/hardhat-truffle5";
import "solidity-coverage";
import "hardhat-gas-reporter";

export default {
    defaultNetwork: "hardhat",
    solidity: {
        version: "0.7.5",
        settings: {
            optimizer: {
                enabled: true,
                runs: 20000
            },
        },
    },
    gasReporter: {
        enabled: true
    },
    paths: {
        artifacts: "./build",
        coverage: "./coverage",
        coverageJson: "./coverage.json",
    },
    networks: {
        coverage: {
            url: "http://127.0.0.1:8555",
        },
    },
};
