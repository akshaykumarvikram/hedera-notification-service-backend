require("dotenv").config();

const functions = require("firebase-functions");
const admin = require('firebase-admin')
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { signData, verifyData } = require("./auth-validation");

const serviceAccount = require('./hedera-notification-service-firebase-adminsdk-l8d4x-7c5042441a.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})
// admin.initializeApp({
//   serviceAccountId: 'firebase-adminsdk-l8d4x@hedera-notification-service.iam.gserviceaccount.com',
// })
const app = express();

app.use(cors({ origin: true}));

app.post('/signedNounce', async(request, response) => {
    try {
        console.log(request.body)
        if (request.method !== 'POST'){
            return response.sendStatus(400);
        };

        if (!request.body.accountid) {
            return response.sendStatus(400);
        };

        // Get the user document for that address
        const userDoc = await admin
            .firestore()
            .collection('users')
            .doc(request.body.accountid)
            .get();

        if (userDoc.exists) {
            // The user document exists already, so just return the nonce
            const existingNonce = userDoc.data()?.nonce;
            let payload = {
                "url": "Hedera Notification Service",
                "data": existingNonce
            }
            signed_nounce = signData(payload)
            // console.log("signed_nounce length" , signed_nounce.signature.length)
            // console.log("signed_nounce type of" , typeof signed_nounce)
            // console.log("signed_nounce.signature type of" , typeof signed_nounce.signature)
            // let str = signed_nounce.signature.toString('base64');
            // let uint = new Uint8Array(Buffer.from(str));
            // let string = new TextDecoder().decode(signed_nounce.signature)
            // let uint2 = new TextEncoder().encode(string);
            // let base642 = btoa(String.fromCharCode(...new Uint8Array(signed_nounce.signature)))
            // let uint3 =Uint8Array.from(atob(base642), c => c.charCodeAt(0))
            // console.log("str: ", str, "uint: " ,uint);
            // console.log("string: ", string, "uint2: " ,uint2);
            // console.log("base64: ", base642, "uint3: " ,uint3);
            console.log({ signed_nounce: signed_nounce, payload: payload })
            signed_nounce.signature = btoa(String.fromCharCode(...signed_nounce.signature));
            console.log({ signed_nounce: signed_nounce, payload: payload })
            return response.status(200).json({ signed_nounce: signed_nounce, payload: payload });
        } else {
        // The user document does not exist, create it first
        const generatedNonce = Math.floor(Math.random() * 1000000).toString();

        // Create an Auth user
        const createdUser = await admin.auth().createUser({
            uid: request.body.accountid,
        });

        // Associate the nonce with that user
        await admin.firestore().collection('users').doc(createdUser.uid).set({
            nonce: generatedNonce,
        });

        let payload = {
            "url": "Hedera Notification Service",
            "data": generatedNonce
        }
        signed_nounce = signData(payload)
        console.log({ signed_nounce: signed_nounce, payload: payload })
        signed_nounce.signature = btoa(String.fromCharCode(...signed_nounce.signature));
        console.log({ signed_nounce: signed_nounce, payload: payload })
        return response.status(200).json({ signed_nounce: signed_nounce, payload: payload });
        }
    } catch (err) {
        console.log(err);
        return response.sendStatus(500);
      }
});

app.post("/verifySignature", async(request, response) => {
    try {
        // console.log(request.body)
        if (request.method !== 'POST'){
            return response.sendStatus(400);
        };

        if (!request.body.authres || !request.body.authres.signedPayload  || !request.body.authres.success) {
            return response.sendStatus(400);
        };
        
        let auth_account_id = request.body.account_id;
        let url = "https://testnet.mirrornode.hedera.com/api/v1/accounts/" + auth_account_id;
        try {
            let resp = await axios.get(url);
            // console.log("Account into response data: ", resp.data);
            let signed_payload = request.body.authres.signedPayload;
            let original_payload = signed_payload.originalPayload;
            let server_signature = Uint8Array.from(atob(signed_payload.serverSignature), c => c.charCodeAt(0))
            signed_payload.serverSignature = server_signature;
            let user_signature = Uint8Array.from(atob(request.body.authres.userSignature), c => c.charCodeAt(0))
            let server_key_verified = verifyData(original_payload, process.env.PUBLIC_KEY, server_signature);
            let user_key_verified = verifyData(signed_payload, resp.data.key.key, user_signature);
            if (server_key_verified && user_key_verified){
                let account_id = request.body.account_id;
                // Get the nonce for this address
                const userDocRef = admin.firestore().collection('users').doc(account_id);
                // update nonce
                await userDocRef.update({
                    nonce: Math.floor(Math.random() * 1000000).toString(),
                });
                // Create a custom token for the specified address
                console.log("================account_id==============", account_id)
                // const createdUser = await admin.auth().createUser({
                //     uid: request.body.account_id,
                // });
                const user = await admin.auth().getUser(account_id)
                console.log("===========User from Firebase============", user)
                const firebaseToken = await admin.auth().createCustomToken(user.uid);

                // Return the token
                return response.status(200).json({ token: firebaseToken });

            } else {
                // The signature could not be verified
                console.log(`Signature cannot be verified! server_key_verified: ${server_key_verified} and user_key_verified: ${user_key_verified}`)
                return response.sendStatus(401);
            }
        } catch (e){
            console.log(e);
            return response.sendStatus(500);
        }



    } catch(err){
        console.log(err);
        return response.sendStatus(500);
    }
});

exports.expressApi = functions.https.onRequest(app);