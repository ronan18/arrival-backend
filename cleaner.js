const async = require('async');
const admin = require("firebase-admin");
const fetch = require('node-fetch')
const hat = require('hat');

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
  await agenda.start();
  await agenda.every('1 day', 'clean trips')
})