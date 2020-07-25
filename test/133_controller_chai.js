const helper = require('ganache-time-traveler');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { WETH, CHAI, rate1, chi1, daiTokens1, chaiTokens1, toRay, addBN, subBN, mulRay, divRay } = require('./shared/utils');
const { YieldEnvironmentLite } = require("./shared/fixtures");

contract('Controller - Chai', async (accounts) =>  {
    let [ owner, user1 ] = accounts;

    let snapshot;
    let snapshotId;
    let maker;

    let maturity1;
    let maturity2;

    beforeEach(async() => {
        snapshot = await helper.takeSnapshot();
        snapshotId = snapshot['result'];

        const yield = await YieldEnvironmentLite.setup();
        maker = yield.maker;
        controller = yield.controller;
        treasury = yield.treasury;
        pot = yield.maker.pot;
        vat = yield.maker.vat;
        dai = yield.maker.dai;
        chai = yield.maker.chai;

        // Setup yDai
        const block = await web3.eth.getBlockNumber();
        maturity1 = (await web3.eth.getBlock(block)).timestamp + 1000;
        maturity2 = (await web3.eth.getBlock(block)).timestamp + 2000;
        yDai1 = await yield.newYDai(maturity1, "Name", "Symbol");
        yDai2 = await yield.newYDai(maturity2, "Name", "Symbol");

        // Tests setup
        await maker.getChai(user1, chaiTokens1, chi1, rate1);
    });

    afterEach(async() => {
        await helper.revertToSnapshot(snapshotId);
    });

    it("allows user to post chai", async() => {
        assert.equal(
            await chai.balanceOf(treasury.address),
            0,
            "Treasury has chai",
        );
        assert.equal(
            await controller.powerOf(CHAI, user1),
            0,
            "User1 has borrowing power",
        );
        
        await chai.approve(treasury.address, chaiTokens1, { from: user1 });
        await controller.post(CHAI, user1, user1, chaiTokens1, { from: user1 });

        assert.equal(
            await chai.balanceOf(treasury.address),
            chaiTokens1.toString(),
            "Treasury should have chai",
        );
        assert.equal(
            await controller.powerOf(CHAI, user1),
            daiTokens1.toString(),
            "User1 should have " + daiTokens1 + " borrowing power, instead has " + (await controller.powerOf(CHAI, user1)),
        );
    });

    describe("with posted chai", () => {
        beforeEach(async() => {
            await chai.approve(treasury.address, chaiTokens1, { from: user1 });
            await controller.post(CHAI, user1, user1, chaiTokens1, { from: user1 });
        });

        it("allows user to withdraw chai", async() => {
            assert.equal(
                await chai.balanceOf(treasury.address),
                chaiTokens1.toString(),
                "Treasury does not have chai",
            );
            assert.equal(
                await controller.powerOf(CHAI, user1),
                daiTokens1.toString(),
                "User1 does not have borrowing power",
            );
            assert.equal(
                await chai.balanceOf(user1),
                0,
                "User1 has collateral in hand"
            );
            
            await controller.withdraw(CHAI, user1, user1, chaiTokens1, { from: user1 });

            assert.equal(
                await chai.balanceOf(user1),
                chaiTokens1.toString(),
                "User1 should have collateral in hand"
            );
            assert.equal(
                await chai.balanceOf(treasury.address),
                0,
                "Treasury should not have chai",
            );
            assert.equal(
                await controller.powerOf(CHAI, user1),
                0,
                "User1 should not have borrowing power",
            );
        });

        it("allows to borrow yDai", async() => {
            assert.equal(
                await controller.powerOf(CHAI, user1),
                daiTokens1.toString(),
                "User1 does not have borrowing power",
            );
            assert.equal(
                await yDai1.balanceOf(user1),
                0,
                "User1 has yDai",
            );
            assert.equal(
                await controller.debtDai(CHAI, maturity1, user1),
                0,
                "User1 has debt",
            );
    
            await controller.borrow(CHAI, maturity1, user1, user1, daiTokens1, { from: user1 });

            assert.equal(
                await yDai1.balanceOf(user1),
                daiTokens1.toString(),
                "User1 should have yDai",
            );
            assert.equal(
                await controller.debtDai(CHAI, maturity1, user1),
                daiTokens1.toString(),
                "User1 should have debt",
            );
        });

        it("doesn't allow to borrow yDai beyond borrowing power", async() => {
            assert.equal(
                await controller.powerOf(CHAI, user1),
                daiTokens1.toString(),
                "User1 does not have borrowing power",
            );
            assert.equal(
                await controller.debtDai(CHAI, maturity1, user1),
                0,
                "User1 has debt",
            );
    
            await expectRevert(
                controller.borrow(CHAI, maturity1, user1, user1, addBN(daiTokens1, 1), { from: user1 }),
                "Controller: Too much debt",
            );
        });

        describe("with borrowed yDai", () => {
            beforeEach(async() => {
                await controller.borrow(CHAI, maturity1, user1, user1, daiTokens1, { from: user1 });
            });

            it("doesn't allow to withdraw and become undercollateralized", async() => {
                assert.equal(
                    await controller.powerOf(CHAI, user1),
                    daiTokens1.toString(),
                    "User1 does not have borrowing power",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    daiTokens1.toString(),
                    "User1 does not have debt",
                );

                await expectRevert(
                    controller.borrow(CHAI, maturity1, user1, user1, chaiTokens1, { from: user1 }),
                    "Controller: Too much debt",
                );
            });

            it("allows to repay yDai", async() => {
                assert.equal(
                    await yDai1.balanceOf(user1),
                    daiTokens1.toString(),
                    "User1 does not have yDai",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    daiTokens1.toString(),
                    "User1 does not have debt",
                );

                await yDai1.approve(treasury.address, daiTokens1, { from: user1 });
                await controller.repayYDai(CHAI, maturity1, user1, user1, daiTokens1, { from: user1 });
    
                assert.equal(
                    await yDai1.balanceOf(user1),
                    0,
                    "User1 should not have yDai",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    0,
                    "User1 should not have debt",
                );
            });

            it("allows to repay yDai with dai", async() => {
                // Borrow dai
                await maker.getDai(user1, daiTokens1, rate1);

                assert.equal(
                    await dai.balanceOf(user1),
                    daiTokens1.toString(),
                    "User1 does not have dai",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    daiTokens1.toString(),
                    "User1 does not have debt",
                );

                await dai.approve(treasury.address, daiTokens1, { from: user1 });
                await controller.repayDai(CHAI, maturity1, user1, user1, daiTokens1, { from: user1 });
    
                assert.equal(
                    await dai.balanceOf(user1),
                    0,
                    "User1 should not have yDai",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    0,
                    "User1 should not have debt",
                );
            });

            it("when dai is provided in excess for repayment, only the necessary amount is taken", async() => {
                // Mint some yDai the sneaky way
                await yDai1.orchestrate(owner, { from: owner });
                await yDai1.mint(user1, 1, { from: owner }); // 1 extra yDai wei
                const yDaiTokens = addBN(daiTokens1, 1); // daiTokens1 + 1 wei

                assert.equal(
                    await yDai1.balanceOf(user1),
                    yDaiTokens.toString(),
                    "User1 does not have yDai",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    daiTokens1.toString(),
                    "User1 does not have debt",
                );

                await yDai1.approve(treasury.address, yDaiTokens, { from: user1 });
                await controller.repayYDai(CHAI, maturity1, user1, user1, yDaiTokens, { from: user1 });
    
                assert.equal(
                    await yDai1.balanceOf(user1),
                    1,
                    "User1 should have yDai left",
                );
                assert.equal(
                    await controller.debtDai(CHAI, maturity1, user1),
                    0,
                    "User1 should not have debt",
                );
            });

            let rateIncrease;
            let chiIncrease;
            let chiDifferential;
            let increasedDebt;
            let debtIncrease;
            let rate2;
            let chi2

            describe("after maturity, with a chi increase", () => {
                beforeEach(async() => {
                    assert.equal(
                        await yDai1.balanceOf(user1),
                        daiTokens1.toString(),
                        "User1 does not have yDai",
                    );
                    assert.equal(
                        await controller.debtDai(CHAI, maturity1, user1),
                        daiTokens1.toString(),
                        "User1 does not have debt",
                    );
                    // yDai matures
                    await helper.advanceTime(1000);
                    await helper.advanceBlock();
                    await yDai1.mature();

                    // Set rate to 1.75
                    rateIncrease = toRay(0.5);
                    rate2 = rate1.add(rateIncrease);
                    await vat.fold(WETH, vat.address, rateIncrease, { from: owner });

                    // Set chi to 1.5
                    chiIncrease = toRay(0.25);
                    chiDifferential = divRay(addBN(chi1, chiIncrease), chi1);
                    chi2 = chi1.add(chiIncrease);
                    await pot.setChi(chi2, { from: owner });

                    increasedDebt = mulRay(daiTokens1, chiDifferential);
                    debtIncrease = addBN(subBN(increasedDebt, daiTokens1), 1); // Rounding is different with JavaScript
                });

                it("as chi increases after maturity, so does the debt in when measured in dai", async() => {
                    assert.equal(
                        await controller.debtDai(CHAI, maturity1, user1),
                        increasedDebt.toString(),
                        "User1 should have " + increasedDebt + " debt after the chi change, instead has " + (await controller.debtDai(CHAI, maturity1, user1)),
                    );
                });
    
                it("as chi increases after maturity, the debt doesn't in when measured in yDai", async() => {
                    assert.equal(
                        await controller.debtYDai(CHAI, maturity1, user1),
                        daiTokens1.toString(),
                        "User1 should have " + daiTokens1 + " debt after the chi change, instead has " + (await controller.debtYDai(CHAI, maturity1, user1)),
                    );
                });

                // TODO: Test that when yDai is provided in excess for repayment, only the necessary amount is taken
    
                it("more Dai is required to repay after maturity as chi increases", async() => {
                    await maker.getDai(user1, daiTokens1, rate2); // daiTokens1 is not going to be enough anymore
                    await dai.approve(treasury.address, daiTokens1, { from: user1 });
                    await controller.repayDai(CHAI, maturity1, user1, user1, daiTokens1, { from: user1 });
        
                    assert.equal(
                        await controller.debtDai(CHAI, maturity1, user1),
                        debtIncrease.toString(),
                        "User1 should have " + debtIncrease + " dai debt, instead has " + (await controller.debtDai(CHAI, maturity1, user1)),
                    );
                });
            });
        });
    });
});
