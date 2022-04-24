const admin = require('firebase-admin')
const serviceAccount = require('C:/Users/kinga/Downloads/hedera-notification-service-firebase-adminsdk-l8d4x-7c5042441a.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const uid = "some-id";

admin.auth().createCustomToken(uid).then((customToken) => {
    console.log(customToken);
})
.catch((error) => {
    console.log("Error create token: ", error)
})