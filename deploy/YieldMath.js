const func = async function ({ deployments, getNamedAccounts, getChainId }) {
  const { deploy, execute, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId()

  const yieldMath = await deploy('YieldMath', {
    from: deployer,
    deterministicDeployment: true,
  })
  console.log(`Deployed YieldMath to ${yieldMath.address}`);
};

module.exports = func;
module.exports.tags = ["YieldMath"];
