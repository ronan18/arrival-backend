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
console.log(stationList.length)
let stationListConversion = 100
let passPhraseCache = []
const arrivalURLs = ['http://localhost:8080', 'https://arrival.stomprocket.io']
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
//const apiData = {url: 'https://api.arrival.stomprocket.io', key: '51c2a8160c8e8dedf86698d51159f5a1', /*key: apiKey*/}
const apiData = {url: 'https://api.arrival.stomprocket.io', key: apiKey}
app.use(cors())
io.origins('*:*')
app.use(bodyParser.urlencoded({extended: false}))

// parse application/json
app.use(bodyParser.json())
const serviceAccount = require("./private/firebasekey.json");

function distance(lat1, lon1, lat2, lon2) {
  var radlat1 = Math.PI * lat1 / 180
  var radlat2 = Math.PI * lat2 / 180
  var theta = lon1 - lon2
  var radtheta = Math.PI * theta / 180
  var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
  if (dist > 1) {
    dist = 1;
  }
  dist = Math.acos(dist)
  dist = dist * 180 / Math.PI
  dist = dist * 60 * 1.1515

  return dist * 1.609344
}

async function getTrains(connectedUser) {
  const station = connectedUser.appData.fromStation.abbr
  const destination = connectedUser.appData.toStation.abbr
  // console.log(station, destination)
  let trainList = []
  if (station && destination) {
    //console.log('arrival and desitination')
    await fetch(`http://api.bart.gov/api/sched.aspx?cmd=depart&orig=${station}&dest=${destination}&date=now&key=MW9S-E7SL-26DU-VV8V&a=4&b=0&json=y`, {method: 'get'}).then(res => res.json()).then(trains => {
      let list = trains.root.schedule.request.trip
      // console.log(list)

      trainList = list.map(function (root) {
        let etdTime = root['@origTimeMin']
        let etaTime = root['@destTimeMin']
        const timeString = root['@origTimeDate'] + ' ' + etdTime
        const etaTimeString = root['@destTimeDate'] + ' ' + etaTime
        let momentTime = moment(timeString)
        let etaMomentTime = moment(etaTimeString)
        if (momentTime.isValid()) {
          console.log('time valid', timeString)
          etdTime = momentTime.format('k:mm')
        } else {
          console.log('time invalid', timeString)
        }
        etaTime = etaMomentTime.format('k:mm')

        const etd = {value: etdTime, unit: false};
        const eta = {value: etaTime, unit: false};
        let route = root.leg[0]['@line'].slice(-1)
        let routeInfo = {}
        fetch(`http://api.bart.gov/api/route.aspx?cmd=routeinfo&route=${route}&key=MW9S-E7SL-26DU-VV8V&json=y`).then(res => res.json()).then(routeData => {
          routeInfo = routeData.root.routes.route
          console.log('routeInfo updated')
          return routeInfo
        })
        // console.log(route)
        let transfers = false
        if (root.leg.length > 1) {
          transfers = true
        }
        /* console.log({
           destination: root.leg[0]['@trainHeadStation'],
           abbr: root.leg[0]['@destination'],
           etd: etd,
           eta: eta,
           transfers: transfers,
           //platform: train.platform,
           color: routeInfo.color,
           direction: routeInfo.direction,
           //cars: train.length
         })*/
        return {
          destination: root.leg[0]['@trainHeadStation'],
          abbr: root.leg[0]['@destination'],
          etd: etd,
          eta: eta,
          transfers: transfers,
          unix: momentTime.unix(),
          //platform: train.platform,
          color: routeInfo.color,
          direction: routeInfo.direction,
          //cars: train.length
        }
      })
      return trainList.sort((a, b) => {
        return a.unix - b.unix
      })
    })
  } else {
    await fetch(`http://api.bart.gov/api/etd.aspx?cmd=etd&orig=${station}&key=MW9S-E7SL-26DU-VV8V&json=y`, {method: 'get'}).then(res => res.json()).then(trains => {
      console.log(trains.root.station[0].etd)
      if (trains.root.station[0].etd) {
        let list = []
        trains.root.station[0].etd.forEach((place) => {
          place.estimate.forEach(train => {
            let etd = {value: train.minutes, unit: 'min'};
            if (etd.value == 'Leaving') {
              etd.unit = false
            }
            list.push({
              destination: place.destination,
              abbr: place.abbreviation,
              limited: place.limited,
              etd: etd,
              platform: train.platform,
              color: train.color,
              direction: train.direction,
              cars: train.length
            })
          })
        })
        trainList = list

        trainList.sort((a, b) => {
          let compareA = a.etd.value
          if (a.etd.value == 'Leaving') {
            compareA = 0
          }
          let compareB = b.etd.value
          if (b.etd.value == 'Leaving') {
            compareB = 0
          }
          return compareA - compareB
        })
      } else {
        trainList = 0;
      }


    })
  }


  // console.log(trainList)
  return trainList

}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://arrival-bart.firebaseio.com"
});
const db = admin.firestore()
let bartList = []
fetch('http://api.bart.gov/api/stn.aspx?cmd=stns&key=MW9S-E7SL-26DU-VV8V&json=y', {method: 'get'}).then(list => list.json()).then(list => {
  bartList = list.root.stations.station

})

