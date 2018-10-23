const indy = require('indy-sdk');

test();

async function test() {
    console.log("\"Sovrin Steward\" -> Create wallet");
    let stewardWalletConfig = {'id': 'stewardWalletName'};      //安全钱包的名字，在本地存储的时候会用这个名字
    let stewardWalletCredentials = {'key': 'steward_key'};      //这个key用来获Master Secret
    try {
        await indy.createWallet(stewardWalletConfig, stewardWalletCredentials);
    } catch (e) {
        console.log(e.message);
        if(e.message !== "WalletAlreadyExistsError") {
            throw e;
        }
    }

    /**
     * 打开一个钱包，并获得它的句柄
     */
    let stewardWallet = await indy.openWallet(stewardWalletConfig, stewardWalletCredentials);

    console.log("\"Sovrin Steward\" -> Create and store in Wallet DID from seed");
    let stewardDidInfo = {
        "seed": "000000000000000000000000Steward4"
    };

    let result = await indy.createAndStoreMyDid(stewardWallet, stewardDidInfo);

    console.log(result);
    console.log(typeof result);
    console.log(Array.isArray(result));
    let [stewardDid, stewardKey] = result;
    console.log(`stewardDid: ${stewardDid}, stewardKey: ${stewardKey}`);
}

/**
 stewardDid: Th7MpTaRZVRYnPiabds81Y, stewardKey: FYmoFw55GeQH7SRFa37dkx1d2dZ3zUF8ckg7wmL7ofN4
 */