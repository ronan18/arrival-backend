const admin = require("firebase-admin");
const express = require('express')
const app = require('express')();
const http = require('http').createServer(app);
const cors = require('cors')
const bodyParser = require('body-parser')
const mongo = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017'
const brain = require('brain.js')
const moment = require('moment-timezone')
const serviceAccount = require("./private/firebasekey.json");
const fetch = require('node-fetch')
let FieldValue = require('firebase-admin').firestore.FieldValue;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const stationList = require('./private/stationList');
console.log(stationList.length)
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
const port = process.env.PORT || 8082;
const router = express.Router();
const stationListConversion = 100


createTrainingData = (trips) => {
  let data = []
  trips.forEach(i => {
    console.log(i, moment(i.time).tz('America/Los_Angeles').day(), moment(i.time).tz('America/Los_Angeles').hour())
    data.push({
      input: {
        day: moment(i.time).tz('America/Los_Angeles').day() / 10,
        hour: moment(i.time).tz('America/Los_Angeles').hour() / 100,
        [i.from.abbr]: 1
      },
      output: {
        [i.to.abbr]: 1
      }
    })
  })
  return data
}
mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('arrival-db')
  router.get('/runai/:pass', function (req, res) {
    console.log(req.params.pass)
    db.collection('users').findOne({_id: req.params.pass}, (err, snap) => {
      const trips = snap.trips

      console.log('trip data loaded')
      const config = {
        // inputLayers: 3,
        hiddenLayers: [4, 4, 4],
        iterations: 10000
      };

// create a simple recurrent neural network
      let trainingData = createTrainingData(trips)
      //console.log(trainingData)
      const net = new brain.NeuralNetwork(config)
      let trainingResults = net.train(trainingData, {
        log: (error) => console.log(error),
        logPeriod: 1000
      })
      // console.log(net.run(trainingData[trainingData.length - 1].input))
      console.log('trained', req.params.pass)

      const json = net.toJSON()
      //console.log(json)
      db.collection('users').updateOne({_id: req.params.pass}, {
        $set: {
          net: json, netTimestamp: FieldValue.serverTimestamp(),
          netLogs: trainingResults
        }
      })
      res.json({success: true, trainingResults});
      res.end()
    })


  });
})

app.use('/api', router);
app.listen(port);
console.log('Magic happens on port ' + port);