async function update(socket, connectedUser) {
  const trains = await getTrains(connectedUser)
  connectedUser.appData.trains = trains
  console.log('from station', connectedUser.appData.fromStation.name)
  if (connectedUser.appData.fromStation.name === '12th St. Oakland City Center') {
    connectedUser.appData.fromStation.name = '12th St.'
  }
  if (connectedUser.appData.fromStation.name === '19th St. Oakland') {
    connectedUser.appData.fromStation.name = '19th St.'
  }
  if (connectedUser.appData.fromStation.name === '24th St. Mission') {
    connectedUser.appData.fromStation.name = '24th St.'
  }
  if (connectedUser.appData.fromStation.name === '16th St. Mission') {
    connectedUser.appData.fromStation.name = '16th St.'
  }
  if (connectedUser.appData.fromStation.name === 'San Francisco International Airport') {
    connectedUser.appData.fromStation.name = 'SFO'
  }
  if (connectedUser.appData.fromStation.name === 'Oakland International Airport') {
    connectedUser.appData.fromStation.name = 'OAK'
  }
  if (connectedUser.appData.fromStation.name === 'Pleasant Hill/Contra Costa Centre') {
    connectedUser.appData.fromStation.name = 'Pleasant Hill'
  }
  if (connectedUser.appData.fromStation.name === 'Civic Center/UN Plaza') {
    connectedUser.appData.fromStation.name = 'Civic Center'
  }
  socket.emit('appData', connectedUser.appData)
  socket.emit('apiKey', apiData)
  console.log('sent update')
  connectedUser.appData.trains = trains
  //console.log(connectedUser.appData.trains, 'trains updated')


}

