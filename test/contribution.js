// Simulate a full contribution

const MiniMeTokenFactory = artifacts.require("MiniMeTokenFactory");
const SGT = artifacts.require("SGT");
const SNT = artifacts.require("SNT");
const MultisigWallet = artifacts.require("MultisigWallet");
const ContributionWallet = artifacts.require("ContributionWallet");
const StatusContributionMock = artifacts.require("StatusContributionMock");
const DevTokensHolder = artifacts.require("DevTokensHolderMock");
const SGTExchanger = artifacts.require("SGTExchanger");
const DynamicCeiling = artifacts.require("DynamicCeiling");
const SNTPlaceHolderMock = artifacts.require("SNTPlaceHolderMock");

const setHiddenPoints = require("./helpers/hiddenPoints.js").setHiddenPoints;
const assertFail = require("./helpers/assertFail");

contract("StatusContribution", (accounts) => {
    let multisigStatus;
    let multisigComunity;
    let multisigSecondarySell;
    let multisigDevs;
    let miniMeFactory;
    let sgt;
    let snt;
    let statusContribution;
    let contributionWallet;
    let devTokensHolder;
    let sgtExchanger;
    let dynamicCeiling;
    let sntPlaceHolder;

    const points = [ [ 1000000, web3.toWei(3) ],
                     [ 1001000, web3.toWei(13) ],
                     [ 1002000, web3.toWei(15) ] ];
    const startBlock = 1000000;
    const stopBlock = 1003000;

    it("Should deploy Contribution contracts", async () => {
        multisigStatus = await MultisigWallet.new([ accounts[ 0 ] ], 1);
        multisigComunity = await MultisigWallet.new([ accounts[ 1 ] ], 1);
        multisigSecondarySell = await MultisigWallet.new([ accounts[ 2 ] ], 1);
        multisigDevs = await MultisigWallet.new([ accounts[ 3 ] ], 1);
        miniMeFactory = await MiniMeTokenFactory.new();
        sgt = await SGT.new(miniMeFactory.address);
        await sgt.generateTokens(accounts[ 4 ], 5000);

        snt = await SNT.new(miniMeFactory.address);
        statusContribution = await StatusContributionMock.new();
        contributionWallet = await ContributionWallet.new(
            multisigStatus.address,
            stopBlock,
            statusContribution.address);
        devTokensHolder = await DevTokensHolder.new(
            multisigDevs.address,
            statusContribution.address,
            snt.address);
        sgtExchanger = await SGTExchanger.new(sgt.address, snt.address);
        dynamicCeiling = await DynamicCeiling.new();

        await setHiddenPoints(dynamicCeiling, points);

        sntPlaceHolder = await SNTPlaceHolderMock.new(
            multisigComunity.address,
            snt.address,
            statusContribution.address,
            sgtExchanger.address);

        await snt.changeController(statusContribution.address);
        await sgt.changeController(sgtExchanger.address);

        await statusContribution.initialize(
          snt.address,
          startBlock,
          stopBlock,
          dynamicCeiling.address,

          contributionWallet.address,

          devTokensHolder.address,

          multisigSecondarySell.address,
          sgt.address,

          sgtExchanger.address,
          5000 * 2,

          sntPlaceHolder.address);
    });

    it("Check initial parameters", async () => {
        assert.equal(await snt.controller(), statusContribution.address);
        assert.equal(await sgt.controller(), sgtExchanger.address);
    });

    it("Checks that no body can buy before the sale starts", async () => {
        try {
            await snt.send(web3.toWei(1));
        } catch (error) {
            assertFail(error);
        }
    });

    it("Reveal a point, move time to start of the ICO, and do the first buy", async () => {
        await dynamicCeiling.revealPoint(
                points[ 0 ][ 0 ],
                points[ 0 ][ 1 ],
                false,
                web3.sha3("pwd0"));

        await statusContribution.setMockedBlockNumber(1000000);

        await snt.sendTransaction({ value: web3.toWei(1), gas: 300000 });

        const balance = await snt.balanceOf(accounts[ 0 ]);

        assert.equal(web3.fromWei(balance), 1000);
    });

    it("Should return the remaining in the last transaction ", async () => {
        const initailBalance = await web3.eth.getBalance(accounts[ 0 ]);
        await snt.sendTransaction({ value: web3.toWei(5), gas: 300000 });
        const finalBalance = await web3.eth.getBalance(accounts[ 0 ]);

        const spended = web3.fromWei(initailBalance.sub(finalBalance)).toNumber();
        assert.isAbove(spended, 2);
        assert.isBelow(spended, 2.1);

        const totalCollected = await statusContribution.totalCollected();
        assert.equal(web3.fromWei(totalCollected), 3);

        const balanceContributionWallet = await web3.eth.getBalance(contributionWallet.address);
        assert.equal(web3.fromWei(balanceContributionWallet), 3);
    });

    it("Should reveal second point and check that every that the limit is right", async () => {
        await dynamicCeiling.revealPoint(
                points[ 1 ][ 0 ],
                points[ 1 ][ 1 ],
                false,
                web3.sha3("pwd1"));

        await statusContribution.setMockedBlockNumber(1000500);

        const initailBalance = await web3.eth.getBalance(accounts[ 0 ]);
        await snt.sendTransaction({ value: web3.toWei(10), gas: 300000 });
        const finalBalance = await web3.eth.getBalance(accounts[ 0 ]);

        const spended = web3.fromWei(initailBalance.sub(finalBalance)).toNumber();
        assert.isAbove(spended, 5);
        assert.isBelow(spended, 5.1);

        const totalCollected = await statusContribution.totalCollected();
        assert.equal(web3.fromWei(totalCollected), 8);

        const balanceContributionWallet = await web3.eth.getBalance(contributionWallet.address);
        assert.equal(web3.fromWei(balanceContributionWallet), 8);
    });

    it("Should reveal last point, fill the collaboration", async () => {
        await dynamicCeiling.revealPoint(
                points[ 2 ][ 0 ],
                points[ 2 ][ 1 ],
                true,
                web3.sha3("pwd2"));

        await statusContribution.setMockedBlockNumber(1002500);

        const initailBalance = await web3.eth.getBalance(accounts[ 0 ]);
        await statusContribution.proxyPayment(
            accounts[ 1 ],
            { value: web3.toWei(15), gas: 300000, from: accounts[ 0 ] });

        const finalBalance = await web3.eth.getBalance(accounts[ 0 ]);

        const balance1 = await snt.balanceOf(accounts[ 1 ]);

        assert.equal(web3.fromWei(balance1), 7000);

        const spended = web3.fromWei(initailBalance.sub(finalBalance)).toNumber();
        assert.isAbove(spended, 7);
        assert.isBelow(spended, 7.1);

        const totalCollected = await statusContribution.totalCollected();
        assert.equal(web3.fromWei(totalCollected), 15);

        const balanceContributionWallet = await web3.eth.getBalance(contributionWallet.address);
        assert.equal(web3.fromWei(balanceContributionWallet), 15);
    });

    it("Should not allow transfers in contribution period", async () => {
        try {
            await snt.transfer(accounts[ 4 ], web3.toWei(1000));
        } catch (error) {
            assertFail(error);
        }
    });

    it("Should finalize", async () => {
        await statusContribution.finalize();

        const totalSupply = await snt.totalSupply();

        assert.equal(web3.fromWei(totalSupply).toNumber(), 15000 / 0.46);

        const balanceSGT = await snt.balanceOf(sgtExchanger.address);
        assert.equal(balanceSGT.toNumber(), totalSupply.mul(0.05).toNumber());

        const balanceDevs = await snt.balanceOf(devTokensHolder.address);
        assert.equal(balanceDevs.toNumber(), totalSupply.mul(0.20).toNumber());

        const balanceSecondary = await snt.balanceOf(multisigSecondarySell.address);
        assert.equal(balanceSecondary.toNumber(), totalSupply.mul(0.29).toNumber());
    });

    it("Should move the Ether to the final multisig", async () => {
        await multisigStatus.submitTransaction(
            contributionWallet.address,
            0,
            contributionWallet.contract.withdraw.getData());

        const balance = await web3.eth.getBalance(multisigStatus.address);

        assert.equal(balance, web3.toWei(15));
    });

    it("Should be able to exchange sgt by snt", async () => {
        await sgtExchanger.collect({ from: accounts[ 4 ] });

        const balance = await snt.balanceOf(accounts[ 4 ]);
        const totalSupply = await snt.totalSupply();

        assert.equal(totalSupply.mul(0.05).toNumber(), balance.toNumber());
    });

    it("Should not allow transfers in the 2 weeks period", async () => {
        try {
            await snt.transfer(accounts[ 4 ], web3.toWei(1000));
        } catch (error) {
            assertFail(error);
        }
    });

    it("Should allow transfers after 2 weeks period", async () => {
        const t = Math.floor(new Date().getTime() / 1000) + (86400 * 14) + 1000;
        await sntPlaceHolder.setMockedTime(t);

        await snt.transfer(accounts[ 5 ], web3.toWei(1000));

        const balance2 = await snt.balanceOf(accounts[ 5 ]);

        assert.equal(web3.fromWei(balance2).toNumber(), 1000);
    });

    it("Devs should not allow transfers before 6 months", async () => {
        const t = Math.floor(new Date().getTime() / 1000) + (86400 * 14) + 1000;
        await devTokensHolder.setMockedTime(t);

        try {
            await multisigDevs.submitTransaction(
                devTokensHolder.address,
                0,
                devTokensHolder.contract.collectTokens.getData(),
                { from: accounts[ 3 ] });
        } catch (error) {
            assertFail(error);
        }
    });

    it("Devs Should be able to extract 1/2 after a year", async () => {
        const t = Math.floor(new Date().getTime() / 1000) + (86400 * 360);
        await devTokensHolder.setMockedTime(t);

        const totalSupply = await snt.totalSupply();

        await multisigDevs.submitTransaction(
            devTokensHolder.address,
            0,
            devTokensHolder.contract.collectTokens.getData(),
            { from: accounts[ 3 ] });

        const balance = await snt.balanceOf(multisigDevs.address);

        const calcTokens = web3.fromWei(totalSupply.mul(0.20).mul(0.5)).toNumber();
        const realTokens = web3.fromWei(balance).toNumber();

        assert.isBelow(realTokens - calcTokens, 0.1);
    });

    it("Devs Should be able to extract every thing after 2 year", async () => {
        const t = Math.floor(new Date().getTime() / 1000) + (86400 * 360 * 2);
        await devTokensHolder.setMockedTime(t);

        const totalSupply = await snt.totalSupply();

        await multisigDevs.submitTransaction(
            devTokensHolder.address,
            0,
            devTokensHolder.contract.collectTokens.getData(),
            { from: accounts[ 3 ] });

        const balance = await snt.balanceOf(multisigDevs.address);

        const calcTokens = web3.fromWei(totalSupply.mul(0.20)).toNumber();
        const realTokens = web3.fromWei(balance).toNumber();

        assert.equal(calcTokens, realTokens);
    });

    it("SNT's Controller should be upgradeable", async () => {
        await multisigComunity.submitTransaction(
            sntPlaceHolder.address,
            0,
            sntPlaceHolder.contract.changeController.getData(accounts[ 6 ]),
            { from: accounts[ 1 ] });

        const controller = await snt.controller();

        assert.equal(controller, accounts[ 6 ]);
    });
});
