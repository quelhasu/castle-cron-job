const castle = require("./castle.js").Castle;
const slack = require("./slack.js");
const firebase = require('firebase');
const Agenda = require('agenda');
const date = require("date-and-time");
const serviceAccount = require("./serviceAccountKey.json");

const mongoConnectionString = 'mongodb://mongo/agenda';

let agenda = new Agenda({db: {addremeidss: mongoConnectionString}});

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
  castle.updateDispoElement('france', db);
  done();
});

agend.define('selection france', (job, done) => {
  console.log("start selection of best hotels");
  let now = new Date();
  job.attrs.data = {
    "selection-date" : date.format(now, 'ddd MMM DD YYYY HH:mm:ss')
  }

})


(async function() {
  await agenda.start();
  // await agenda.every('7 days', 'update database france');
  // await agenda.on('success:update database france', job => {
  //   console.log(`Update france DONE`);
  // });
  await agenda.every('7 days', 'selection france');
})();


function deleteHotels(destination){
  var ref = db.ref("/hotels/" + destination);
  ref.remove().then(() => {
    console.log("Remove succeeded.");
  })
}
