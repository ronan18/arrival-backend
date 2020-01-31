const mongo = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017'
const fs = require('fs');

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
  fs.writeFile("./private/trainingData.json", JSON.stringify(filteredUsers), function(err) {
    if(err) {
      return console.log(err);
    }
    console.log("The file was saved!");
  });

})