import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import {constants} from '@yield-protocol/utils-v2'
import {CALCULATE_FROM_BASE} from '../src/constants'

import {PoolEstimator} from './shared/poolEstimator'
import {Pool} from '../typechain'
import {BaseMock as Base} from '../typechain/BaseMock'
import {FYTokenMock as FYToken} from '../typechain/FYTokenMock'
import {YieldSpaceEnvironment} from './shared/fixtures'

import {BigNumber, utils} from 'ethers'
import {ethers, waffle} from 'hardhat'
import {expect} from 'chai'

const {MAX128, USDC} = constants
const MAX = MAX128

const {parseUnits} = utils

const {loadFixture} = waffle

describe('Pool - lending allowances', async function () {
    this.timeout(0)

    const oneUSDC = BigNumber.from(parseUnits("1", 6))
    const bases = oneUSDC.mul(1_000_000)
    const OVERRIDES = {gasLimit: 1_000_000}

    let ownerAcc: SignerWithAddress
    let user1Acc: SignerWithAddress
    let user2Acc: SignerWithAddress
    let owner: string
    let user1: string
    let user2: string

    let yieldSpace: YieldSpaceEnvironment

    let pool: Pool
    let poolEstimator: PoolEstimator

    let base: Base
    let fyToken: FYToken
    let maturity: BigNumber

    const baseId = USDC
    const maturityId = '3M'
    const fyTokenId = baseId + '-' + maturityId

    async function fixture() {
        return await YieldSpaceEnvironment.setup(ownerAcc, [], [maturityId], BigNumber.from('0'))
    }

    before(async () => {
        const signers = await ethers.getSigners()
        ownerAcc = signers[0]
        owner = ownerAcc.address
        user1Acc = signers[1]
        user1 = user1Acc.address
        user2Acc = signers[2]
        user2 = user2Acc.address
    })

    beforeEach(async () => {
        yieldSpace = await loadFixture(fixture)
        base = yieldSpace.bases.get(baseId) as Base
        fyToken = yieldSpace.fyTokens.get(fyTokenId) as FYToken
        pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
        poolEstimator = await PoolEstimator.setup(pool)
        maturity = BigNumber.from(await fyToken.maturity())

        await base.mint(pool.address, bases)
        await pool.connect(user1Acc).mint(user1, CALCULATE_FROM_BASE, 0)
    })

    it('computes the fyToken allowances after fyToken sale', async () => {
        const availableFYTokensBefore = await pool.availableFYTokens();
        const availableToLendBefore = await pool.availableToLend();
        const fyTokenIn = oneUSDC

        await fyToken.mint(pool.address, fyTokenIn)

        await expect(pool.connect(user1Acc).sellFYToken(user2, 0))
            .to.emit(pool, 'Trade')
            .withArgs(maturity, user1, user2, await base.balanceOf(user2), fyTokenIn.mul(-1))

        const availableFYTokens = await pool.availableFYTokens();
        const availableToLend = await pool.availableToLend();

        expect(availableFYTokensBefore).to.be.lt(availableFYTokens)
        expect(availableToLendBefore).to.be.lt(availableToLend)

        expect(await pool.buyFYTokenPreview(availableFYTokens)).to.be.gt(0)
        expect(await pool.sellBasePreview(availableToLend)).to.be.gt(0)

        await expect(pool.buyFYTokenPreview(availableFYTokens.add(1))).to.be.revertedWith('Pool: fyToken balance too low')
        await expect(pool.sellBasePreview(availableToLend.add(1))).to.be.revertedWith('Pool: fyToken balance too low')
    })

    it('computes the fyToken allowances after base purchase', async () => {
        const availableFYTokensBefore = await pool.availableFYTokens();
        const availableToLendBefore = await pool.availableToLend();
        const fyTokenCachedBefore = (await pool.getCache())[1]
        const baseOut = oneUSDC

        const fyTokenInPreview = await pool.connect(user1Acc).buyBasePreview(baseOut)
        await fyToken.mint(pool.address, fyTokenInPreview)

        await expect(pool.connect(user1Acc).buyBase(user2, baseOut, MAX, OVERRIDES))
            .to.emit(pool, 'Trade')
            .withArgs(maturity, user1, user2, baseOut, (await pool.getCache())[1].sub(fyTokenCachedBefore).mul(-1))

        const availableFYTokens = await pool.availableFYTokens();
        const availableToLend = await pool.availableToLend();

        expect(availableFYTokensBefore).to.be.lt(availableFYTokens)
        expect(availableToLendBefore).to.be.lt(availableToLend)

        expect(await pool.buyFYTokenPreview(availableFYTokens)).to.be.gt(0)
        expect(await pool.sellBasePreview(availableToLend)).to.be.gt(0)

        await expect(pool.buyFYTokenPreview(availableFYTokens.add(1))).to.be.revertedWith('Pool: fyToken balance too low')
        // YieldMath is not 100% exact when calculating baseInForFYTokenOut, so some times is 2 cents off, but on the safe side
        await expect(pool.sellBasePreview(availableToLend.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
    })

    describe('with extra fyToken balance', () => {
        beforeEach(async () => {
            const additionalFYTokenBalance = oneUSDC.mul(30)
            await fyToken.mint(pool.address, additionalFYTokenBalance)
            await pool.sellFYToken(owner, 0)
        })

        it('computes the fyToken allowances after base sale', async () => {
            const baseIn = oneUSDC
            const availableFYTokensBefore = await pool.availableFYTokens();
            const availableToLendBefore = await pool.availableToLend();

            await base.mint(pool.address, baseIn)

            await expect(pool.connect(user1Acc).sellBase(user2, 0, OVERRIDES))
                .to.emit(pool, 'Trade')
                .withArgs(maturity, user1, user2, baseIn.mul(-1), await fyToken.balanceOf(user2))

            const availableFYTokens = await pool.availableFYTokens();
            const availableToLend = await pool.availableToLend();

            expect(availableFYTokensBefore).to.be.gt(availableFYTokens)
            expect(availableToLendBefore).to.be.gt(availableToLend)

            expect(await pool.buyFYTokenPreview(availableFYTokens)).to.be.gt(0)
            expect(await pool.sellBasePreview(availableToLend)).to.be.gt(0)

            await expect(pool.buyFYTokenPreview(availableFYTokens.add(1))).to.be.revertedWith('Pool: fyToken balance too low')
            // YieldMath is not 100% exact when calculating baseInForFYTokenOut, so some times is 2 cents off, but on the safe side
            await expect(pool.sellBasePreview(availableToLend.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
        })

        it('computes the fyToken allowances after fyToken purchase', async () => {
            const availableFYTokensBefore = await pool.availableFYTokens();
            const availableToLendBefore = await pool.availableToLend();
            const baseCachedBefore = (await pool.getCache())[0]
            const fyTokenOut = oneUSDC

            const baseInPreview = await pool.buyFYTokenPreview(fyTokenOut)
            await base.mint(pool.address, baseInPreview)

            await expect(pool.connect(user1Acc).buyFYToken(user2, fyTokenOut, MAX, OVERRIDES))
                .to.emit(pool, 'Trade')
                .withArgs(maturity, user1, user2, (await pool.getCache())[0].sub(baseCachedBefore).mul(-1), fyTokenOut)

            const availableFYTokens = await pool.availableFYTokens();
            const availableToLend = await pool.availableToLend();

            expect(availableFYTokensBefore).to.be.gt(availableFYTokens)
            expect(availableToLendBefore).to.be.gt(availableToLend)

            expect(await pool.buyFYTokenPreview(availableFYTokens)).to.be.gt(0)
            expect(await pool.sellBasePreview(availableToLend)).to.be.gt(0)

            await expect(pool.buyFYTokenPreview(availableFYTokens.add(1))).to.be.revertedWith('Pool: fyToken balance too low')
            // YieldMath is not 100% exact when calculating baseInForFYTokenOut, so some times is 2 cents off, but on the safe side
            await expect(pool.sellBasePreview(availableToLend.add(2))).to.be.revertedWith('Pool: fyToken balance too low')
        })
    })
})