app.get('/', function (req, res) {
  res.status(200)
  res.send('API')
  res.end()
});
app.post('/api/v1/createAccount', function (req, res) {
  console.log(req.headers.origin, req.body)
  let host = req.headers.origin
  if (arrivalURLs.indexOf(host) > -1) {
    if (req.body.passphrase) {
      const passphrase = req.body.passphrase
      db.collection('accounts').doc(passphrase).set({
        notificationDuration: 5
      }).then(e => {
        res.status(200)
        res.send({success: true})
        res.end()
      })


    } else {
      res.status(400)
      res.end()
    }
  } else {
    res.status(401)
    res.end()
  }
})
app.post('/api/v1/passphraseCheck', function (req, res) {
  console.log(req.headers.origin, req.body)
  let host = req.headers.origin
  if (arrivalURLs.indexOf(host) > -1) {
    if (req.body.passphrase) {
      const passphrase = req.body.passphrase
      let ref = db.collection('accounts').doc(passphrase);
      ref.get()
      .then(doc => {
        if (!doc.exists) {
          console.log('No such document!');
          res.status(200)
          res.send({passphrase: passphrase, exists: false})
          res.end()
        } else {
          console.log('exists')
          res.status(200)
          res.send({passphrase: passphrase, exists: true})
          res.end()
        }
      })
      .catch(err => {
        console.log('Error getting person', err);
        res.status(500)
        res.end()
      });

    } else {
      res.status(400)
      res.end()
    }
  } else {
    res.status(401)
    res.end()
  }

})
app.post('/api/v1/suggestions/from', function (req, res) {
  console.log(req.headers.authorization, req.body)
  const auth = req.headers.authorization
  if (auth == apiKey) {
    const pass = req.body.passphrase
    const location = req.body.position

    if (pass && location) {
      db.collection('accounts').doc(pass).get().then(user => {
        if (user.exists) {
          let stations = bartList.map((station) => {
            station.distance = distance(station.gtfs_latitude, station.gtfs_longitude, location.coords.lat, location.coords.long)
            return station
          })
          nearestStations = stations.sort(function (a, b) {
            return a.distance - b.distance
          });
          res.status(200)
          res.json(stations)
          res.end()
        } else {
          res.status(400)
          res.end()
        }
      })
    } else {
      res.status(400)
      res.end()
    }

  } else {
    res.status(401)
    res.end()
  }


});
app.post('/api/v1/suggestions/to', function (req, res) {
  console.log(req.body)
  const auth = req.headers.authorization
  if (auth == apiKey) {
    const pass = req.body.passphrase
    const location = req.body.position
    /*db.collection('accounts').doc(pass).collection('trips').get().then(snap => {
      const trips = snap.data()
      console.log(trips)
      const config = {
        inputSize: 20,
        inputRange: 20,
        hiddenLayers: [20,20],
        outputSize: 20,
        learningRate: 0.01,
        decayRate: 0.999,
      };

// create a simple recurrent neural network
      //const net = new brain.recurrent.RNN(config);

    })
    */

    if (pass && location) {
      db.collection('accounts').doc(pass).get().then(snap => {
        const json = snap.data().net
        let resultsArray = []
        let resultStations = []
        if (json) {
          const net = new brain.NeuralNetwork()
          net.fromJSON(json);
          const time = Date.now()
          const result = net.run({
            day: Number(parseInt(moment(time).format('d'), 10)) / 10,
            hour: Number(parseInt(moment(time).format('HH'), 10)) / 100,
            station: findStationCode(req.body.station.abbr) / 100
          })
          console.log(result)


          for (const key in result) {
            if (result.hasOwnProperty(key) && req.body.station.abbr !== key) {
              resultStations.push(key)
              const stationData = bartList.filter(obj => {
                return obj.abbr === key
              })[0]
              stationData.priority = result[key]
              resultsArray.push(stationData)
            }
          }

          resultsArray = resultsArray.sort((a, b) => {
            return b.priority - a.priority
          })
        }

        bartList.map(i => {
          if (resultStations.indexOf(i.abbr) === -1 && req.body.station.abbr !== i.abbr) {
            resultsArray.push(i)
            return i
          }
        })
        resultsArray.unshift({
          'name': 'none'
        })
        console.log(resultsArray)
        res.status(200)
        res.json(resultsArray)
        res.end()
      })
      /*
      db.collection('accounts').doc(pass).get().then(user => {
        if (user.exists) {
          let stations = bartList.map((station) => {
            station.distance = distance(station.gtfs_latitude, station.gtfs_longitude, location.coords.lat, location.coords.long)
            return station
          })
          nearestStations = stations.sort(function (a, b) {
            return a.distance - b.distance
          });
          nearestStations.unshift({
            'name': 'none'
          })
          res.status(200)
          res.json(stations)
          res.end()
        } else {
          res.status(400)
          res.end()
        }
      })
      */
    } else {
      res.status(400)
      res.end()
    }

  } else {
    res.status(401)
    res.end()
  }


});
io.on('connection', function (socket) {
  //console.log(apiKey, 'apiKey')
  let connectedUser = {appData: {}, suggestions: {type: false, items: []}}
  let trainUpdate = false
  console.log('a user connected');
  const opened = Date.now()

  socket.on('passphrase', (package) => {
    const pass = package.pass
    connectedUser.clientVersion = package.version
    console.log('passphrase recived', pass)
    connectedUser.passphrase = pass
    db.collection('accounts').doc(pass).get().then(user => {
      socket.emit('passphraseValid', user.exists)
      if (user.exists) {
        socket.emit('apiKey', apiData)
        console.log('validated passphrase')
        connectedUser.data = user.data()
        connectedUser.data.lastseen = admin.firestore.Timestamp.fromDate(new Date())
        db.collection('accounts').doc(pass).update({lastseen: connectedUser.data.lastseen});
        console.log('updated lastseen')
      } else {
        console.log(pass, 'exists', user.exists)
      }
    })

  })
  socket.on('location', location => {
    connectedUser.location = location
    connectedUser.stations = bartList.map((station) => {
      station.distance = distance(station.gtfs_latitude, station.gtfs_longitude, location.coords.lat, location.coords.long)
      return station
    })
    connectedUser.nearestStations = bartList.sort(function (a, b) {
      return a.distance - b.distance
    });
    connectedUser.appData.fromStation = {
      name: connectedUser.nearestStations[0].name,
      abbr: connectedUser.nearestStations[0].abbr
    }
    connectedUser.appData.calcTime = {
      type: 'leave',
      time: 'Now'
    }
    connectedUser.appData.toStation = false;

    (async function () {
      connectedUser.appData.trains = await getTrains(connectedUser)
      // console.log(connectedUser.appData.trains)

      socket.emit('appData', connectedUser.appData)
      console.log('sent inital app data')
      const initialState = Date.now()
      const loadTime = initialState - opened
      db.collection('analytics').add({
        loadTime: loadTime,
        appData: connectedUser.appData,
        clientVersion: connectedUser.clientVersion,
        serverVersion: require('./package.json').version,
        timeStamp: admin.firestore.Timestamp.fromDate(new Date())
      })
      console.log('updated analytics', loadTime)
    })();


    trainUpdate = setInterval(() => {
      (async function () {
        const trains = await getTrains(connectedUser)
        if (connectedUser.appData.trains[0].etd.value !== trains[0].etd.value) {
          connectedUser.appData.trains = trains
          //console.log(connectedUser.appData.trains, 'trains updated')
          socket.emit('trainsUpdate', connectedUser.appData.trains)
        } else {
          // console.log('trains the same')
        }

      })();
    }, 3000)


  })
  socket.on('requestApiKey', () => {
    socket.emit('apiKey', apiData)
  })

  socket.on('setFromStation', station => {
    connectedUser.appData.fromStation = station
    console.log('setting from station', connectedUser.appData.fromStation.name, `${connectedUser.passphrase}_updateApp`)
    //console.log('from station', connectedUser.appData.fromStation)
    update(socket, connectedUser)
  })
  socket.on('setToStation', station => {
    if (station.name === 'none') {
      connectedUser.appData.toStation = false
    } else {
      connectedUser.appData.toStation = station
      const utc = Date.now()
      const dataPacket = {
        user: {
          passphrase: connectedUser.passphrase,
          currentStation: connectedUser.appData.fromStation,
          toStation: connectedUser.appData.toStation,
          clientVersion: connectedUser.clientVersion
        },
        time: {
          utc: utc,
          day: moment(utc).format('d'),
          month: moment(utc).format('M'),
          hour: moment(utc).format('HH'),
          minute: moment(utc).format('mm'),
          year: moment(utc).format('YYYY')
        }
      }
      db.collection('accounts').doc(connectedUser.passphrase).collection('trips').add(dataPacket).then((e) => {
        fetch('http://localhost:8082/api/runai/' + connectedUser.passphrase).then(res => res.json()).then(res => {
          console.log(res)
        })
      })


    }

    console.log('setting to station', connectedUser.appData.toStation.name, `${connectedUser.passphrase}_updateApp`)
    //console.log('from station', connectedUser.appData.fromStation)

    update(socket, connectedUser)
  })
  socket.on('disconnect', function () {
    console.log('user disconnected');
    clearInterval(trainUpdate)
  });
});
http.listen(3000, function () {
  console.log('listening on *:3000');
});
