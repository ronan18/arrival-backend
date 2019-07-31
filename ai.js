const admin = require("firebase-admin");
const brain = require('brain.js')
const moment = require('moment')
const serviceAccount = require("./private/firebasekey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const db = admin.firestore()
createTrainingData = (trips) => {
  let data = []
  trips.forEach(i => {
    //console.log(i.user.currentStation)
    data.push({
      input: {
        day: i.time.day,
        hour: Number(parseInt(i.time.hour, 10))/24,
        station: i.user.currentStation.abbr
      },
      output: {
        abbr: i.user.toStation.abbr
      }
    })
  })
  return data
}
db.collection('accounts').doc("passphrase").collection('trips').get().then(snap => {
  const trips = []
  snap.forEach(doc => {
   // console.log(doc.id, '=>', doc.data());
    trips.push(doc.data())
  });
  console.log('trip data loaded')
  const config = {
    inputSize: 20,
    inputRange: 20,
    hiddenLayers: [20, 20],
    outputSize: 20,
    learningRate: 0.01,
    decayRate: 0.999,
  };

// create a simple recurrent neural network
  let trainingData = createTrainingData(trips)
  console.log(trainingData)
  const net = new brain.recurrent.NeuralNetwork(config)
  net.train(trainingData).catch(e=> {console.log(e)});
})