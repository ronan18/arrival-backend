const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const admin = require("firebase-admin");
const fetch = require('node-fetch')
const hat = require('hat');
const apiKey = hat();
const cors = require('cors')
const bodyParser = require('body-parser')
const brain = require('brain.js')
const moment = require('moment')
const stationList = require('./private/stationList');
const keys = require('./private/keys.json');
const uuidv4 = require('uuid/v4');
const bartkey = keys.bart
const mongo = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017'
console.log(stationList.length)
const aiServerPort = 8082
let stationListConversion = 100
let passPhraseCache = []
const arrivalURLs = ['http://localhost:8080', 'https://arrival.stomprocket.io', 'https://app.arrival.city']
const version = require('./package.json').version
const compression = require('compression')
app.use(compression({filter: shouldCompress}))

function shouldCompress(req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false
  }

  // fallback to standard filter function
  return compression.filter(req, res)
}

app.use(cors())
io.origins('*:*')
app.use(bodyParser.urlencoded({extended: false}))

// parse application/json
app.use(bodyParser.json())
const serviceAccount = require("./private/firebasekey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
//const db = admin.firestore()
let bartList = []

mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('arrival-db')
  fetch(`http://api.bart.gov/api/stn.aspx?cmd=stns&key=${bartkey}&json=y`, {method: 'get'}).then(list => list.json()).then(list => {
    bartList = list.root.stations.station
    db.collection('stations').drop().then(i => {
      db.collection('stations').insertMany(list.root.stations.station)
    })

  })

  function updateUser(passphrase) {

    db.collection('users').updateOne({_id: passphrase}, {$set: {lastSeen: Date.now(),}})
  }

  app.get('/', function (req, res) {
    res.status(200)
    res.send(`API v${version}`)
    res.end()
  });
  app.get('/api/v2/login', async function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        const userKey = uuidv4()
        db.collection('users').updateOne({_id: passphrase}, {$set: {key: userKey, keyGenerated: Date.now()}})
        console.log(passphrase)
        let result = {user: 'true', key: userKey, version: version}
        if (user.net) {
          result.net = user.net
        } else {
          result.net = false
        }
        res.status(200)
        res.send(result)
        res.end()
      } else {
        res.status(401)
        res.send({user: false, error: {message: 'User not found'}})
        res.end()
      }
    } else {
      res.status(401)
      res.send({error: {message: 'no user token'}})
    }
  })
  app.post('/api/v2/login', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        console.log('login', req.headers.authorization, req.body)
        updateUser(passphrase)
        const userKey = uuidv4()
        db.collection('users').updateOne({_id: passphrase}, {
          $set: {
            key: userKey, keyGenerated: Date.now(), clientVersion: req.body.clientVersion
          }
        })
        let result = {user: 'true', key: userKey, version: version}
        if (user.net) {
          result.net = user.net
        } else {
          result.net = false
        }
        res.status(200)
        res.send(result)
        res.end()
      } else {
        res.status(401)
        res.send({user: false, error: {message: 'User not found'}})
        res.end()
      }
    } else {
      res.status(401)
      res.send({error: {message: 'no user token'}})
    }
  })
  app.post('/api/v2/addStationData', async function (req, res) {
    if (req.body.user) {
      const users = await db.collection('users').find({_id: req.body.user}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(req.body.passphrase)
        if (req.body.toStation) {
          await db.collection('users').updateOne({_id: req.body.user}, {
            $push: {
              trips: {
                time: Date.now(),
                from: req.body.fromStation,
                to: req.body.toStation
              }
            }
          })
          fetch(`http://localhost:${aiServerPort}/api/runai/${req.body.user}`)
          res.status(200)
          res.send({error: false})
          res.end()
        } else {
          res.status(400)
          res.send({error: {message: 'no station'}})
        }
      } else {
        res.status(401)
        res.send({error: {message: 'no user'}})
      }

    } else {
      res.status(401)
      res.send({error: {message: 'no user token'}})
    }
  })
  app.get('/api/v2/stations', function (req, res) {

    res.status(200)
    res.send(bartList)
    res.end()

  })
  app.get('/api/v2/trains/:from', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        fetch(`https://api.bart.gov/api/etd.aspx?cmd=etd&orig=${req.params.from}&key=${bartkey}&json=y`).then(bartRes => bartRes.json()).then(bartRes => {
          const compiledRes = {
            estimates: bartRes.root.station[0],
            time: bartRes.root.time
          }
          //   console.log(compiledRes)
          res.status(200)
          res.send(compiledRes)
          res.end()
        }).catch(err => {
          res.status(500)
          res.send({error: {message: 'error fetching from BART API'}})
          res.end()
        })


      } else {
        res.status(401)
        res.send({error: {message: 'User not found'}})
        res.end()
      }

    } else {
      res.status(401)
      res.send({error: {message: 'no user token'}})
    }

  })
  app.post('/api/v2/createaccount', async function (req, res) {
    if (req.body.passphrase) {
      await db.collection('users').insertOne({_id: req.body.passphrase, created: Date.now()})
      res.status(200)
      res.send({created: req.body.passphrase, success: true})
      res.end()
    } else {
      res.status(400)
      res.send({error: 'no passphrase'})
      res.end()
    }
  })
  app.get('/api/v2/routes/:from/:to', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        fetch(`https://api.bart.gov/api/sched.aspx?cmd=depart&orig=${req.params.from}&dest=${req.params.to}&date=now&key=${bartkey}&b=0&a=4&l=1&json=y`).then(bartRes => bartRes.json()).then(bartRes => {
          const compiledRes = {
            trips: bartRes.root.schedule.request.trip
          }
            // console.log(compiledRes)
          res.status(200)
          res.send(compiledRes)
          res.end()
        }).catch(err => {
          console.log(err)
          res.status(500)
          res.send({error: {message: 'error fetching from BART API'}})
          res.end()
        })


      } else {
        res.status(401)
        res.send({error: {message: 'User not found'}})
        res.end()
      }

    } else {
      res.status(401)
      res.send({error: {message: 'no user token'}})
    }

  })
  //...
})

http.listen(3000, function () {
  console.log('listening on *:3000');
});