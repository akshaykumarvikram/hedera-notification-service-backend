require("dotenv").config();

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const fs = require("fs");
const Web3 = require("web3");
const web3 = new Web3();
const { AccountId } = require("@hashgraph/sdk");

const { signData, verifyData } = require("./auth-validation");

const serviceAccount = require("./hedera-notification-service-firebase-adminsdk-l8d4x-7c5042441a.json");
const { channel } = require("diagnostics_channel");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// admin.initializeApp({
//   serviceAccountId: 'firebase-adminsdk-l8d4x@hedera-notification-service.iam.gserviceaccount.com',
// })

// Helper Function
function decodeEvent(abi, eventName, log, topics) {
  const eventAbi = abi.find(
    (event) => event.name === eventName && event.type === "event"
  );
  const decodedLog = web3.eth.abi.decodeLog(eventAbi.inputs, log, topics);
  return decodedLog;
}

const getEventsFromMirror = async (contractId, abi) => {
  const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/${contractId.toString()}/results/logs?order=desc`;
  try {
    let messages = [];
    const response = await axios.get(url);
    response.data.logs.forEach(log => {
      const event = decodeEvent(abi, "LogMessage", log.data, log.topics.slice(1));
      messages.push({
        sender: log["root_contract_id"],
        receiver: event.message.slice(4, 16),
        message: event.message.slice(28, -1),
        timestamp: log.timestamp
      });
    });
    return messages
  } catch (err) {
    console.error("Encountered error while fetching data from mirrornode", err);
    return []
  }
}

// Express API
const app = express();
app.use(cors({ origin: true }));

app.post("/authNounce", async (request, response) => {
  try {
    console.log(request.body);
    if (request.method !== "POST") {
      return response.sendStatus(400);
    }

    if (!request.body.accountid) {
      return response.sendStatus(400);
    }

    // Get the user document for that address
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.body.accountid)
      .get();

    if (userDoc.exists) {
      // The user document exists already, so just return the nonce
      const existingNonce = userDoc.data()?.nonce;
      let payload = {
        url: "Hedera Notification Service",
        data: existingNonce,
      };
      signed_nounce = signData(payload);
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
      console.log({ signed_nounce: signed_nounce, payload: payload });
      signed_nounce.signature = btoa(
        String.fromCharCode(...signed_nounce.signature)
      );
      console.log({ signed_nounce: signed_nounce, payload: payload });
      return response
        .status(200)
        .json({ signed_nounce: signed_nounce, payload: payload });
    } else {
      // The user document does not exist, create it first
      const generatedNonce = Math.floor(Math.random() * 1000000).toString();

      // Create an Auth user
      const createdUser = await admin.auth().createUser({
        uid: request.body.accountid,
      });

      // Associate the nonce with that user
      await admin.firestore().collection("users").doc(createdUser.uid).set({
        nonce: generatedNonce,
      });

      let payload = {
        url: "Hedera Notification Service",
        data: generatedNonce,
      };
      signed_nounce = signData(payload);
      console.log({ signed_nounce: signed_nounce, payload: payload });
      signed_nounce.signature = btoa(
        String.fromCharCode(...signed_nounce.signature)
      );
      console.log({ signed_nounce: signed_nounce, payload: payload });
      return response
        .status(200)
        .json({ signed_nounce: signed_nounce, payload: payload });
    }
  } catch (err) {
    console.log(err);
    return response.sendStatus(500);
  }
});

app.post("/serverSignPayload", (request, response) => {
  try {
    console.log(request.body);
    if (request.method !== "POST") {
      return response.sendStatus(400);
    }
    if (!request.body.account_id || !request.body.nounce) {
      return response.sendStatus(400);
    }
    let payload = {
      url: request.body.nonce,
      data: request.body.nonce,
    };
    signed_nounce = signData(payload);
    signed_nounce.signature = btoa(
      String.fromCharCode(...signed_nounce.signature)
    );
    return response
      .status(200)
      .json({ signed_nounce: signed_nounce, payload: payload });

  } catch (err) {
    return response.status(500).send(err)
  }
})

app.post("/serverVerifyPayload", async (request, response) => {
  try {
    // console.log(request.body)
    if (request.method !== "POST") {
      return response.sendStatus(400);
    }

    if (
      !request.body.authres ||
      !request.body.authres.signedPayload ||
      !request.body.authres.success
    ) {
      return response.sendStatus(400);
    }

    let auth_account_id = request.body.account_id;
    let url =
      "https://testnet.mirrornode.hedera.com/api/v1/accounts/" +
      auth_account_id;
    try {
      let resp = await axios.get(url);
      // console.log("Account into response data: ", resp.data);
      let signed_payload = request.body.authres.signedPayload;
      let original_payload = signed_payload.originalPayload;
      let server_signature = Uint8Array.from(
        atob(signed_payload.serverSignature),
        (c) => c.charCodeAt(0)
      );
      signed_payload.serverSignature = server_signature;
      let user_signature = Uint8Array.from(
        atob(request.body.authres.userSignature),
        (c) => c.charCodeAt(0)
      );
      let server_key_verified = verifyData(
        original_payload,
        process.env.PUBLIC_KEY,
        server_signature
      );
      let user_key_verified = verifyData(
        signed_payload,
        resp.data.key.key,
        user_signature
      );
      if (server_key_verified && user_key_verified) {
        return response.sendStatus(200)
      } else {
        return response.status(400).send("Signature cannot be verified")
      }

    } catch (err) {
      return response.status(500).send(err)
    }
  } catch (e) {
    return response.status(500).send(e);
  }
})

app.post("/verifyAuthSignature", async (request, response) => {
  try {
    // console.log(request.body)
    if (request.method !== "POST") {
      return response.sendStatus(400);
    }

    if (
      !request.body.authres ||
      !request.body.authres.signedPayload ||
      !request.body.authres.success
    ) {
      return response.sendStatus(400);
    }

    let auth_account_id = request.body.account_id;
    let url =
      "https://testnet.mirrornode.hedera.com/api/v1/accounts/" +
      auth_account_id;
    try {
      let resp = await axios.get(url);
      // console.log("Account into response data: ", resp.data);
      let signed_payload = request.body.authres.signedPayload;
      let original_payload = signed_payload.originalPayload;
      let server_signature = Uint8Array.from(
        atob(signed_payload.serverSignature),
        (c) => c.charCodeAt(0)
      );
      signed_payload.serverSignature = server_signature;
      let user_signature = Uint8Array.from(
        atob(request.body.authres.userSignature),
        (c) => c.charCodeAt(0)
      );
      let server_key_verified = verifyData(
        original_payload,
        process.env.PUBLIC_KEY,
        server_signature
      );
      let user_key_verified = verifyData(
        signed_payload,
        resp.data.key.key,
        user_signature
      );
      if (server_key_verified && user_key_verified) {
        let account_id = request.body.account_id;
        // Get the nonce for this address
        const userDocRef = admin
          .firestore()
          .collection("users")
          .doc(account_id);
        // update nonce
        await userDocRef.update({
          nonce: Math.floor(Math.random() * 1000000).toString(),
        });
        // Create a custom token for the specified address
        console.log("================account_id==============", account_id);
        // const createdUser = await admin.auth().createUser({
        //     uid: request.body.account_id,
        // });
        const user = await admin.auth().getUser(account_id);
        console.log("===========User from Firebase============", user);
        const firebaseToken = await admin.auth().createCustomToken(user.uid);
        const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(account_id)
          .get();
        const fcmToken = userDoc.data()?.fcmToken;
        let response_data = {
          token: firebaseToken,
        };
        if (fcmToken) {
          // Check if Token is Valid.
          try {
            await admin.messaging().send({ token: fcmToken }, true);
            response_data["fcmToken"] = fcmToken;
          } catch {
            // Token is Invalid remove from database.
            console.log(
              `FCM Token: ${fcmToken} for account_id: ${account_id} is invalid. Removing it from the database`
            );
            await admin
              .firestore()
              .collection("users")
              .doc(request.body.accountid)
              .update({
                fcmToken: admin.firestore.FieldValue.delete(),
              });
          } finally {
            return response.status(200).json(response_data);
          }
        } else {
          return response.status(200).json(response_data);
        }
      } else {
        // The signature could not be verified
        console.log(
          `Signature cannot be verified! server_key_verified: ${server_key_verified} and user_key_verified: ${user_key_verified}`
        );
        return response.sendStatus(401);
      }
    } catch (e) {
      console.log(e);
      return response.sendStatus(500);
    }
  } catch (err) {
    console.log(err);
    return response.sendStatus(500);
  }
});

app.post("/fcmToken", async (request, response) => {
  try {
    console.log(request.body);
    if (request.method !== "POST") {
      return response.sendStatus(400);
    }

    if (!request.body.account_id || !request.body.fcmToken) {
      return response.sendStatus(400);
    }

    // Get the user document for that address
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.body.account_id)
      .get();

    if (userDoc.exists) {
      // Add notification to the token
      await admin
        .firestore()
        .collection("users")
        .doc(request.body.account_id)
        .update({
          fcmToken: request.body.fcmToken,
        });
      return response.header("Access-Control-Allow-Origin", "*").status(200);
    } else {
      console.log(`AccountID: ${request.body.account_id} doesn't exist`);
      return response.sendStatus(400);
    }
  } catch (err) {
    console.log(err);
    return response.sendStatus(500);
  }
});

