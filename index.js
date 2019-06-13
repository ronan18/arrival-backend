const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const admin = require("firebase-admin");
const fetch = require('node-fetch')
io.origins('*:*')
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

async function getTrains(station) {
  let trainList = []
  await fetch(`http://api.bart.gov/api/etd.aspx?cmd=etd&orig=${station}&key=MW9S-E7SL-26DU-VV8V&json=y`, {method: 'get'}).then(res => res.json()).then(trains => {
    //console.log(trains.root.station[0].etd)
    let list = []
    trains.root.station[0].etd.forEach((place) => {
      place.estimate.forEach(train => {
        let etd = {value: train.minutes, unit: 'min'};
        if (etd.value === 'Leaving') {
          etd.unit = false
        }
        list.push({
          destination: place.destination,
          abbr: place.abbreviation,
          limited: place.limited,
          etd: {value: train.minutes, unit: 'min'},
          platform: train.platform,
          color: train.color,
          direction: train.direction,
          cars: train.length
        })
      })
    })
    trainList = list

  })
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
app.get('/', function (req, res) {
  res.redirect('https://arrival.stomprocket.io');
});
io.on('connection', function (socket) {
  let connectedUser = {appData: {}}
  console.log('a user connected');
  socket.on('passphrase', (pass) => {
    console.log('passphrase recived', pass)
    connectedUser.passphrase = pass
    db.collection('accounts').doc(pass).get().then(user => {
      socket.emit('passphraseValid', user.exists)
      if (user.exists) {
        console.log('validated passphrase')
        connectedUser.data = user.data()
        connectedUser.data.lastseen = admin.firestore.Timestamp.fromDate(new Date())
        db.collection('accounts').doc(pass).update({lastseen: connectedUser.data.lastseen});
        console.log('updated lastseen')
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
      name: connectedUser.nearestStations[0].name
    }
    connectedUser.appData.calcTime = {
      type: 'leave',
      time: 'Now'
    }
    connectedUser.appData.toStation = false;

    (async function () {
      connectedUser.appData.trains = await getTrains(connectedUser.nearestStations[0].abbr)
      console.log(connectedUser.appData.trains)
      socket.emit('appData', connectedUser.appData)
    })();


    let trainUpdate = setInterval(() => {
      (async function () {
        const trains = await getTrains(connectedUser.nearestStations[0].abbr)
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
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
});
http.listen(3000, function () {
  console.log('listening on *:3000');
});
