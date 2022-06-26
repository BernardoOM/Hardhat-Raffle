const { assert, expect } = require("chai")
const { network, getNamedAccounts, ethers, deployments } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture("all")
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("Initializes the raffle correctly", async function () {
                  //Ideally we make our tests have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered")
              })
              it("doesn't allow entrance of a new player when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) //para hacer que el checkUpkeep() retorne true
                  await network.provider.send("evm_mine", []) //para minar un block extra
                  //await network.provider.request({ method: "evm_mine", params: [] })//hace lo mismo que lo anterior.
                  //Como todas las condicones de checkUpkeep() se cumplen, entonces podemos pretender ser el Chainlink Keeper.
                  await raffle.performUpkeep([]) //"0x"
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([]) // el callStatic me permite simular una transaccion..
                  assert(!upKeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x") //otra forma de enviar un objeto bytes vacio es con un string de 0x, porque hardhat es capaz de saberlo convertir en bytes vacio
                  const raffleState = await raffle.getRaffleState()
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upKeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(!upKeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(upKeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it can only run if checkupKeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts when checkupKeep is false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle__UpKeepNotNeeded"
                  ) /* se puede ser mas especifico pasando los parametros del error haciendo interpolacion de string `Raffle__UpKeepNotNeeded(raffle.address.balance, s_players.length, uint256(s_raffleState))`*/
              })
              it("update de raffle state, emits an event, and calls the vrfCoordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId // es events[1] porque el evento emitido en VRFCoordinatorV2Mock es el segundo parametro.
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("it can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, resets the lottery, and sends money", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // since deployer = 0
                  const accounts = await ethers.getSigners()
                  //conectamos 3 players adicionales al raffle, teniendo un total de 4 (siendo el deployer del contrato el primero)
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }

                  const startingTimeStamp = await raffle.getLatesTimeStamp()
                  //permormUpKeep(mock being chainlink keepers)
                  // fulfillRandomWords(mock being the chainlink VRF)
                  //we will have to wait for the fulfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      //cuando el evento WinnerPicked suceda
                      raffle.once("WinnerPicked", async () => {
                          //si tarda mas de 300 segundos, entonces falla.
                          console.log("We found the winner event!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const numberPlayers = await raffle.getNumberOfPlayers()
                              const endingTimeStamp = await raffle.getLatesTimeStamp()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              //----------------------------------
                              //   console.log(recentWinner)
                              //   console.log(accounts[2].address)
                              //   console.log(accounts[0].address)
                              //   console.log(accounts[1].address)
                              //   console.log(accounts[3].address)
                              assert.equal(numberPlayers.toNumber(), 0)
                              assert.equal(raffleState, 0)
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStatingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      //setting up the listener
                      // bellow, we will fire the event, and the listener will pick it up, and resolve
                      //unicamente por ser un test local se escribe el siguiente codigo, pero al hacer una prueba con un testnet real, no se hace porque debemos esperar que el chainlink Node se encargue de ejecutar performUpkeep() y fulfillRandomWords() automaticamente.
                      const txResponse = await raffle.performUpkeep("0x")
                      const txReceipt = await txResponse.wait(1)
                      const winnerStatingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
