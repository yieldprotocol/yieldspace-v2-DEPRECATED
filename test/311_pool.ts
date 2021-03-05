import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { YieldMath } from '../typechain/YieldMath'
import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Dai } from '../typechain/DaiMock'
import { FYDaiMock as FYDai } from '../typechain/FYDaiMock'
import { SafeERC20Namer } from '../typechain/SafeERC20Namer'

import { BigNumber } from 'ethers'

import { ethers } from 'hardhat'
import { expect } from 'chai'

const timeMachine = require('ether-time-traveler')

const PRECISION = BigNumber.from('100000000000000') // 1e14

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0)    // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

const { floor } = require('mathjs')
import { mint, mintWithDai, burn, burnForDai, sellDai, sellFYDai, buyDai, buyFYDai } from './shared/yieldspace'
const WAD = BigNumber.from('1000000000000000000')

describe('Pool', async () => {
  // These values impact the pool results
  const daiTokens = BigNumber.from('1000000000000000000000000')
  const fyDaiTokens = daiTokens
  const initialDai = daiTokens

  let snapshotId: string
  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let operatorAcc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string
  let operator: string

  let yieldMathLibrary: YieldMath
  let safeERC20NamerLibrary: SafeERC20Namer

  let DaiFactory: any
  let FYDaiFactory: any
  let PoolFactoryFactory: any

  let factory: PoolFactory
  let pool: Pool
  let poolFromUser1: Pool
  let poolFromOwner: Pool

  let dai: Dai
  let daiFromOwner: Dai
  let daiFromUser1: Dai
  let fyDai1: FYDai
  let fyDai1FromUser1: FYDai
  let fyDai1FromOwner: FYDai
  let maturity1: number

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
    operatorAcc = signers[3]
    operator = operatorAcc.address

    const YieldMathFactory = await ethers.getContractFactory("YieldMath");
    yieldMathLibrary = await YieldMathFactory.deploy() as unknown as YieldMath
    await yieldMathLibrary.deployed();

    const SafeERC20NamerFactory = await ethers.getContractFactory("SafeERC20Namer");
    safeERC20NamerLibrary = await SafeERC20NamerFactory.deploy() as unknown as SafeERC20Namer
    await safeERC20NamerLibrary.deployed();

    DaiFactory = await ethers.getContractFactory("DaiMock");
    FYDaiFactory = await ethers.getContractFactory("FYDaiMock");
    PoolFactoryFactory = await ethers.getContractFactory(
      "PoolFactory",
      {
        libraries: {
          YieldMath: yieldMathLibrary.address,
          SafeERC20Namer: safeERC20NamerLibrary.address
        }
      }
    )

    maturity1 = (await currentTimestamp()) + 31556952 // One year
  })

  beforeEach(async () => {
    snapshotId = await timeMachine.takeSnapshot(ethers.provider)
    
    dai = await DaiFactory.deploy() as unknown as Dai
    await dai.deployed();
    daiFromUser1 = dai.connect(user1Acc)
    daiFromOwner = dai.connect(ownerAcc)

    fyDai1 = await FYDaiFactory.deploy(dai.address, maturity1) as unknown as FYDai
    await fyDai1.deployed();
    fyDai1FromUser1 = fyDai1.connect(user1Acc)
    fyDai1FromOwner = fyDai1.connect(ownerAcc)
    
    factory = await PoolFactoryFactory.deploy() as unknown as PoolFactory
    await factory.deployed();

    const calculatedAddress = await factory.calculatePoolAddress(dai.address, fyDai1.address)
    await factory.createPool(dai.address, fyDai1.address)

    const poolABI = [
      'event Trade(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens)',
      'event Liquidity(uint256 maturity, address indexed from, address indexed to, int256 daiTokens, int256 fyDaiTokens, int256 poolTokens)',
      'function k() view returns(int128)',
      'function baseToken() view returns(address)',
      'function fyToken() view returns(address)',
      'function getBaseTokenReserves() view returns(uint128)',
      'function getFYTokenReserves() view returns(uint128)',
      'function sellBaseToken(address, address, uint128) returns(uint128)',
      'function buyBaseToken(address, address, uint128) returns(uint128)',
      'function sellFYToken(address, address, uint128) returns(uint128)',
      'function buyFYToken(address, address, uint128) returns(uint128)',
      'function sellBaseTokenPreview(uint128) view returns(uint128)',
      'function buyBaseTokenPreview(uint128) view returns(uint128)',
      'function sellFYTokenPreview(uint128) view returns(uint128)',
      'function buyFYTokenPreview(uint128) view returns(uint128)',
      'function mint(address, address, uint256) returns (uint256)',
      'function mintWithToken(address, address, uint256) returns (uint256, uint256)',
      'function burn(address, address, uint256 tokensBurned) returns (uint256, uint256)',
      'function burnForBaseToken(address, address, uint256) returns (uint256)',

      'function totalSupply() view returns (uint256)',
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address, uint256) returns (bool)',
      'function allowance(address, address) view returns (uint256)',
      'function approve(address, uint256) returns (bool)',
      'function transferFrom(address, address, uint256) returns (bool)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'event Approval(address indexed owner, address indexed spender, uint256 value)',

      'function addDelegate(address)',
      'function addDelegateBySignature(address, address, uint, uint8, bytes32, bytes32)',
    ]

    pool = new ethers.Contract(calculatedAddress, poolABI, ownerAcc) as unknown as Pool
    poolFromUser1 = pool.connect(user1Acc)
    poolFromOwner = pool.connect(ownerAcc)
  })

  afterEach(async () => {
    await timeMachine.revertToSnapshot(ethers.provider, snapshotId)
  })

  it('should setup pool', async () => {
    const b = BigNumber.from('18446744073709551615')
    const k = b.div(BigNumber.from('126144000'))
    expect(await pool.k()).to.be.equal(k)

    const g1 = BigNumber.from('950').mul(b).div(BigNumber.from('1000')).add(BigNumber.from(1)) // Sell Dai to the pool
    const g2 = BigNumber.from('1000').mul(b).div(BigNumber.from('950')).add(BigNumber.from(1)) // Sell fyDai to the pool
  })

  it('adds initial liquidity', async () => {
    await dai.mint(user1, initialDai)

    await daiFromUser1.approve(pool.address, initialDai)
    await expect(poolFromUser1.mint(user1, user1, initialDai))
      .to.emit(pool, 'Liquidity')
      .withArgs(
        maturity1,
        user1,
        user1,
        initialDai.mul(-1),
        0,
        initialDai 
      )

    expect(
      await poolFromUser1.balanceOf(user1)
    ).to.equal(
      initialDai,
      'User1 should have ' + initialDai + ' liquidity tokens'
    )
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await dai.mint(user1, initialDai)
      await daiFromUser1.approve(pool.address, initialDai)
      await poolFromUser1.mint(user1, user1, initialDai)
    })

    it('sells fyDai', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyDaiReserves = await pool.getFYTokenReserves()
      const fyDaiIn = WAD
      const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())

      expect(
        await dai.balanceOf(user2)
      ).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )
      
      // Test preview since we are here
      const daiOutPreview = await poolFromUser1.sellFYTokenPreview(fyDaiIn)

      const expectedDaiOut = BigNumber.from(floor(sellFYDai(
        daiReserves.toString(),
        fyDaiReserves.toString(),
        fyDaiIn.toString(),
        timeTillMaturity.toString()
      )).toFixed())

      await fyDai1FromUser1.mint(user1, fyDaiIn)
      await fyDai1FromUser1.approve(pool.address, fyDaiIn)
      await expect(poolFromUser1.sellFYToken(user1, user2, fyDaiIn))
        .to.emit(pool,'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          await daiFromUser1.balanceOf(user2),
          fyDaiIn.mul(-1),  
        )

      expect(await fyDai1.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyDai tokens")

      const daiOut = await dai.balanceOf(user2)

      almostEqual(daiOut, expectedDaiOut, fyDaiIn.div(1000000))
      almostEqual(daiOutPreview, expectedDaiOut, fyDaiIn.div(1000000))
    })

    it('buys dai', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyDaiReserves = await pool.getFYTokenReserves()
      const daiOut = WAD.mul(10) // TODO: This runs out of gas with WAD, why?
      
      const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())


      expect(
        await dai.balanceOf(user2)
      ).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )

      // Test preview since we are here
      const fyDaiInPreview = await poolFromUser1.buyBaseTokenPreview(daiOut)

      const expectedFYDaiIn = BigNumber.from(floor(buyDai(
        daiReserves.toString(),
        fyDaiReserves.toString(),
        daiOut.toString(),
        timeTillMaturity.toString()
      )).toFixed())

      await fyDai1FromUser1.mint(user1, fyDaiTokens)
      await fyDai1FromUser1.approve(pool.address, fyDaiTokens)

      
      await expect(poolFromUser1.buyBaseToken(user1, user2, daiOut))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          daiOut,
          fyDaiTokens.sub(await fyDai1.balanceOf(user1)).mul(-1),
        )

      const fyDaiIn = fyDaiTokens.sub(await fyDai1.balanceOf(user1))
      expect(await dai.balanceOf(user2)).to.equal(daiOut, 'Receiver account should have 1 dai token')

      almostEqual(fyDaiIn, expectedFYDaiIn, daiOut.div(1000000))
      almostEqual(fyDaiInPreview, expectedFYDaiIn, daiOut.div(1000000))
    })

    describe('with extra fyDai reserves', () => {
      beforeEach(async () => {
        const additionalFYDaiReserves = WAD.mul(30)
        await fyDai1FromOwner.mint(owner, additionalFYDaiReserves)
        await fyDai1FromOwner.approve(pool.address, additionalFYDaiReserves)
        await poolFromOwner.sellFYToken(owner, owner, additionalFYDaiReserves)
      })

      it('mints liquidity tokens', async () => {
        const daiReserves = await dai.balanceOf(pool.address)
        const fyDaiReserves = await fyDai1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const daiIn = WAD

        await daiFromUser1.mint(user1, daiIn)
        await fyDai1FromUser1.mint(user1, fyDaiTokens)

        const fyDaiBefore = await fyDai1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await daiFromUser1.approve(pool.address, WAD)
        await fyDai1FromUser1.approve(pool.address, fyDaiTokens)
        await expect(poolFromUser1.mint(user1, user2, WAD))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            WAD.mul(-1),
            fyDaiBefore.sub(await fyDai1.balanceOf(user1)).mul(-1),
            (await pool.balanceOf(user2)).sub(poolTokensBefore),            
          )

        const [expectedMinted, expectedFYDaiIn] = mint(
          daiReserves.toString(),
          fyDaiReserves.toString(),
          supply.toString(),
          daiIn.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const fyDaiIn = fyDaiBefore.sub(await fyDai1.balanceOf(user1))

        almostEqual(minted, BigNumber.from(floor(expectedMinted).toFixed().toString()), daiIn.div(BigNumber.from('10000')))
        almostEqual(fyDaiIn, BigNumber.from(floor(expectedFYDaiIn).toFixed().toString()), daiIn.div(BigNumber.from('10000')))
      })

      it('mints liquidity tokens with dai only', async () => {
        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyDaiReservesReal = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        
        const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())
        const fyDaiToBuy = WAD.div(1000)
        const maxDaiIn = WAD.mul(1000)

        await daiFromOwner.mint(user1, maxDaiIn)

        const daiBefore = await daiFromOwner.balanceOf(user1)
        const poolTokensBefore = await poolFromOwner.balanceOf(user2)

        await daiFromUser1.approve(pool.address, maxDaiIn)
        await expect(poolFromUser1.mintWithToken(user1, user2, fyDaiToBuy))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            0,
            (await poolFromOwner.balanceOf(user2)).sub(poolTokensBefore),
          )

        const [expectedMinted, expectedDaiIn] = mintWithDai(
          daiReserves.toString(),
          fyDaiReservesVirtual.toString(),
          fyDaiReservesReal.toString(),
          supply.toString(),
          fyDaiToBuy.toString(),
          timeTillMaturity.toString()
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const daiIn = daiBefore.sub(await dai.balanceOf(user1))

        almostEqual(minted, BigNumber.from(floor(expectedMinted).toFixed().toString()), minted.div(BigNumber.from('10000')))
        almostEqual(daiIn, BigNumber.from(floor(expectedDaiIn).toFixed().toString()), daiIn.div(BigNumber.from('10000')))
      })

      it('burns liquidity tokens', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReserves = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        const lpTokensIn = WAD

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burn(user1, user2, lpTokensIn))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            fyDaiReserves.sub(await fyDai1FromOwner.balanceOf(pool.address)),
            lpTokensIn.mul(-1),
          )

        const [expectedDaiOut, expectedFYDaiOut] = burn(
          daiReserves.toString(),
          fyDaiReserves.toString(),
          supply.toString(),
          lpTokensIn.toString()
        )

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))
        const fyDaiOut = fyDaiReserves.sub(await fyDai1.balanceOf(pool.address))

        almostEqual(daiOut, BigNumber.from(floor(expectedDaiOut).toFixed().toString()), daiOut.div(BigNumber.from('10000')))
        almostEqual(fyDaiOut, BigNumber.from(floor(expectedFYDaiOut).toFixed().toString()), fyDaiOut.div(BigNumber.from('10000')))
      })

      it('burns liquidity tokens to Dai', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyDaiReservesReal = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        
        const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())
        const lpTokensIn = WAD.mul(2) // TODO: Why does it run out of gas with 1 WAD?

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burnForBaseToken(user1, user2, lpTokensIn))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            0,
            lpTokensIn.mul(-1),
          )

        const expectedDaiOut = burnForDai(
          daiReserves.toString(),
          fyDaiReservesVirtual.toString(),
          fyDaiReservesReal.toString(),
          supply.toString(),
          lpTokensIn.toString(),
          timeTillMaturity.toString()
        )

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))

        almostEqual(daiOut, BigNumber.from(floor(expectedDaiOut).toFixed().toString()), daiOut.div(BigNumber.from('10000')))
      })

      it('sells dai', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyDaiReserves = await poolFromOwner.getFYTokenReserves()
        const daiIn = WAD

        
        const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyDai, instead has " + (await fyDai1.balanceOf(user2))
        )

        // Test preview since we are here
        const fyDaiOutPreview = await poolFromOwner.sellBaseTokenPreview(daiIn)

        const expectedFYDaiOut = sellDai(
          daiReserves.toString(),
          fyDaiReserves.toString(),
          daiIn.toString(),
          timeTillMaturity.toString()
        )

        await daiFromOwner.mint(user1, daiIn)
        await daiFromUser1.approve(pool.address, daiIn)

        await expect(poolFromUser1.sellBaseToken(user1, user2, daiIn))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          daiIn.mul(-1),
          await fyDai1FromOwner.balanceOf(user2),
        )

        const fyDaiOut = await fyDai1FromOwner.balanceOf(user2)

        expect(await daiFromOwner.balanceOf(user1)).to.equal(0, "'From' wallet should have no dai tokens")

        almostEqual(fyDaiOut, BigNumber.from(floor(expectedFYDaiOut).toFixed().toString()), daiIn.div(1000000))
        almostEqual(fyDaiOutPreview, BigNumber.from(floor(expectedFYDaiOut).toFixed().toString()), daiIn.div(1000000))
      })

      it('buys fyDai', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyDaiReserves = await poolFromOwner.getFYTokenReserves()
        const fyDaiOut = WAD
        
        const timeTillMaturity = BigNumber.from(maturity1).sub(await currentTimestamp())

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyDai, instead has " + (await fyDai1FromOwner.balanceOf(user2))
        )

        // Test preview since we are here
        const daiInPreview = await poolFromOwner.buyFYTokenPreview(fyDaiOut)

        const expectedDaiIn = buyFYDai(
          daiReserves.toString(),
          fyDaiReserves.toString(),
          fyDaiOut.toString(),
          timeTillMaturity.toString()
        )

        await daiFromOwner.mint(user1, daiTokens)
        const daiBalanceBefore = await daiFromOwner.balanceOf(user1)

        await daiFromUser1.approve(poolFromUser1.address, daiTokens)
        await expect(poolFromUser1.buyFYToken(user1, user2, fyDaiOut))
          .to.emit(pool, 'Trade')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            fyDaiOut,
          )

        const daiIn = daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1))

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(fyDaiOut, "'User2' wallet should have 1 fyDai token")

        almostEqual(daiIn, BigNumber.from(floor(expectedDaiIn).toFixed().toString()), daiIn.div(1000000))
        almostEqual(daiInPreview, BigNumber.from(floor(expectedDaiIn).toFixed().toString()), daiIn.div(1000000))
      })

      it("once mature, doesn't allow trading", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.sellBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
      })
    })
  })
})
