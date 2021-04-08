import { YieldSpaceEnvironment } from '../test/shared/fixtures'
import { ethers, waffle } from 'hardhat'
import { Cauldron } from '../typechain/Cauldron'
import { BigNumber } from 'ethers'
import { Pool } from '../typechain/Pool'
import { FYToken } from '../typechain/FYToken'
import { Ladle } from '../typechain/Ladle'

/**
 * 
 * README: 
 * 
 * 
    npx hardhat run ./scripts/devEnv.ts --network localhost
 *
 */

const { loadFixture } = waffle

const CAULDRON_ADDR='0xa513E6E4b8f2a923D98304ec87F64353C4D5C853'
const LADLE_ADDR='0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6'

/* Update the available series based on Cauldron events */
const getSeriesInfo = async (): Promise<string[]> => {
    const cauldron: Cauldron = (await ethers.getContractAt('Cauldron', CAULDRON_ADDR ) as unknown) as Cauldron; 
    /* get both serieAdded events */
    const seriesAddedEvents = await cauldron.queryFilter('SeriesAdded' as any);
    /* Get the seriesId */
    return Promise.all(
        seriesAddedEvents.map(async (x:any) : Promise<string> => {
            const { seriesId: id, baseId, fyToken } = cauldron.interface.parseLog(x).args;
             return fyToken;
            }
        )
    )
}

const linkPool = async (pool: Pool) => {
    const [ ownerAcc ] = await ethers.getSigners();
    const ladle = await ethers.getContractAt('Ladle', LADLE_ADDR, ownerAcc);
    const fyToken = (await ethers.getContractAt('FYToken', await pool.fyToken()) as unknown) as FYToken;
    const seriesId = await fyToken.name()
    ladle.addPool(seriesId, pool.address)
}

async function fixture() {
    const [ ownerAcc ] = await ethers.getSigners();
    const seriesList = await getSeriesInfo();
    return await YieldSpaceEnvironment.setup(
        ownerAcc,[],[], BigNumber.from('0'),
        seriesList
        )
}

loadFixture(fixture)
.then((env:YieldSpaceEnvironment)  => {
    console.log('Pools:')
    env.pools.forEach((value:any, key:any)=>{    
        value.forEach((v:any,k:any) => {
            /* connect pool to series in ladle */
            linkPool(v);
            console.log(`"${k}" : "${v.address}",`)
        })   
    })   
});