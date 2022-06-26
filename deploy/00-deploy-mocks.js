const { developmentChains } = require("../helper-hardhat-config")

const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 is the premium. It costs 0.25 LINK per request
const GAS_PRICE_LINK = 1e9 //1000000000 Link per gas. Calculated value based on the gas price of the chain. Chainlink nodes pay the gas fees to give us randomness & do external execution, so their price of requests change based on the price of gas

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId //network.name
    //developmentChains.includes(network.name)
    if (chainId == 31337) {
        log("Local network detected! Deploying mocks...")
        //deploy a mock vrfcoordinator
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: [BASE_FEE, GAS_PRICE_LINK],
            log: true,
        })
        log("Mocks Deployed!")
        log("---------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
