const indy = require('indy-sdk');

/**
 * 如果钱包不存在则创建它，然后打开钱包，返回 [钱包的句柄, 钱包的config， 钱包的credentials]
 * @param config            id->安全钱包的名字，在本地存储的时候会用这个名字
 * @param credentials       key->这个key用来获Master Secret
 * @returns {Promise<*[]>}
 */
async function createWalletIfNotExistsAndThenOpentIt(config, credentials) {
    try {
        await indy.createWallet(config, credentials);
    } catch (e) {
        if (e.message !== "WalletAlreadyExistsError") {
            throw e;
        }
    }
    let stewardWallet = await indy.openWallet(config, credentials);
    return [stewardWallet, config, credentials];
}


/**
 * 通过seed生成确定的did，并保存在钱包里面
 * @returns {Promise<void>}
 */
function createAndStoreDidBySeed(walletHandle, seed) {
    return indy.createAndStoreMyDid(walletHandle, {
        'seed': seed
    })
}

/**
 * 构造并发送一个NYM请求
 *
 * NYM transaction说明：
 *      The NYM transaction can be used for creation of new DIDs that is known to that ledger, the setting and rotation of a verification key, and the setting and changing of roles
 *      一个NYM transaction可以用来：
 *          1. 忘账本里写入一个did，让did为全局账本所熟知，可以被查阅
 *          2. 设置一个did对应的轮转验证秘钥
 *          3. 修改一个did对应的身份
 * @param poolHandle            节点池的句柄
 * @param walletHandle          提交transaction的client的钱包，根据Did，可以查阅到其对应的公私钥对，可以用来对请求体进行签名
 * @param Did                   提交者所用的身份Did
 * @param targetId              目标 did
 * @param targetVerkey          目标 验证公钥
 * @param role                  目标角色
 *                                  default -> USER
 *                                  TRUST_STEWARD
 *                                  TRUST_ANCHOR
 * @returns {Promise<void>}
 */
async function sendNym(poolHandle, walletHandle, Did, targetId, targetVerkey, role) {
    //构造请求
    let nymRequest = await indy.buildNymRequest(Did, targetId, targetVerkey, null, role);
    //将请求用提交者的私钥签名，并提交事务给账本，参与共识
    return indy.signAndSubmitRequest(poolHandle, walletHandle, Did, nymRequest);
}

/**
 * onboarding函数实现在两个节点建立连接，其中发起端必须要具有 THRUST_ANCHOR 身份
 * @param poolHandle
 * @param From
 * @param fromWallet
 * @param fromDid
 * @param to
 * @param toWallet
 * @returns {Promise<*[]>}
 */
