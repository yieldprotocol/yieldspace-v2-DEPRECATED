const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, execute, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId()

  safeERC20NamerAddress = (await get('SafeERC20Namer')).address;
  yieldMathAddress = (await get('YieldMath')).address;

  const poolFactory = await deploy('PoolFactory', {
    from: deployer,
    deterministicDeployment: true,
    libraries: {
      YieldMath: yieldMathAddress,
      SafeERC20Namer: safeERC20NamerAddress
    }
  })
  console.log(`Deployed PoolFactory to ${poolFactory.address}`);
};

module.exports = func;
module.exports.tags = ["PoolFactory"];
module.exports.dependencies = ["YieldMath", "SafeERC20Namer"]