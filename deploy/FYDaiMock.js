

const dates = ['2020-12-31', '2021-03-31', '2021-06-30', '2021-09-30', '2021-12-31']
const toTimestamp = (date) => new Date(date).getTime() / 1000 + 86399
const maturities = dates.map(toTimestamp)

const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, get, read, execute } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = await getChainId()

  if (chainId === '31337') {
    const daiMockAddress = (await get('DaiMock')).address

    const fyDaiMock = await deploy('FYDaiMock', {
      from: deployer,
      deterministicDeployment: true,
      args: [daiMockAddress, maturities[1]]
    })

    console.log(`Deployed FYDaiMock to ${fyDaiMock.address}`)
  }
}

module.exports = func
module.exports.tags = ["FYDaiMock"]
module.exports.dependencies = ["DaiMock"]