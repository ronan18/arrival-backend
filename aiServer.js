const admin = require("firebase-admin");
const express = require('express')
const app = require('express')();
const http = require('http').createServer(app);
const cors = require('cors')
const bodyParser = require('body-parser')
const mongo = require('mongodb').MongoClient;
const keys = require('./private/keys.json');
const url = keys.mongo.url
const brain = require('brain.js')
const moment = require('moment-timezone')
const serviceAccount = require("./private/firebasekey.json");
const fetch = require('node-fetch')
let FieldValue = require('firebase-admin').firestore.FieldValue;
const agendaUrl = url
const Agenda = require('agenda')
const agenda = new Agenda({db: {address: agendaUrl, collection: "arrival-que"}});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const stationList = require('./private/stationList');


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
createFromTrainingData = (trips) => {
  let data = []
  trips.forEach(i => {
    console.log(i, moment(i.time).tz('America/Los_Angeles').day(), moment(i.time).tz('America/Los_Angeles').hour())
    data.push({
      input: {
        day: moment(i.time).tz('America/Los_Angeles').day() / 10,
        hour: moment(i.time).tz('America/Los_Angeles').hour() / 100,
        [i.closestStation.abbr]: 1
      },
      output: {
        [i.from.abbr]: 1
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
agenda.define("log request", async job => {
  console.log("logging request", job.attrs.data)
  const data = job.attrs.data
  await db.collection('logs').insertOne({time: data.time, user: data.user, path: data.path, params: data.params}).then(res => {
    console.log("logged")
  })
})
  agenda.define('run to ai', async job => {
    console.log('running to ai', job.attrs.data.user)
    const user = job.attrs.data.user

    db.collection('users').findOne({_id: user}, (err, snap) => {
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
      console.log('trained', user)

      const json = net.toJSON()
      //console.log(json)
      db.collection('users').updateOne({_id: user}, {
        $set: {
          net: json, netTimestamp: FieldValue.serverTimestamp(),
          netLogs: trainingResults
        }
      })

    })


  });
  agenda.define('run from ai', async job => {
    console.log('running from ai', job.attrs.data.user)
    const user = job.attrs.data.user

    db.collection('users').findOne({_id: user}, (err, snap) => {
      const trips = snap.fromStationData
      const config = {
        // inputLayers: 3,
        hiddenLayers: [4, 4, 4],
        iterations: 10000
      };
      let trainingData = createFromTrainingData(trips)

      const net = new brain.NeuralNetwork(config)
      let trainingResults = net.train(trainingData, {
        log: (error) => console.log(error),
        logPeriod: 1000
      })
      // console.log(net.run(trainingData[trainingData.length - 1].input))
      console.log('trained from data ', user)

      const json = net.toJSON()
      //console.log(json)
      db.collection('users').updateOne({_id: user}, {
        $set: {
          fromNet: json,
          netTimestamp: FieldValue.serverTimestamp(),
          fromNetLogs: trainingResults
        }
      })
    })


  });
})

agenda.start();
console.log('started job processor')