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

mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, async (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('arrival-db')
  let results = {
    totalTrips: 0,
    activeUsers: 0
  }
  let users = await db.collection("users").find({}, {
    projection: {
      _id: 1, created: 1, lastSeen: 1, netLogs: 1, trips: 1
    }
  }).toArray()
  console.log(users)
  results.users = users.length
  let netErrorTotal = 0;
  let netErrorCount = 0;
  users.forEach(user => {
    if (user.trips) {
      results.totalTrips += user.trips.length
    }
    if (user.netLogs) {
      netErrorTotal += user.netLogs.error
      netErrorCount++
    }
    if (user.lastSeen) {
      results.activeUsers++
    }

  })
  results.netErrorAvg = netErrorTotal / netErrorCount
  console.log(results)
})
