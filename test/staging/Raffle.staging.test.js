const { assert, expect } = require("chai")
const { network, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleEntranceFee, deployer
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("it works with live Chainlink Keeper and Chainlink VRF, we get a random winner", async function () {
                  //enter the raffle
                  const startingTimeStamp = await raffle.getLatesTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      //setup listener before we enter the raffle
                      //just in case the blockchain moves REALLY fast
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event detected")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatesTimeStamp()
                              //asserts and expect
                              console.log("Checking empty players array")
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              console.log("Checking winner")
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              console.log("Checking Raffle state")
                              assert.equal(raffleState, 0)
                              console.log("Checking winner balances")
                              console.log(`Winner is ${recentWinner}`)
                              console.log(`Pre balance is ${winnerPreBalance}`)
                              console.log(`Starting balance is ${winnerStartingBalance}`)
                              console.log(`Ending balance is ${winnerEndingBalance}`)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              )
                              console.log("Checking timestamps")
                              assert(endingTimeStamp > startingTimeStamp)
                              console.log("Resolving promise")
                              resolve()
                              console.log("After method resolve()???")
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      //then entering the raffle
                      console.log("Entering Raffle...")
                      const winnerPreBalance = await accounts[0].getBalance()
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("Awaiting winner via WinnerPicked event...")
                      const winnerStartingBalance = await accounts[0].getBalance()
                      //and this code WON'T complete until our listener has finished listening!
                  })
              })
          })
      })
