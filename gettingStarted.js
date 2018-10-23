"use strict";
const indy = require('indy-sdk');
const util = require('./util');
const assert = require('assert');
const IndyHelper = require('./IndyHelper');

run();

/**
 * 运行测试样例
 * @returns {Promise<void>}
 */
async function run() {
    console.log("Getting started -> started");

    let poolName = 'pool1';
    console.log(`Open Pool Ledger: ${poolName}`);

    //生成配置文件（包含创世事务）
    let poolGenesisTxnPath = await util.getPoolGenesisTxnPath(poolName);
    let poolConfig = {
        "genesis_txn": poolGenesisTxnPath
    };

    try {
        await indy.createPoolLedgerConfig(poolName, poolConfig);
    } catch (e) {
        console.log('============create pool ledger config error=============');
        console.log(e);
        console.log('====================================');
        if (e.message !== "PoolLedgerConfigAlreadyExistsError") {
            throw e;
        }
    }

    /**
     * 设置全局属性PROTOCOL_VERSION的值，在之后每一个对pool的请求中都会包含这个协议版本号
     */
    await indy.setProtocolVersion(2);

    /**
     * 打开与pool中账本的连接，并获得一个句柄，可以通过这个句柄与pool账本进行交互
     */
    let poolHandle = await indy.openPoolLedger(poolName);

    console.log("==============================");
    console.log("=== Getting Trust Anchor credentials for Faber, Acme, Thrift and Government（为四个组织获得TrustAnchor的证明）  ==");
    console.log("------------------------------");


    /**
     * 为管家节点创建钱包，并打开它
     */
    console.log("\"Sovrin Steward\" -> Create wallet");
    let [stewardWallet, stewardWalletConfig, stewardWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'stewardWalletName'
    }, {
        'key': 'steward_key'
    });

    console.log("\"Sovrin Steward\" -> Create and store in Wallet DID from seed");
    /**
     * 通过提供一个seed创建一个Did，并生成与之相关的公私钥，私钥存储在钱包当中，不可直接访问
     * promise中的回调值（返回值）是一个数组，包含了did和公钥的值两项。
     * 下面通过es6引入的解构语法分别保存为 stewardDid 和 stewardKey
     *
     * 注意：指定一个seed后生成的did是确定的，这里所使用的seed生成的did就是上面的GenesisTxn中配置给node1的did
     */
    let [stewardDid, stewardKey] = await IndyHelper.createAndStoreDidBySeed(stewardWallet, '000000000000000000000000Steward1');

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Government Onboarding（在Government节点和steward节点之间建立一个安全的双向连接）  ==");
    console.log("------------------------------");

    /**
     * 首先创建Government的钱包
     */
    let [governmentWallet, governmentWalletConfig, governmentWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'governmentWallet'
    }, {
        'key': 'government_key'
    });

    // 通过调用onboarding函数建立 Steward 和 Government 的安全连接，返回用于这个连接的一对Did及其验证公钥
    let [stewardGovernmentDid, stewardGovernmentKey, governmentStewarDid, governmentStewardKey] = await IndyHelper.onboarding(poolHandle,
        'Sovrin Steward', stewardWallet, stewardDid, 'Government', governmentWallet);


    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Government getting Verinym (Government与steward端通信，生成一个Verinym Did，并写入到账本当中，最终成为TRUST_ANCHOR节点) ==");
    console.log("------------------------------");

    /**
     * 与steward端通信，生成一个Verinym Did，并写入到账本当中，最终成为TRUST_ANCHOR节点
     */
    let governmentDid = await IndyHelper.getVerinym(poolHandle, 'Sovrin Steward', stewardWallet, stewardDid,
        stewardGovernmentKey, "Government", governmentWallet, governmentStewarDid, governmentStewardKey, 'TRUST_ANCHOR');

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Faber Onboarding （在Faber节点和steward节点之间建立一个安全的双向连接） ==");
    console.log("------------------------------");

    let [faberWallet, faberWalletConfig, faberWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'faberWallet'
    }, {
        'key': 'faber_key'
    });
    let [stewardFaberDid, stewardFaberKey, faberStewardDid, faberStewardKey] = await IndyHelper.onboarding(poolHandle,
        'Sovrin Steward', stewardWallet, stewardDid, 'Faber', faberWallet);

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Faber getting Verinym  (Faber与steward端通信，生成一个Verinym Did，并写入到账本当中，最终成为TRUST_ANCHOR节点) ==");
    console.log("------------------------------");

    let faberDid = await IndyHelper.getVerinym(poolHandle, 'Sovrin Steward', stewardWallet, stewardDid,
        stewardFaberKey, 'Faber', faberWallet, faberStewardDid, faberStewardKey, 'TRUST_ANCHOR');


    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Acme Onboarding  （在Acme节点和steward节点之间建立一个安全的双向连接）==");
    console.log("------------------------------");

    let [acmeWallet, acmeWalletConfig, acmeWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'acmeWallet'
    }, {
        'key': 'acme_key'
    });
    let [stewardAcmeDid, stewardAcmeKey, acmeStewardDid, acmeStewardKey] = await IndyHelper.onboarding(poolHandle,
        'Sovrin Steward', stewardWallet, stewardDid, 'Acme', acmeWallet);

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Acme getting Verinym  (Acme与steward端通信，生成一个Verinym Did，并写入到账本当中，最终成为TRUST_ANCHOR节点) ==");
    console.log("------------------------------");

    let acmeDid = await IndyHelper.getVerinym(poolHandle, 'Sovrin Steward', stewardWallet, stewardDid,
        stewardAcmeKey, 'Acme', acmeWallet, acmeStewardDid, acmeStewardKey, 'TRUST_ANCHOR');

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Thrift Onboarding  （在Thrift节点和steward节点之间建立一个安全的双向连接）==");
    console.log("------------------------------");

    let [thriftWallet, thriftWalletConfig, thriftWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'thriftWallet'
    }, {
        'key': 'thrift_key'
    });
    let [stewardThriftDid, stewardThriftKey, thriftStewardDid, thriftStewardKey] = await IndyHelper.onboarding(poolHandle,
        'Sovrin Steward', stewardWallet, stewardDid, 'Thrift', thriftWallet);

    console.log("==============================");
    console.log("== Getting Trust Anchor credentials - Thrift getting Verinym  (Thrift与steward端通信，生成一个Verinym Did，并写入到账本当中，最终成为TRUST_ANCHOR节点) ==");
    console.log("------------------------------");

    let thriftDid = await IndyHelper.getVerinym(poolHandle, 'Sovrin Steward', stewardWallet, stewardDid,
        stewardThriftKey, 'Thrift', thriftWallet, thriftStewardDid, thriftStewardKey, 'TRUST_ANCHOR');

    console.log("==============================");
    console.log("=== Credential Schemas Setup (开始创建证书模式)==");
    console.log("------------------------------");

    console.log("\"Government\" -> Create \"Job-Certificate\" Schema（政府创建工作证书模式）");

    /**
     * 政府节点，先通过 issuerCreateSchema 函数创建一个工作证书的模式/模板，返回该模式的ID以及模式对象
     */
    let [jobCertificateSchemaId, jobCertificateSchema] = await indy.issuerCreateSchema(governmentDid, 'Job-Certificate',
        '0.2', ['first_name', 'last_name', 'salary', 'employee_status', 'experience']);

    console.log("\"Government\" -> Send \"Job-Certificate\" Schema to Ledger");
    //将刚刚生成的模式发送到账本保存起来
    await IndyHelper.sendSchema(poolHandle, governmentWallet, governmentDid, jobCertificateSchema);

    console.log("\"Government\" -> Create \"Transcript\" Schema（政府创建成绩证明模式）");
    let [transcriptSchemaId, transcriptSchema] = await indy.issuerCreateSchema(governmentDid, 'Transcript', '1.2',
        ['first_name', 'last_name', 'degree', 'status',
            'year', 'average', 'ssn']);

    console.log("\"Government\" -> Send \"Transcript\" Schema to Ledger");
    await IndyHelper.sendSchema(poolHandle, governmentWallet, governmentDid, transcriptSchema);

    console.log("==============================");
    console.log("=== Faber Credential Definition Setup (Faber 根据 Government定义的成绩单证明的模式，创建Faber成绩证明定义，并写到账本当中)==");
    console.log("------------------------------");

    console.log("\"Faber\" -> Get \"Transcript\" Schema from Ledger（首先从账本中获取成绩证明的模式定义）");
    [, transcriptSchema] = await IndyHelper.getSchema(poolHandle, faberDid, transcriptSchemaId);

    console.log("\"Faber\" -> Create and store in Wallet \"Faber Transcript\" Credential Definition ( Faber 构造成绩证明定义，并存储在自己的钱包当中)");
    let [faberTranscriptCredDefId, faberTranscriptCredDefJson] = await indy.issuerCreateAndStoreCredentialDef(faberWallet,
        faberDid, transcriptSchema, 'TAG1', 'CL', '{"support_revocation": false}');

    console.log("\"Faber\" -> Send  \"Faber Transcript\" Credential Definition to Ledger（将刚刚生成的Faber成绩证明定义，写入到账本当中）");
    await IndyHelper.sendCredDef(poolHandle, faberWallet, faberDid, faberTranscriptCredDefJson);

    console.log("==============================");
    console.log("=== Acme Credential Definition Setup (Acme 根据 Government定义的工作证明的模式，创建Acme工作证明定义，并写到账本当中)==");
    console.log("------------------------------");

    console.log("\"Acme\" ->  Get from Ledger \"Job-Certificate\" Schema（首先从账本中获取工作证明的模式定义）");
    [, jobCertificateSchema] = await IndyHelper.getSchema(poolHandle, acmeDid, jobCertificateSchemaId);

    console.log("\"Acme\" -> Create and store in Wallet \"Acme Job-Certificate\" Credential Definition( Acme 构造工作证明定义，并存储在自己的钱包当中)\"");
    let [acmeJobCertificateCredDefId, acmeJobCertificateCredDefJson] = await indy.issuerCreateAndStoreCredentialDef(acmeWallet,
        acmeDid, jobCertificateSchema, 'TAG1', 'CL', '{"support_revocation": false}');

    console.log("\"Acme\" -> Send \"Acme Job-Certificate\" Credential Definition to Ledger（将刚刚生成的Acme工作证明定义，写入到账本当中）");
    await IndyHelper.sendCredDef(poolHandle, acmeWallet, acmeDid, acmeJobCertificateCredDefJson);

    console.log("==============================");
    console.log("=== Getting Transcript with Faber （处理Alice从Faber处获取成绩单证明）==");
    console.log("==============================");

    console.log("== Getting Transcript with Faber - Onboarding ==");
    console.log("------------------------------");

    //首先Alice创建自己的钱包
    let [aliceWallet, aliceWalletConfig, aliceWalletCredentials] = await IndyHelper.createWalletIfNotExistsAndThenOpentIt({
        'id': 'aliceWallet'
    }, {
        'key': 'alice_ley'
    });

    //然后通过onboarding函数 Faber与Alice 建立双向安全通信
    // （这个时候Faber拥有TRUSST_ANCHOR身份，而Alice没有，所以需要Faber主动建立与Alice的安全通信）
    let [faberAliceDid, faberAliceKey, aliceFaberDid, aliceFaberKey] = await IndyHelper.onboarding(poolHandle, "Faber",
        faberWallet, faberDid, 'Alice', aliceWallet);

    console.log("==============================");
    console.log("== Getting Transcript with Faber - Getting Transcript Credential （获取证书的流程）==");
    console.log("------------------------------");

    console.log("\"Faber\" -> Create \"Transcript\" Credential Offer for Alice （Faber为Alice创建成绩证明Offer，这个Offer只是告诉Alice要给他颁发一个成绩证明，但不会包含实际内容）");
    let transcriptCredOfferJson = await indy.issuerCreateCredentialOffer(faberWallet, faberTranscriptCredDefId);

    console.log("\"Faber\" -> Get key for Alice did（Faber根据通信did从账本中获取通信的verkey）");
    //这个获取到的verkey和 aliceFaberKey 其实是一样的，只是下面的步骤不仅可以从账本中读取, 同时还会将数据缓存到指定的钱包当中
    let aliceFaberVerkey = await indy.keyForDid(poolHandle, acmeWallet, aliceFaberDid);

    console.log("\"Faber\" -> Authcrypt \"Transcript\" Credential Offer for Alice（Faber通过计算出共享秘钥，将成绩单证明Offer信息加密）");
    let authcryptedTranscriptCredOffer = await indy.cryptoAuthCrypt(faberWallet, faberAliceKey, aliceFaberVerkey,
        Buffer.from(JSON.stringify(transcriptCredOfferJson), 'utf8'));

    console.log("\"Faber\" -> Send authcrypted \"Transcript\" Credential Offer to Alice（Faber将加密后的信息传送给Alice）");

    /////////////////////////////////////////////////////////
    /////// 此处省略了 Faber 将加密的信息传输给 Alice 的过程
    /////////////////////////////////////////////////////////

    console.log("\"Alice\" -> Authdecrypted \"Transcript\" Credential Offer from Faber（Alice接收到Faber传输的信息，并解密）");
    let [faberAliceVerkey, authdecryptedTranscriptCredOfferJson, authdecryptedTranscriptOffer]
        = await IndyHelper.authDecrypt(aliceWallet, aliceFaberKey, authcryptedTranscriptCredOffer);

    console.log("\"Alice\" -> Create and store \"Alice\" Master Secret in Wallet（Alice在本地创建一个MasterId，并保存在本地钱包当中）");
    //Alice在本地创建一个MasterId，并保存在本地钱包当中，这个MasterId用于创建请求证书的请求体
    let aliceMasterSecretedId = await indy.proverCreateMasterSecret(aliceWallet, null);

    console.log("\"Alice\" -> Get \"Faber Transcript\" Credential Definition from Ledger（Alice根据收到的信息中的证明Id从账本中查询该证明的详细信息）");
    let faberTranscriptCredDef;
    //Alice根据收到的信息中的证明Id从账本中查询该证明的详细信息
    [faberTranscriptCredDefId, faberTranscriptCredDef] = await IndyHelper.getCredDef(poolHandle, aliceFaberDid, authdecryptedTranscriptOffer['cred_def_id']);

    console.log("\"Alice\" -> Create \"Transcript\" Credential Request for Faber（Alice创建一个向Faber请求成绩证明的详细信息的请求体）");
    let [transcriptCredRequestJson, transcriptCredRequestMetadataJson] = await indy.proverCreateCredentialReq(aliceWallet,
        aliceFaberDid, authdecryptedTranscriptCredOfferJson, faberTranscriptCredDef, aliceMasterSecretedId);

    console.log("\"Alice\" -> Authcrypt \"Transcript\" Credential Request for Faber（将请求信息加密）");
    //将请求信息加密
    let authcryptedTranscriptCredRequest = await indy.cryptoAuthCrypt(aliceWallet, aliceFaberKey, faberAliceKey,
        Buffer.from(JSON.stringify(transcriptCredRequestJson), 'utf8'));

    console.log("\"Alice\" -> Send authcrypted \"Transcript\" Credential Request to Faber（Alice将请求信息发送给Faber）");

    ////////////////////////////////////////////////////////////
    //////// 此处省略了 Alice 将加密后的请求信息传输给 Faber 的过程
    ////////////////////////////////////////////////////////////

    console.log("\"Faber\" -> Authdecrypt \"Transcript\" Credential Request from Alice（Faber 将接收到的密文解密）");
    //Faber 将接收到的密文解密
    let authdecryptedTranscriptCredRequestJson;
    [aliceFaberVerkey, authdecryptedTranscriptCredRequestJson] = await IndyHelper.authDecrypt(faberWallet,
        faberAliceKey, authcryptedTranscriptCredRequest);

    console.log("\"Faber\" -> Create \"Transcript\" Credential for Alice（Faber 为 Alice 创建证书，这个证书中包含各个属性的值）");
    // note that encoding is not standardized by Indy except that 32-bit integers are encoded as themselves. IS-786
    let transcriptCredValues = {
        "first_name": {"raw": "Alice", "encoded": "1139481716457488690172217916278103335"},
        "last_name": {"raw": "Garcia", "encoded": "5321642780241790123587902456789123452"},
        "degree": {"raw": "Bachelor of Science, Marketing", "encoded": "12434523576212321"},
        "status": {"raw": "graduated", "encoded": "2213454313412354"},
        "ssn": {"raw": "123-45-6789", "encoded": "3124141231422543541"},
        "year": {"raw": "2015", "encoded": "2015"},
        "average": {"raw": "5", "encoded": "5"}
    };

    let [transcriptCredJson] = await indy.issuerCreateCredential(faberWallet, transcriptCredOfferJson,
        authdecryptedTranscriptCredRequestJson, transcriptCredValues, null, -1);

    console.log("\"Faber\" -> Authcrypt \"Transcript\" Credential for Alice（Faber 将生成的证书加密）");
    //Faber 将生成的证书加密
    let authcryptedTranscriptCtedJson = await indy.cryptoAuthCrypt(faberWallet, faberAliceKey, aliceFaberVerkey,
        Buffer.from(JSON.stringify(transcriptCredJson), 'utf8'));

    console.log("\"Faber\" -> Send authcrypted \"Transcript\" Credential to Alice（Faber 将加密后的信息传输给 Alice）");

    /////////////////////////////////////////////////////////////
    //////// 此处省略了 Faber 将加密后的证书信息传输给 Alice 的过程
    /////////////////////////////////////////////////////////////

    console.log("\"Alice\" -> Authdecrypted \"Transcript\" Credential from Faber（Alice 将收的的密文解密）");
    //Alice 将收的的密文解密
    let [, authdecryptedTranscriptCredJson] = await IndyHelper.authDecrypt(aliceWallet, aliceFaberKey, authcryptedTranscriptCtedJson);

    console.log("\"Alice\" -> Store \"Transcript\" Credential from Faber（Alice 验证将解密后得到的证书的有效性，并保存到自己的钱包当中）");
    //Alice 验证将解密后得到的证书的有效性，并保存到自己的钱包当中Alice 验证将解密后得到的证书的有效性，并保存到自己的钱包当中
    await indy.proverStoreCredential(aliceWallet, null, transcriptCredRequestMetadataJson, authdecryptedTranscriptCredJson,
        faberTranscriptCredDef, null);

}