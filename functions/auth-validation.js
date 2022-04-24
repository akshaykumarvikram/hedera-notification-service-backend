require("dotenv").config();

const { Client, PrivateKey, PublicKey } = require("@hashgraph/sdk");


const ACCOUNT_ID = process.env.ACCOUNT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Create hashgraph client
function getClient(){
    const client = Client.forTestnet();
    client.setOperator(ACCOUNT_ID, PRIVATE_KEY);
    return client
};


// Signing Functionality
function signData(data){
    const privateKey = PrivateKey.fromString(PRIVATE_KEY);
    const publicKey = privateKey.publicKey;

    let bytes = new Uint8Array(Buffer.from(JSON.stringify(data)));
    let signature = privateKey.sign(bytes);
    // let signature = btoa(String.fromCharCode(...new Uint8Array(privateKey.sign(bytes))));
    // console.log("signing verified", publicKey.verify(bytes, signature), bytes.length, signature.length);
    return {
        signature: signature,
        serverSigningAccount: ACCOUNT_ID
    };
}

function verifyData(data, publicKey, signature){
    const pubKey = PublicKey.fromString(publicKey)
    let bytes = new Uint8Array(Buffer.from(JSON.stringify(data)));
    console.log("bytes", bytes.length, "signature", signature.length)
    let verify = pubKey.verify(bytes, signature);
    return verify
};

module.exports = { 
    getClient, 
    signData, 
    verifyData 
};