app.post("/message", async (request, response) => {
  try {
    console.log(request.body);
    if (request.method !== "POST") {
      return response.status(400).send("Must be a post request");
    }
    console.log("request.body.sender", request.body.sender, typeof request.body);
    if (!request.body.sender) {
      return response.status(400).send(`Missing sender: ${request.body.sender}`);
    }
    if (!request.body.messageType) {
      return response.status(400).send(`Missing Message Type: ${request.body.messageType}`);
    }
    if (!request.body.message) {
      return response.status(400).send(`Missing Message: ${request.body.message}`);
    }

    // Check if sender channel exist
    const channelDoc = await admin
      .firestore()
      .collection("channels")
      .doc(request.body.sender)
      .get();

    if (channelDoc.exists) {
      const messageType = String(request.body.messageType).toLowerCase();
      if (messageType === "personalized") {
        // Validate inputs
        if (!request.body.receiver) {
          return response.status(400).send("Missing receiver");
        }

        // Get receiver subscription data
        const subDoc = await admin
          .firestore()
          .collection("users")
          .doc(request.body.receiver)
          .collection("subscriptions")
          .doc(request.body.sender)
          .get();

        if (subDoc.exists) {
          const subs = subDoc.data();
          if (subs[messageType]) {
            // Update user inbox
            const message = {
              receiver: request.body.receiver,
              sender: request.body.sender,
              channelName: channelDoc.data().displayName,
              sentTime: new Date(),
              readTime: null,
              message: request.body.message,
              messageType: messageType,
              logoPath: channelDoc.data().logoPath,
            };
            // const inboxType = `${messageType}Inbox`;
            const inbox = "inbox"

            const userInboxDoc = await admin
              .firestore()
              .collection("users")
              .doc(request.body.receiver)
              .collection(inbox)
              .add(message);

            const sendInboxDoc = await admin
              .firestore()
              .collection("channels")
              .doc(request.body.sender)
              .collection(inbox)
              .doc(userInboxDoc.id)
              .set(message);
            // Send a web notification if FCM regestraction token exists for the user.
            const registrationToken = await admin
              .firestore()
              .collection("users")
              .doc(request.body.receiver)
              .get("fcmToken");

            if (registrationToken.exists) {
              const message = {
                notification: {
                  title: channelDoc.data().displayName,
                  body: request.body.message
                },
                token: registrationToken
              }
              try {
                await admin.messaging().send(message)
              } catch (e) {
                console.log("Encountered error while sendign notification: ", e);
              }
            }
            return response.sendStatus(200);
          } else {
            return response
              .status(400)
              .send(
                `receiver: ${request.body.receiver} is not subscribed to receive ${messageType} messages.`
              );
          }
        } else {
          return response
            .status(400)
            .send(
              `receiver: ${request.body.receiver} is not subscribed to ${request.body.sender}`
            );
        }
      } else if (messageType === "broadcast") {
        // Get Subscribers for the channel
        const snapshot = await admin
          .firestore()
          .collection("channels")
          .doc(request.body.sender)
          .collection("subscribers")
          .get();
        let subscribers = [];
        snapshot.docs.map((doc) => {
          if (doc.data().broadcast) {
            subscribers.push(doc.id);
          }
        });
        // Add message to the channel
        let message = {
          receiver: subscribers,
          sender: request.body.sender,
          channelName: channelDoc.data().displayName,
          sentTime: new Date(),
          readTime: null,
          message: request.body.message,
          messageType: messageType,
          logoPath: channelDoc.data().logoPath,
        };
        const sendInboxDoc = await admin
          .firestore()
          .collection("channels")
          .doc(request.body.sender)
          .collection("inbox")
          .add(message);
        const messageId = sendInboxDoc.id;
        let batch = admin.firestore().batch();
        for (sub of subscribers) {
          message.receiver = sub;
          let ref = admin
            .firestore()
            .collection("users")
            .doc(sub)
            .collection("inbox")
            .doc(messageId);
          batch.set(ref, message);
          console.log(ref, sub, message)
        }
        await batch.commit();
        // Send notifications
        // TODO: Change to topic messaging
        const usersSnapshot = await admin.firestore().collection("users").orderBy("fcmToken").get();
        let registrationTokens = []
        usersSnapshot.docs.map((doc) => {
          if ((doc.data().fcmToken) && (subscribers.indexOf(doc.id) > -1)) {
            registrationTokens.push(doc.data().fcmToken);
          }
        })
        const broadcastMessage = {
          notification: {
            title: channelDoc.data().displayName,
            body: request.body.message
          },
          tokens: registrationTokens
        }
        try {
          await admin.messaging().sendMulticast(broadcastMessage);
        } catch (err) {
          console.log("Error encountered while sending broadcast Notifications :", err);
        }

        return response.sendStatus(200);


      } else {
        return response
          .status(400)
          .send(`Invaid messageType: ${request.body.messageType}`);
      }
    } else {
      return response
        .status(400)
        .send(`sender: ${request.body.sender} doesn't exist`);
    }
  } catch (err) {
    console.log(err);
    return response.status(500).send(err);
  }
});

