const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, execute, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId()

  daiAddress = (await get('DaiMock')).address;
  fyDaiAddress = (await get('FYDaiMock')).address;
  yieldMathAddress = (await get('YieldMath')).address;

  const pool = await deploy('Pool', {
    from: deployer,
    deterministicDeployment: true,
    args: [daiAddress, fyDaiAddress, "Pool", "LP"],
    libraries: { YieldMath: yieldMathAddress}
  })
  console.log(`Deployed Pool to ${pool.address}`);
};

module.exports = func;
module.exports.tags = ["Pool"];
module.exports.dependencies = ["DaiMock", "FYDaiMock", "YieldMath"]