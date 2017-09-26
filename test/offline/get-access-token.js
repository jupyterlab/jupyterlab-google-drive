var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
client.setCredentials({
  refresh_token: REFRESH_TOKEN,
  access_token: '',
  expiry_date: true
});

client.getAccessToken( (err, token) => {
  console.log('export ACCESS_TOKEN='+token);
});