async function onboarding(poolHandle, From, fromWallet, fromDid, to, toWallet,) {
    console.log(`\"${From}\" > Create and store in Wallet \"${From} ${to}\" DID`);

    //创建一个临时的Did，仅用于和对端建立安全连接
    let [fromToDid, fromToKey] = await indy.createAndStoreMyDid(fromWallet, {});

    console.log(`\"${From}\" > Send Nym to Ledger for \"${From} ${to}\" DID`);
    //将刚生成的Did，告知给账本
    await sendNym(poolHandle, fromWallet, fromDid, fromToDid, fromToKey, null);

    //构建一个请求体，实际项目中，这个请求体应该发送到目标设备上
    let connectionRequest = {
        did: fromToDid,             //发起端用于通信的Did（这个Did已经为账本所知，所以可以用这个Did在账本中查询到对应的Verkey）
        nonce: 123456789            //声明的随机值，实际项目中应该随机生成，并只对当前连接有效
    };


    ///////////////////////////////////////////////////////////////////////
    ///////// 下面这部分代码应该在目标设备收到发起端的请求之后执行
    ///////////////////////////////////////////////////////////////////////

    console.log(`\"${to}\" > Create and store in Wallet \"${to} ${From}\" DID`);

    //同样创建一个临时的Did，仅用于安全通信
    let [toFromDid, toFromKey] = await indy.createAndStoreMyDid(toWallet, {});

    console.log(`\"${to}\" > Get key for did from \"${From}\" connection request`);

    /**
     * keyForDid 函数会根据提供的Did，从poolHandle指向的节电池的账本中读取这个Did相关连的信息，并把这些数据缓存到本地的钱包当中
     * 如果希望只查询本地缓存，而不是查询账本，可以调用 keyForLocalDid
     *
     * => 最终会在Promise的回调当中返回该Did对应的验证公钥（Verkey），如果有需要的话可以用这个验证公钥来验证收到的请求数据没有被篡改
     *    （不过在这个示例当中，请求数据是明文传送的，也没有加签名，不需要验证），这个示例当中则用这个公钥加密Response信息，因为私钥
     *    只在Did的所有者的钱包中包含，也就意味着只有发起请求的客户端可以解密这个Response
     */
    let fromToVerkey = await indy.keyForDid(poolHandle, toWallet, connectionRequest.did);

    console.log(`\"${to}\" > Anoncrypt connection response for \"${From}\" with \"${to} ${From}\" DID, verkey and nonce`);

    //构造返回体
    let connectionResponse = JSON.stringify({
        'did': toFromDid,                       //目标客户端用于本次连接安全通信的Did
        'verkey': toFromKey,                    //目标客户端用于本次连接安全通信的验证公钥
        'nonce': connectionRequest['nonce']     //request中包含的nonce，仅用于本次连接
    });
    //用发起者的公钥对返回消息进行加密，得到加密后的返回信息（然后实际项目中，应该将这个返回信息返回给发送端）,返回的是一个Buffer对象
    let anoncryptedConnectionResponse = await indy.cryptoAnonCrypt(fromToVerkey, Buffer.from(connectionResponse, 'utf8'));

    console.log(`\"${to}\" > Send anoncrypted connection response to \"${From}\"`);


    ////////////////////////////////////////////////////////////////////////
    //////// 下面这部分代码应当在发起连接请求的一端，收到目标设备返回的加密信息后执行
    ////////////////////////////////////////////////////////////////////////
    console.log(`\"${From}\" > Anondecrypt connection response from \"${to}\"`);

    //将收到的Buffer对象用存在本地钱包中的私钥解密之后，按utf8编码转为String
    let res = (await indy.cryptoAnonDecrypt(fromWallet, fromToKey, anoncryptedConnectionResponse)).toString('utf8');
    //将JSON串转为对象
    let decryptedConnectionResponse = JSON.parse(res);

    console.log(`\"${From}\" > Authenticates \"${to}\" by comparision of Nonce`);
    //判断返回的nonce是否与请求的nonce相匹配
    if (connectionRequest['nonce'] !== decryptedConnectionResponse['nonce']) {
        throw Error("nonce don't match!!");
    }

    console.log(`\"${From}\" > Send Nym to Ledger for \"${to} ${From}\" DID`);
    //将目标设备用于本次通信的Did和Verkey存到账本当中。
    //(值得一提的是，现在发起端应该默认是THRUST_ANCHOR，而对端不是，所以只能在发起端写入账本，而不能在目标设备上写入，目标设备现在还不具有THRUST_ANCHOR这一层身份，不能操作账本)
    await sendNym(poolHandle, fromWallet, fromDid, decryptedConnectionResponse['did'], decryptedConnectionResponse['verkey'], null);

    return [fromToDid, fromToKey, toFromDid, toFromKey, decryptedConnectionResponse];
}

/**
 * to 端 通过 from 端 发布自己生成的Did作为自己的Verinym Did，这个Did将拥有role角色对应的身份
 * @param poolHandle
 * @param From
 * @param fromWallet
 * @param fromDid
 * @param fromToKey
 * @param to
 * @param toWallet
 * @param toFromDid
 * @param toFromKey
 * @param role
 * @returns {Promise<void>}
 */
