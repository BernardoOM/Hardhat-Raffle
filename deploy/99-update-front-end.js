const { ethers, network } = require("hardhat")
const { fs } = require("file-system")

const FRONT_END_ADDRESSES_FILE = "../nextjs-smartcontract-lottery/constants/contractAddress.json"

const FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery/constants/abi.json"

module.exports = async () => {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Writing to front end...")
        updateContractAddresses()
        updateAbi()
        console.log("Front end written!")
    }
}

async function updateAbi() {
    const raffle = await ethers.getContract("Raffle")
    fs.writeFileSync(FRONT_END_ABI_FILE, raffle.interface.format(ethers.utils.FormatTypes.json))
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle")
    const contractAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"))
    if (network.config.chainId.toString() in contractAddresses) {
        if (!contractAddresses[network.config.chainId.toString()].includes(raffle.address)) {
            contractAddresses[network.config.chainId.toString()].push(raffle.address)
        }
    } else {
        contractAddresses[network.config.chainId.toString()] = [raffle.address]
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(contractAddresses))
}
module.exports.tags = ["all", "frontend"]
