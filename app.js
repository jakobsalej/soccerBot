var bodyParser = require('body-parser');
var request = require('request');
var apiai = require('apiai');
var express = require('express');
var MongoClient = require('mongodb').MongoClient;

var app = express();

var db;
MongoClient.connect('mongodb://admin:admin@ds029381.mlab.com:29381/soccer_bot_db', (err, database) => {
  if (err) return console.log(err);
  db = database;
  
  // launch app!
  app.listen(port, function () {
    console.log('App listening on port ' + port);
  });
});

// variables
const CLIENT_ACCESS_TOKEN = "59921fd442bb49c88ecd28aad2d97095";
const VERIFY_TOKEN = "this_is_my_token";
const VERIFY_TOKEN_FEEDR = "9e8e73e542230fad3a0cd65ba3827eb3";
const PAGE_ACCESS_TOKEN = "EAAJA0YZCn42YBAB2nzQnW7emswOZBl6Xie8Ug8theCvmlt8ubSCviNhicKqqWyNsxVMhVzIrClZAsRpXmlnbbY5954ExbRNYtFZCo1ISxCXWYtEuNJR5LvWvKh3S4ffknNwDsCCKuRlcdLHuUuKcNzJlPpnWpBGLzLUun0p2dgZDZD";

var apiaiApp = apiai(CLIENT_ACCESS_TOKEN);

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());

// set the port of our application
// process.env.PORT lets the port be set by Heroku
var port = process.env.PORT || 3000;


app.get('/', function (req, res) {
  console.log('Requesting root...');
  res.send('Hello World!');
});


// superfeedr subscription (first time confirmation)
app.post('/feedr_webhook', function(req, res) {
  
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
     
  
});


// get messages from feedr
app.get('/feedr_webhook', function (req, res) {
  console.log('Getting GET request!');
  var data = req.body;
  console.log('DATA:', data);

  console.log('Sending back 200! and confirmation');
  res.status(200).send(req.query['hub.challenge']);
});


// messenger part
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


// get messages from users
app.post('/webhook', function (req, res) {
  console.log('Getting post request!');
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    console.log('Sending back 200!');
    res.sendStatus(200);
  }
});





function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderID);
        break;

      default:
        callApiAi(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}




function callApiAi(recipientId, messageText) {
  
  console.log('Calling Api.ai');
  var apiai = apiaiApp.textRequest(messageText, {
    sessionId: 'soccerBot' // use any arbitrary id
  });

  apiai.on('response', (response) => {
    // Got a response from api.ai. Let's POST to Facebook Messenger
    var aiText = response.result.fulfillment.speech;
    console.log('Got response from Api.ai:', aiText);
    var result = response.result;
    console.log('Result:', result);

    // save new user to db
    if (result.action === 'select-club') {

    	var user = {
    		facebookId: recipientId,
    		team: result.parameters.Entity,
    		sendUpdates: true
    	};

    	db.collection('users').save(user, function (err, res) {
    		if (err) return console.log(err);
    		console.log('Saved user to database!');
    	});
    }

    var messageData = {
	  recipient: {
	    id: recipientId
	  },
	  message: {
	    text: aiText
	  }
	};

  callSendAPI(messageData);
  });

  apiai.on('error', (error) => {
    console.log(error);
  });

  apiai.end();
}  


function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}


function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "rift",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",               
            image_url: "http://messengerdemo.parseapp.com/img/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",               
            image_url: "http://messengerdemo.parseapp.com/img/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}



function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
}



// SUPERFEEDR
/*
var Superfeedr = require('superfeedr');
var client = new Superfeedr("soccerbot", "fuzbaler27");
client.on('connected', function() {
  client.subscribe("https://www.reddit.com/r/soccer/new.rss", function(err, feed) {
    console.log(feed);
    // { url: 'http://blog.superfeedr.com/atom.xml',
    //   title: 'Superfeedr Blog : Real-time cloudy thoughts from a super-hero',
    //   httpCode: 200,
    //   httpStatus: '37345B in 0.602513587s, 0/10 new entries',
    //   period: 43200,
    //   nextFetch: 1323523524000,
    //   lastFetch: 1323479726000,
    //   lastParse: 1323479726000,
    //   lastMaintenance: 1323401451000 }
  });
  client.on('notification', function(notification) {
    console.log('Getting reddit notifications:', notification);
    // { feed: 
    //    { url: 'http://push-pub.appspot.com/feed',
    //      title: 'Publisher example',
    //      httpCode: 200,
    //      httpStatus: '4775B in 0.170247116s, 1/20 new entries',
    //      period: 43200,
    //      nextFetch: 1323527327000,
    //      lastFetch: 1323482789000,
    //      lastParse: 1323482791000,
    //      lastMaintenance: 1323436703000 },
    //   entries: 
    //    [ { id: 'http://push-pub.appspot.com/feed/93006',
    //        postedTime: 1323482787,
    //        updated: 1323482787,
    //        title: 'Hello',
    //        summary: '',
    //        content: 'World',
    //        actor: [Object] } ] }
  });
});
*/