async function getVerinym(poolHandle, From, fromWallet, fromDid, fromToKey, to, toWallet, toFromDid, toFromKey, role) {
    /////////////////////////////////////////////////////////////////
    //////// 下面这段代码应该在 to 一端执行，生成一个Did，并计算出共享秘钥
    //////// 用于加密要发送的数据，并将加密之后的数据发送给 from 一端
    ////////////////////////////////////////////////////////////////

    console.log(`\"${to}\" > Create and store in Wallet \"${to}\" new DID"`);
    //在 to 一端的本地钱包当中生成一个Did （现在是 to 一端想通过 from 一端向账本中写入一个自己的Verinym）
    let [toDid, toKey] = await indy.createAndStoreMyDid(toWallet, {});

    console.log(`\"${to}\" > Authcrypt \"${to} DID info\" for \"${From}\"`);
    let didInfoJson = JSON.stringify({
        'did': toDid,
        'verkey': toKey
    });

    //通过发送者和接受者（to 和 from）用于他们之间安全通信的公钥，可以计算出一个共享秘钥，用这个共享秘钥加密要发送的数据
    let authcryotedDidInfo = await indy.cryptoAuthCrypt(toWallet, toFromKey, fromToKey, Buffer.from(didInfoJson, 'utf8'));

    console.log(`\"${to}\" > Send authcrypted \"${to} DID info\" to ${From}`);

    //////////////////////////////////////////////////////////////////
    ///////// 下面这段代码应该在 from 一端收到加密后的信息之后执行
    /////////////////////////////////////////////////////////////////
    console.log(`\"${From}\" > Authdecrypted \"${to} DID info\" from ${to}`);

    //首先利用Sender(to 一端)的公钥和自己的私钥计算出共享秘钥，用于解密，并得到明文信息
    let [senderVerkey, authdecryptedDidInfo] =
        await indy.cryptoAuthDecrypt(fromWallet, fromToKey, Buffer.from(authcryotedDidInfo));

    //将明文的JSON数据转为js对象
    let authdecryptedDidInfoJson = JSON.parse(authdecryptedDidInfo);

    console.log(`\"${From}\" > Authenticate ${to} by comparision of Verkeys`);

    // 根据 sender (to 一端)的did，获得在账本中该did对应的verkey
    let retrievedVerkey = await indy.keyForDid(poolHandle, fromWallet, toFromDid);

    // 比较verykey是否一致
    if (senderVerkey !== retrievedVerkey) {
        throw Error("Verkey is not the same");
    }

    console.log(`\"${From}\" > Send Nym to Ledger for \"${to} DID\" with ${role} Role`);

    // from 一端将 to 一端生成的did和verkey写入到账本当中
    await sendNym(poolHandle, fromWallet, fromDid, authdecryptedDidInfoJson['did'], authdecryptedDidInfoJson['verkey'], role);

    //返回 Verinym Did 身份
    return toDid;
}

/**
 * 提交一个模式定义到账本当中, Did 所对应的身份应该是 “TRUST_ANCHOR” 级别以上的，才能对账本进行操作
 * @param poolHandle
 * @param walletHandle
 * @param Did
 * @param schema
 * @returns {Promise<*>}
 */
async function sendSchema(poolHandle, walletHandle, Did, schema) {
    let schemaRequest = await indy.buildSchemaRequest(Did, schema);
    await indy.signAndSubmitRequest(poolHandle, walletHandle, Did, schemaRequest);
}

/**
 * 提交一个证书定义到账本当中，Did 所对应的身份应该是 “TRUST_ANCHOR” 级别以上的，才能对账本进行操作
 * @param poolHandle
 * @param walletHandle
 * @param Did
 * @param credDef
 * @returns {Promise<*>}
 */
async function sendCredDef(poolHandle, walletHandle, Did, credDef) {
    let credDefRequest = await indy.buildCredDefRequest(Did, credDef);
    await indy.signAndSubmitRequest(poolHandle, walletHandle, Did, credDefRequest);
}

/**
 * 通过模式Id查询模式定义
 * @param poolHandle
 * @param did
 * @param schemaId
 * @returns {Promise<void>}
 */
async function getSchema(poolHandle, did, schemaId) {
    let getSchemaRequest = await indy.buildGetSchemaRequest(did, schemaId);
    let getSchemaReponse  = await indy.submitRequest(poolHandle, getSchemaRequest);
    return await indy.parseGetSchemaResponse(getSchemaReponse);
}

/**
 * 通过证书定义Id查询证书定义
 * @param poolHandle
 * @param did
 * @param credDefId
 * @returns {Promise<void>}
 */
async function getCredDef(poolHandle, did, credDefId) {
    let getCredDefRequest = await indy.buildGetCredDefRequest(did, credDefId);
    let getCredDefResponse = await indy.submitRequest(poolHandle, getCredDefRequest);
    return await indy.parseGetCredDefResponse(getCredDefResponse);
}


async function authDecrypt(walletHandle, key, message) {
    let [fromVerkey, decryptedMessageBuffer] = await indy.cryptoAuthDecrypt(walletHandle, key, message);
    let decryptedMessage = JSON.parse(decryptedMessageBuffer);
    let decrypredMessageJson = JSON.stringify(decryptedMessage);
    return [fromVerkey, decrypredMessageJson, decryptedMessage];
}

module.exports = {
    createWalletIfNotExistsAndThenOpentIt,
    createAndStoreDidBySeed,
    onboarding,
    getVerinym,
    sendSchema,
    sendCredDef,
    getSchema,
    getCredDef,
    authDecrypt
};