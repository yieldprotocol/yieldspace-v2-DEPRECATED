const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, execute, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId()

  const safeERC20Namer = await deploy('SafeERC20Namer', {
    from: deployer,
    deterministicDeployment: true,
  })
  console.log(`Deployed SafeERC20Namer to ${safeERC20Namer.address}`);
};

module.exports = func;
module.exports.tags = ["SafeERC20Namer"];
