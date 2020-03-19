const mongo = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017'
const trainingData = require('./private/serverTraining')
const fs = require('fs');
const moment = require('moment-timezone')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const csvWriter = createCsvWriter({
  path: './private/dayhour.csv',
  header: [
    {id: 'user', title: 'user'},
    {id: 'day', title: 'day'},
    {id: 'hour', title: 'hour'},
    {id: 'inStation', title: 'inStation'},
    {id: 'outStation', title: 'outStation'},
  ]
});
const csvWriterPredictive = createCsvWriter({
  path: './private/predictive.csv',
  header: [
    {id: 'user', title: 'user'},
    {id: 'outStation', title: 'outStation'}
  ]
});
let data = []
let predictiveData = []
let userBank = []
let stationBank = []

trainingData.forEach(i => {
  let id = i["_id"]
  i.trips.forEach(trip => {
    let time = trip.time
    console.log(moment(time).tz("America/Los_Angeles").day())
    data.push({
      user: id,
      day: moment(time).tz("America/Los_Angeles").day(),
      hour: moment(time).tz("America/Los_Angeles").hour(),
      inStation: trip.from.abbr,
      outStation: trip.to.abbr
    })
    let userId
    if (userBank.indexOf(id) > -1) {
      userId = userBank.indexOf(id)
    } else {
      userBank.push(id)
      userId = userBank.indexOf(id)
    }
    let stationId
    if (stationBank.indexOf(trip.to.abbr) > -1) {
      stationId = stationBank.indexOf(trip.to.abbr)
    } else {
      stationBank.push(trip.to.abbr)
      stationId = stationBank.indexOf(trip.to.abbr)
    }
    predictiveData.push({
      user: userId,
      outStation: stationId
    })
  })

})
console.log(data)
csvWriter
.writeRecords(data)
.then(()=> console.log('The CSV file was written successfully'));

csvWriterPredictive
.writeRecords(predictiveData)
.then(()=> console.log('The CSV file was written successfully'));
console.log(stationBank)
if (false) {
  mongo.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }, async (err, client) => {
    if (err) {
      console.error(err)
      return
    }
    const db = client.db('arrival-db')

    let users = await db.collection("users").find({}, {projection: {trips: 1}}).toArray()
    //console.log(users)
    let filteredUsers = users.filter(i => {
      return i.trips
    })
    console.log(filteredUsers)
    fs.writeFile("./private/trainingData.json", JSON.stringify(filteredUsers), function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("The file was saved!");
    });

  })
}
