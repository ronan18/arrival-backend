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
let stationVersion = 4
const agendaUrl = keys.mongo.url
console.log(stationList.length)
const aiServerPort = 8082
let stationListConversion = 100
let passPhraseCache = []
const arrivalURLs = ['http://localhost:8080', 'https://arrival.stomprocket.io', 'https://app.arrival.city']
const version = require('./package.json').version
const compression = require('compression')
const Agenda = require('agenda')
const agenda = new Agenda({db: {address: agendaUrl, collection: "arrival-que"}});
const url = keys.mongo.url
const csv = require('csv-parser');
var SHA256 = require("crypto-js/sha256");
agenda.start();
app.use(compression({filter: shouldCompress}))
function convertiOStoBARTTime (time)  {
  let momentTime = moment(time, "DD-MM-YYYY hh:mm A").tz("America/Los_Angeles")
  let bartDate = momentTime.format("MM/DD/YYYY")
  let bartTime = momentTime.format("h:mm+a")
  console.log(time, bartDate, bartTime)
  return {date: bartDate, time: bartTime}
}
function convertISO8601toBARTTime (time)  {
  let momentTime = moment(time).tz("America/Los_Angeles")
  let bartDate = momentTime.format("MM/DD/YYYY")
  let bartTime = momentTime.format("h:mm+a")
  console.log(time, bartDate, bartTime)
  return {date: bartDate, time: bartTime}
}
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);  // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180)
}

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
    console.error(err, "mongo error")
    return
  }
  const db = client.db('arrival-db')
  fetch(`http://api.bart.gov/api/stn.aspx?cmd=stns&key=${bartkey}&json=y`, {method: 'get'}).then(list => list.json()).then(list => {
    bartList = list.root.stations.station


  })

  function updateUser(passphrase) {

    db.collection('users').updateOne({_id: passphrase}, {$set: {lastSeen: Date.now(),}})
  }

  app.get('/', function (req, res) {
    res.status(200)
    res.send(`API v${version}`)
    res.end()
  });
  //TODO add login v3 that allows for no retrieval of JS AI data to reduce data consumption and packet travel
  app.get('/api/v2/login', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/v2/login', params:req.headers.authorization, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})
        const userKey = uuidv4()
        db.collection('users').updateOne({_id: passphrase}, {$set: {key: userKey, keyGenerated: Date.now()}})
        //console.log(passphrase, 'loging stuff')
        let result = {user: 'true', key: userKey, version: version}
        if (user.net) {
          result.net = user.net
          console.log('to net')
        } else {
          result.net = false
          console.log('no to net')
        }
        if (user.fromNet) {
          result.fromNet = user.fromNet
          console.log('from net')
        } else {
          result.fromNet = false
          console.log('no from net')
        }
        let statVersion = await db.collection('system').find({_id: "stationHash"}).toArray()

        stationVersion =  statVersion[0].version
        result.stationVersion = stationVersion
        console.log('sent server station version', stationVersion)
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
  app.get('/api/v2/siri/login', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      // console.log(users)
      if (users.length === 1) {
        agenda.now('log request', {user: passphrase, path:'/api/v2/siri/login', params:req.headers.authorization, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        const user = users[0]
        console.log('login', req.headers.authorization)
        updateUser(passphrase)

        let result = 'true'

        res.status(200)
        res.send(result)
        res.end()
      } else {
        res.status(401)
        res.send('false')
        res.end()
      }
    } else {
      res.status(401)
      res.send('false')
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
        agenda.now('log request', {user: passphrase, path:'/api/v2/login', params:req.headers.authorization, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        const userKey = uuidv4()
        db.collection('users').updateOne({_id: passphrase}, {
          $set: {
            key: userKey, keyGenerated: Date.now(), clientVersion: req.body.clientVersion
          }
        })
        let result = {user: 'true', key: userKey, version: version}
        if (user.net) {
          result.net = user.net
          console.log('to net')
        } else {
          result.net = false
          console.log('no to net')
        }
        if (user.fromNet) {
          result.fromNet = user.fromNet
          console.log('from net')
        } else {
          result.fromNet = false
          console.log('no from net')
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
  app.post('/api/v2/fromstationdata', async function (req, res) {
    if (req.body.user) {
      const users = await db.collection('users').find({_id: req.body.user}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(req.body.passphrase)
        agenda.now('log request', {user: req.body.user, path:'/api/v2/fromstationdata', params:req.body.fromStation, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})
        if (req.body.fromStation) {
          await db.collection('users').updateOne({_id: req.body.user}, {
            $push: {
              fromStationData: {
                time: Date.now(),
                from: req.body.fromStation,
                location: req.body.location,
                closestStation: req.body.closestStation
              }
            }
          })
          agenda.now('run from ai', {user: req.body.user})
          //fetch(`http://localhost:${aiServerPort}/api/runai/${req.body.user}`)
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
  app.post('/api/v2/addStationData', async function (req, res) {
    if (req.body.user) {
      const users = await db.collection('users').find({_id: req.body.user}).toArray()
      // console.log(users)
      if (users.length === 1) {
        const user = users[0]
        agenda.now('log request', {user: req.body.user, path:'/api/v2/addStationData', params:req.body.toStation, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})
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
          agenda.now('run to ai', {user: req.body.user})
          //fetch(`http://localhost:${aiServerPort}/api/runai/${req.body.user}`)
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
  app.get('/api/v2/stations', async function (req, res) {
    let statVersion = await db.collection('system').find({_id: "stationHash"}).toArray()
    agenda.now('log request', {user: false, path:'/api/v2/stations', params: false, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

    stationVersion =  statVersion[0].version

    let stations = await db.collection('stations').find().toArray()
    if (stations.length > 1) {
      bartlist = stations
    }
    res.status(200)
    res.send(bartList)
    res.end()

  })
  app.get('/api/v3/stations', async function (req, res) {
    let statVersion = await db.collection('system').find({_id: "stationHash"}).toArray()

    stationVersion =  statVersion[0].version
    agenda.now('log request', {user: false, path:'/api/v3/stations', params: false, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")}).then(res => {
      //console.log(res, "agenda add result")
    })

    let stations = await db.collection('stations').find().toArray()
    //console.log(stations)
    if (stations.length > 1) {
      bartlist = stations
    }

    console.log("sent station data v", stationVersion)
    res.status(200)
    res.send({stations: stations, version: stationVersion})
    res.end()

  })
  app.get('/api/v2/closeststation/:lat/:long', function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization


      const lat = req.params.lat
      const long = req.params.long
      agenda.now('log request', {user: passphrase, path:'/api/v2/closeststation/:lat/:long', params: {lat: lat,long: long}, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})
      let closestStation = bartList.sort((a, b) => {
        //console.log(getDistanceFromLatLonInKm(position.coords.latitude, position.coords.longitude, a.gtfs_latitude, a.gtfs_longitude), 'position', a.abbr)
        return getDistanceFromLatLonInKm(lat, long, a.gtfs_latitude, a.gtfs_longitude) - getDistanceFromLatLonInKm(lat, long, b.gtfs_latitude, b.gtfs_longitude)
      })

      res.status(200)
      res.send(closestStation[0].abbr)
      res.end()
    }


  })
  app.get('/api/v2/siri/trains/:from', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        fetch(`https://api.bart.gov/api/etd.aspx?cmd=etd&orig=${req.params.from}&key=${bartkey}&json=y`).then(bartRes => bartRes.json()).then(bartRes => {
          const estimates = bartRes.root.station[0].etd
          //console.log(estimates)
          let trains = ''
          let i = 0
          do {
            if (i === estimates.length - 1 && i != 0) {
              trains += ` and a ${estimates[i].destination} in ${estimates[i].estimate[0].minutes}`
            } else if (i === 0) {
              if (estimates.length === 1) {
                trains += ` A ${estimates[i].destination} in ${estimates[i].estimate[0].minutes}`
              } else {
                trains += ` A ${estimates[i].destination} in ${estimates[i].estimate[0].minutes},`
              }

            } else {
              trains += ` ${estimates[i].destination} in ${estimates[i].estimate[0].minutes},`
            }

            i++
          } while (i <= 3 && i <= estimates.length - 1)
          let message = ''
          if (estimates.length === 1) {
            message = `The next train from ${bartRes.root.station[0].name} station is ${trains}`
          } else {
            message = `The next ${i} trains from ${bartRes.root.station[0].name} station are: ${trains}`
          }

          //   console.log(compiledRes)
          res.status(200)
          res.send(message)
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
  app.post('/api/v3/trains/:from', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        agenda.now('log request', {user: passphrase, path:'/api/v3/trains/:from', params: req.params.from, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        updateUser(passphrase)
        if (req.body.type === "now") {
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
        } else if (req.body.type == "leave") {
          let time = req.body.time
          let momentTime = moment(time, "DD-MM-YYYY hh:mm A").tz("America/Los_Angeles")
          let bartTime = momentTime.format("MM/DD/YYYY")
          console.log(time, bartTime)
          fetch(`https://api.bart.gov/api/sched.aspx?cmd=stnsched&orig=${req.params.from}&key=${bartkey}&json=y&a=4&b=0&date=${bartTime}`).then(bartRes => bartRes.json()).then(async bartRes => {
            let etds = bartRes.root.station.item.map(item => {
              let route = item["@line"]

              let regex = /ROUTE (\d+)/
              let routeNumber = regex.exec(route)
              //   console.log(routeNumber[1], route)
              return {
                destination: item["@trainHeadStation"],
                time: item["@origTime"],
                bikeFlag: item["@bikeflag"],
                load: item["@load"],
                route: routeNumber[1]
              }
            })

            etds = etds.filter(item => {

              console.log(item.time + " " + bartRes.root.date, moment(item.time, "hh:mm A M/D/YYYY").isAfter(momentTime))
              return moment(item.time + " " + bartRes.root.date, "hh:mm A M/D/YYYY").isAfter(momentTime)
            })
            etds = etds.slice(0, 15)
            let result = {
              name: bartRes.root.station.name,
              abbr: bartRes.root.station.abbr,
              etd: etds
            }
            const compiledRes = {
              estimates: result
            }
            //   console.log(compiledRes)
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
          res.status(400)
          res.send({error: {message: "invalid leave type"}})
          res.end()
        }


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
  app.get('/api/v2/trains/:from', async function (req, res) {

    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/v2/trains/:from', params: req.params.from, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

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
      agenda.now('log request', {user: req.body.passphrase, path:'/api/v2/createaccount', params: false, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

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
  app.get('/api/v3/trip/:tripid', async function (req, res) {
    console.log(req.params.tripid, "trip request")
    const tripRecords = await db.collection('trips').find({_id: req.params.tripid}).toArray()
    agenda.now('log request', {user: false, path:'/api/v3/trip/:tripid', params: req.params.tripid, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

    console.log(tripRecords)
    if (tripRecords.length > 0) {
      res.status(200)
      res.send(tripRecords[0])
      console.log("sent trip", tripRecords[0])
    } else {
      res.status(400)
      res.send({error: "invalid trip id"})
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
        agenda.now('log request', {user: passphrase, path:'/api/v2/routes/:from/:to', params: req.params, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

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
  app.get('/api/v3/routes/:from/:to', async function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/v3/routes/:from/:to', params: req.params, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        fetch(`https://api.bart.gov/api/sched.aspx?cmd=depart&orig=${req.params.from}&dest=${req.params.to}&date=now&key=${bartkey}&b=0&a=4&l=1&json=y`).then(bartRes => bartRes.json()).then(async bartRes => {
          const compiledRes = {
            trips: bartRes.root.schedule.request.trip
          }
          console.log("handeling v3 route request")
          let routes = {}
          let x = 0
          while (x < compiledRes.trips.length) {
            let trip = compiledRes.trips[x]
            compiledRes.trips[x].tripId = uuidv4()
            let i = 0
            while (i < trip.leg.length) {
              console.log(x, i, trip.leg[i])
              let route = trip.leg[i]["@line"]

              let regex = /ROUTE (\d+)/
              let routeNumber = regex.exec(route)
              console.log(routeNumber[1], route)
              let bartRes
              if (routes[routeNumber[1]]) {
                bartRes = routes[routeNumber[1]]
              } else {
                bartRes = await fetch(`https://api.bart.gov/api/route.aspx?cmd=routeinfo&route=${routeNumber[1]}&key=${bartkey}&json=y`).then(bartRes => bartRes.json())
                bartRes = bartRes.root.routes.route
                routes[routeNumber[1]] = bartRes
                console.log("root aded to databse", routeNumber[1])
              }

              compiledRes.trips[x].leg[i].route = routeNumber[1]
              console.log(compiledRes.trips[x].leg[i].route, 'confirmed route at', routeNumber[1], x, i)
              i++
            }
            db.collection("trips").insertOne({
              _id: compiledRes.trips[x].tripId, trip: compiledRes.trips[x], routes: routes,
              date: moment.utc().toString()
            })
            x++
            console.log(x, compiledRes.trips.length)
          }


          console.log(x, "sent")
          // console.log(compiledRes)
          compiledRes.routes = routes
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
  app.post('/api/v4/routes/:from/:to', async function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/v4/routes/:from/:to', params: {params:req.params, body: req.body}, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        let cmd = "depart"
        let time = {
          time: "now",
          date: "now"
        }

        if (req.body.type === "leave") {
          cmd = "depart"
          time = convertiOStoBARTTime(req.body.time)
        }
        if (req.body.type === "arrive") {
          cmd = "arrive"
          time = convertiOStoBARTTime(req.body.time)
        }
console.log(time, cmd, req.body, "v4 route request")
        fetch(`https://api.bart.gov/api/sched.aspx?cmd=${cmd}&orig=${req.params.from}&dest=${req.params.to}&time=${time.time}&date=${time.date}&key=${bartkey}&b=0&a=4&l=1&json=y`).then(bartRes => bartRes.json()).then(async bartRes => {
          const compiledRes = {
            trips: bartRes.root.schedule.request.trip
          }
          console.log("handeling v3 route request")
          let routes = {}
          let x = 0
          while (x < compiledRes.trips.length) {
            let trip = compiledRes.trips[x]
            compiledRes.trips[x].tripId = uuidv4()
            let i = 0
            while (i < trip.leg.length) {
              console.log(x, i, trip.leg[i])
              let route = trip.leg[i]["@line"]

              let regex = /ROUTE (\d+)/
              let routeNumber = regex.exec(route)
              console.log(routeNumber[1], route)
              let bartRes
              if (routes[routeNumber[1]]) {
                bartRes = routes[routeNumber[1]]
              } else {
                bartRes = await fetch(`https://api.bart.gov/api/route.aspx?cmd=routeinfo&route=${routeNumber[1]}&key=${bartkey}&json=y`).then(bartRes => bartRes.json())
                bartRes = bartRes.root.routes.route
                routes[routeNumber[1]] = bartRes
                console.log("root aded to databse", routeNumber[1])
              }

              compiledRes.trips[x].leg[i].route = routeNumber[1]
              console.log(compiledRes.trips[x].leg[i].route, 'confirmed route at', routeNumber[1], x, i)
              i++
            }
            db.collection("trips").insertOne({
              _id: compiledRes.trips[x].tripId, trip: compiledRes.trips[x], routes: routes,
              date: moment.utc().toString()
            })
            x++
            console.log(x, compiledRes.trips.length)
          }


          console.log(x, "sent")
          // console.log(compiledRes)
          compiledRes.routes = routes
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
  app.post('/api/v5/routes/:from/:to', async function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/v5/routes/:from/:to', params: {params:req.params, body: req.body}, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        let cmd = "depart"
        let time = {
          time: "now",
          date: "now"
        }

        if (req.body.type === "leave") {
          cmd = "depart"
          time = convertISO8601toBARTTime(req.body.time)
        }
        if (req.body.type === "arrive") {
          cmd = "arrive"
          time = convertISO8601toBARTTime(req.body.time)
        }
console.log(time, cmd, req.body, "v4 route request")
        fetch(`https://api.bart.gov/api/sched.aspx?cmd=${cmd}&orig=${req.params.from}&dest=${req.params.to}&time=${time.time}&date=${time.date}&key=${bartkey}&b=0&a=4&l=1&json=y`).then(bartRes => bartRes.json()).then(async bartRes => {
          const compiledRes = {
            trips: bartRes.root.schedule.request.trip
          }
          console.log("handeling v3 route request")
          let routes = {}
          let x = 0
          while (x < compiledRes.trips.length) {
            let trip = compiledRes.trips[x]
            compiledRes.trips[x].tripId = uuidv4()
            let i = 0
            while (i < trip.leg.length) {
              console.log(x, i, trip.leg[i])
              let route = trip.leg[i]["@line"]

              let regex = /ROUTE (\d+)/
              let routeNumber = regex.exec(route)
              console.log(routeNumber[1], route)
              let bartRes
              if (routes[routeNumber[1]]) {
                bartRes = routes[routeNumber[1]]
              } else {
                bartRes = await fetch(`https://api.bart.gov/api/route.aspx?cmd=routeinfo&route=${routeNumber[1]}&key=${bartkey}&json=y`).then(bartRes => bartRes.json())
                bartRes = bartRes.root.routes.route
                routes[routeNumber[1]] = bartRes
                console.log("root aded to databse", routeNumber[1])
              }

              compiledRes.trips[x].leg[i].route = routeNumber[1]
              console.log(compiledRes.trips[x].leg[i].route, 'confirmed route at', routeNumber[1], x, i)
              i++
            }
            db.collection("trips").insertOne({
              _id: compiledRes.trips[x].tripId, trip: compiledRes.trips[x], routes: routes,
              date: moment.utc().toString()
            })
            x++
            console.log(x, compiledRes.trips.length)
          }


          console.log(x, "sent")
          // console.log(compiledRes)
          compiledRes.routes = routes
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
  app.get('/api/v5/advisories', async function (req, res) {
    if (req.headers.authorization) {
      const passphrase = req.headers.authorization
      //  console.log(passphrase)
      const users = await db.collection('users').find({_id: passphrase}).toArray()
      //console.log(users)
      if (users.length === 1) {
        const user = users[0]
        updateUser(passphrase)
        agenda.now('log request', {user: passphrase, path:'/api/advisories', params: {params:req.params}, time: moment().tz('America/Los_Angeles').format("dddd, MMMM Do YYYY, h:mm:ss a")})

        fetch(`https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=${bartkey}&json=y`).then(bartRes => bartRes.json()).then(async bartRes => {
         // console.log(bartRes.root.bsa)
          console.log(bartRes.root.message)
          let alerts = bartRes.root.bsa.filter((a)=> {
            return a.station.length >= 1 || req.headers.verbose == "true"
          })
          alerts = alerts.map((a) => {
            return {
              station: a.station,
              description: a.description["#cdata-section"],
              shortened: a.sms_text["#cdata-section"],
              type: a.type ? a.type : "noType",
              id: a["@id"] ? a["@id"] : "noID",
              posted:a.posted ? a.posted : "noPosted",
              raw: a
            }
          })
          console.log(alerts)
          const compiledRes = {
            alerts: alerts,
            message:"" + bartRes.root.message
          }
         
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