app.get("/onchainScan", async (request, response) => {
  try {
    const contractDoc = await admin.firestore().collection("backend").doc("onchain-scanner").get();
    const abi = JSON.parse(contractDoc.data().abi);
    const contractId = contractDoc.data().contractId;
    const lastScanTimestamp = (contractDoc.data().lastScanTimestamp === "") ? new Date(contractDoc.data().lastScanTimestamp) : null;
    const messages = await getEventsFromMirror(contractId, abi);
   for (let message of messages) {
      // Check if the message is already processed.
      const messageTimestamp = new Date(parseInt(message.timestamp.replace(".","").slice(0,13)));
      console.log("lastScanTimestamp:", lastScanTimestamp, "messageTimestamp: ", messageTimestamp)
      if (lastScanTimestamp >= messageTimestamp) {
        console.log("Message already processed", message);
        break;
      }
      // Identify channel associated with sender.
      const query = await admin.firestore().collection("channels").where("smartContractAddress", "==", message.sender).get();
      let channel;
      if (!query.empty) {
        channel = query.docs[0].data();
        channel["id"] = query.docs[0].id;

      } else {
        console.log("Unable to identify the onchain message sender: ", message.sender);
        continue
      }
      // Identify Receiver and Check if the Receiver has subscribed to the channel
      const subDoc = await admin
        .firestore()
        .collection("users")
        .doc(message.receiver)
        .collection("subscriptions")
        .doc(channel.id)
        .get();

      if (!subDoc.exists || !subDoc.data().broadcast) {
        console.log("User doesn't exist or hasn't subscribed to receive onchain notifications", message);
        continue
      }
      // Add message to firestore
      const docData = {
        receiver: message.receiver,
        sender: channel.id,
        onchainContractId: message.sender,
        channelName: channel.displayName,
        sentTime: new Date(),
        readTime: null,
        message: message.message,
        messageType: "onchain",
        logoPath: channel.logoPath,
      };
      const userInboxDoc = await admin
        .firestore()
        .collection("users")
        .doc(message.receiver)
        .collection("inbox")
        .add(docData);
      const sendInboxDoc = await admin
        .firestore()
        .collection("channels")
        .doc(channel.id)
        .collection("inbox")
        .doc(userInboxDoc.id)
        .set(docData);
      // Send a web notification if FCM regestraction token exists for the user.
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(message.receiver)
        .get();
      if (userDoc.get("fcmToken")) {
        const notification = {
          notification: {
            title: channel.displayName,
            body: message.message
          },
          token: userDoc.data().fcmToken
        }
        try {
          await admin.messaging().send(notification)
        } catch (e) {
          console.log("Encountered error while sendign notification: ", e);
        }
      }
    }
    if (messages.length > 0){
      const newLastScanTimestamp = new Date(parseInt(messages[0].timestamp.replace(".","").slice(0,13)));
      await admin.firestore().collection("backend").doc("onchain-scanner").update({
        lastScanTimestamp : newLastScanTimestamp
      });
    }
    return response.sendStatus(200)
  } catch (err) {
    console.log("Error encountered in onchain scanner: ", err)
    return response.status(500).send(err)
  }


});

exports.expressApi = functions.https.onRequest(app);
