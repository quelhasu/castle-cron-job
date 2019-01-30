const castle = require("./castle.js").Castle;
const firebase = require('firebase');
const Agenda = require('agenda');
const date = require("date-and-time");
const serviceAccount = require("./serviceAccountKey.json");

const mongoConnectionString = 'mongodb://mongo/agenda';

let agenda = new Agenda({db: {address: mongoConnectionString}});

if(!firebase.apps.length) {
  let config = serviceAccount;
firebase.initializeApp(config);
}

const db = firebase.database();


agenda.define('update database france', (job, done) => {
  console.log("start update france hotels");
  let now = new Date();
  job.attrs.data = {
    "update-date" : date.format(now, 'ddd MMM DD YYYY HH:mm:ss')
  }
  deleteHotels("france");
  castle.getHotels("france", db);
  done();
});


(async function() {
  await agenda.start();
  await agenda.every('7 days', 'update database france');
  await agenda.on('success:update database france', job => {
    console.log(`Sent Email Successfully`);
  });
})();


function deleteHotels(destination){
  var ref = db.ref("/hotels/" + destination);
  ref.remove().then(() => {
    console.log("Remove succeeded.");
  })
}
