const fixed_addrs = require('./fixed_addrs.json')

const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, execute, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId()

  yieldMathAddress = (await get('YieldMath')).address;

  if (chainId === '31337') {
    daiAddress = (await get('DaiMock')).address;
    fyDaiAddress = (await get('FYDaiMock')).address;

    const pool = await deploy('Pool', {
      from: deployer,
      deterministicDeployment: true,
      args: [daiAddress, fyDaiAddress, "Pool", "LP"],
      libraries: { YieldMath: yieldMathAddress}
    })
    console.log(`Deployed Pool to ${pool.address}`);
  } else if (chainId === '42') {
    daiAddress = fixed_addrs[chainId].daiAddress

    for (let name in fixed_addrs[chainId]) {
      if (!name.includes('fyDai')) continue
      poolSymbol = name.replace('Address', '').replace('fyDai', 'fyDaiLP')
  
      const pool = await deploy('Pool', {
        from: deployer,
        deterministicDeployment: true,
        args: [daiAddress, fixed_addrs[chainId][name], poolSymbol, poolSymbol], // TODO: Derive pool name
        libraries: { YieldMath: yieldMathAddress}
      })
      console.log(`Deployed ${poolSymbol} Pool to ${pool.address}`);
    }
  }
};

module.exports = func;
module.exports.tags = ["Pool"];
module.exports.dependencies = ["DaiMock", "FYDaiMock", "YieldMath"]