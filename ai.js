const admin = require("firebase-admin");
const brain = require('brain.js')
const moment = require('moment')
const serviceAccount = require("./private/firebasekey.json");
const fetch = require('node-fetch')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const db = admin.firestore()
const stationList = require('./private/stationList');
console.log(stationList.length)
const stationListConversion = 100

findStationCode = (abbr) => {
  let item = stationList.filter(i => {
    return i.abbr === abbr
  })

  return stationList.indexOf(item[0])
}
convertStationCode = (code) => {
  console.log('raw', code.abbr, (code.abbr*stationListConversion))
  console.log('result', Math.round(code.abbr*stationListConversion))
  return stationList[Math.round(code.abbr*stationListConversion)]
}

createTrainingData = (trips) => {
  let data = []
  trips.forEach(i => {
    //console.log(i.user.currentStation)
    data.push({
      input: {
        day: Number(parseInt(i.time.day, 10)) / 10,
        hour: Number(parseInt(i.time.hour, 10)) / 100,
        station: findStationCode(i.user.currentStation.abbr) / stationListConversion
      },
      output: {
        [i.user.toStation.abbr]: 1
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
    hiddenLayers: [20, 20],
    log: true,
    logPeriod: 10
  };

// create a simple recurrent neural network
  let trainingData = createTrainingData(trips)
  //console.log(trainingData)
  const net = new brain.NeuralNetwork(config)
  net.train(trainingData)
  console.log(net.run(trainingData[trainingData.length-1].input))
})