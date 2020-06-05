const async = require('async');
const admin = require("firebase-admin");
const fetch = require('node-fetch')
const hat = require('hat');
var SHA256 = require("crypto-js/sha256");
var MD5 = require("crypto-js/MD5");
var CryptoJS = require("crypto-js");
const moment = require('moment')
const stationList = require('./private/stationList');
const keys = require('./private/keys.json');
const uuidv4 = require('uuid/v4');
const bartkey = keys.bart
const mongo = require('mongodb').MongoClient;
const agendaUrl = keys.mongo.url

const Agenda = require('agenda')
const agenda = new Agenda({db: {address: agendaUrl, collection: "arrival-que"}});
const url = keys.mongo.url


mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, async (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('arrival-db')
  agenda.define('clean trips', async job => {
    console.log("cleaning")
    let analytics = {
      deleted: 0,
      saved: 0
    }
    let weekOld = moment().subtract(7, "days")
    let trips = await db.collection('trips').find({}, {_id: 1, date: 1}).toArray()
    console.log("got trips", trips.length)
    await async.forEach(trips, async (trip, callback) => {
      let date = moment(trip.date)
      if (date.isBefore(weekOld)) {
        console.log("deleting", trip.date)
        await db.collection('trips').deleteOne(trip)
        analytics.deleted++;
        console.log(analytics)
        callback()
      } else {
        console.log("keeping", trip.date)
        analytics.saved++;
        console.log(analytics)
        callback()
      }

    })
    console.log("done", analytics)
    return
  });
  agenda.define('update stations', async job => {
    console.log("updating stations")
    let list = await fetch(`http://api.bart.gov/api/stn.aspx?cmd=stns&key=${bartkey}&json=y`, {method: 'get'})
    list = await list.json()
    console.log("got bart list")
    let drop = await db.collection('stations').drop()
    console.log("dropped list", drop)
    await db.createCollection("stations")
    console.log("created stations collection")
    let result = await db.collection('stations').insertMany(list.root.stations.station)
    let hash = MD5(list.root.stations.station).toString(CryptoJS.enc.Base64)
   let currentHash =  await db.collection("system").find({_id: "stationHash"}).toArray()
    currentHash = currentHash[0]
    console.log("hash current", currentHash.hash, "new", hash,  Number(currentHash.version))
    if (currentHash.hash == hash) {
      console.log("stations match")

    } else {
      console.log("stations hash don't match",)
      let currentVersion = Number(currentHash.version)
      currentVersion++
      let hashDoc = { hash: hash, time: moment.utc().valueOf(), version: currentVersion}
      console.log(hashDoc);
      await db.collection('system').updateOne({_id: "stationHash"}, {$set: hashDoc})

    }


    console.log("done", result.insertedCount, "stations")
    return
  });

  await agenda.start();
   await agenda.every('1 day', 'clean trips')
   await agenda.every('1 day', 'update stations')
})