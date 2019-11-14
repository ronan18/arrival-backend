const admin = require("firebase-admin");
const express = require('express')
const app = require('express')();
const http = require('http').createServer(app);
const cors = require('cors')
const bodyParser = require('body-parser')
const brain = require('brain.js')
const moment = require('moment')
const serviceAccount = require("./private/firebasekey.json");
const fetch = require('node-fetch')
let FieldValue = require('firebase-admin').firestore.FieldValue;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const db = admin.firestore()
const stationList = require('./private/stationList');
console.log(stationList.length)
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
const port = process.env.PORT || 8082;
const router = express.Router();
const stationListConversion = 100

findStationCode = (abbr) => {
  let item = stationList.filter(i => {
    return i.abbr === abbr
  })

  return stationList.indexOf(item[0])
}
convertStationCode = (code) => {
  console.log('raw', code.abbr, (code.abbr * stationListConversion))
  console.log('result', Math.round(code.abbr * stationListConversion))
  return stationList[Math.round(code.abbr * stationListConversion)]
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
router.get('/runai/:pass', function (req, res) {
  console.log(req.params.pass)
  db.collection('accounts').doc(req.params.pass).collection('trips').get().then(snap => {
    const trips = []
    snap.forEach(doc => {
      // console.log(doc.id, '=>', doc.data());
      trips.push(doc.data())
    });
    console.log('trip data loaded')
    const config = {
     // inputLayers: 3,
      hiddenLayers: [4, 4,4],
      iterations: 10000
    };

// create a simple recurrent neural network
    let trainingData = createTrainingData(trips)
    //console.log(trainingData)
    const net = new brain.NeuralNetwork(config)
    net.train(trainingData, {
      log: (error) => console.log(error),
      logPeriod: 1000
    })
   // console.log(net.run(trainingData[trainingData.length - 1].input))
    console.log('trained', req.params.pass)

    const json = net.toJSON()
    //console.log(json)
    db.collection('accounts').doc(req.params.pass).update({net: json, netTimestamp: FieldValue.serverTimestamp()})
    res.json({success: true});
  })


});
app.use('/api', router);
app.listen(port);
console.log('Magic happens on port ' + port);
