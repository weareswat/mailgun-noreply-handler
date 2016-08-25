var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var config = require('config');
var fs = require('fs');
var bugsnag = require('bugsnag');
var librato = require('librato-node');

// Safely ignore this. Easier to work with Azure App settings
function getConfig(key) {
    var configVal = config.has(key) ? config.get(key) : '';
    return process.env[key] || configVal;
}

// Safely ignore this. We use bugsnag for error reporting
bugsnag.register(getConfig("bugsnag.api_key"));
app.use(bugsnag.requestHandler);
app.use(bugsnag.errorHandler);

// Safely ignore this. We use librato for data collection. 
librato.configure({email: getConfig("librato.email"), token: getConfig("librato.token")});
librato.start();
process.once('SIGINT', function() {
  librato.stop();
  process.exit();
});
librato.on('error', function(err) {
  console.error(err);
});

// This is where the fun begins
var api_key = getConfig('mailgun.api_key');
var domain = getConfig('mailgun.domain');
var senderEmail = getConfig('reply.sender');

console.log('Init mailgun. api_key=%s domain=%s sender=%s', api_key, domain, senderEmail);

var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

var cache = require('memory-cache');

// create application/json parser
var jsonParser = bodyParser.json();

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

var templatePath = getConfig('reply.template');
console.log('Using template in %s', templatePath);
var template = fs.readFileSync(templatePath, 'utf8');

app.post('/', urlencodedParser, function(req, res) {
    librato.increment('mailgun-noreply-requests');

    var fromEmail = req.body['from'];
    
    // This makes us well behaved. Don't reply if any of these headers are present.
    var hasLoops = hasLoopHeaders(req.body);
    // This makes sure no infinite loops happen
    var isCached = isCachedEmail(fromEmail);
    

    console.log('fromEmail: %s isCached: %s hasLoops: %s', fromEmail, isCached, hasLoops);

    if (!hasLoops && !isCached) {
        sendMessage(req.body['from'], req.body['subject'], req.body['body-html'], function(err) {
            if(err != null) {
                bugsnag.notify(err);
                res.status(500).send({error: err});
            } else {
                librato.increment('mailgun-noreply-replied');
                res.send({action: 'replied'}); 
            }
        });
    } else {
        console.log('skipping');
        librato.increment('mailgun-noreply-skipped');
        res.send({action: 'skipped'});
    }
    
});

var port = process.env.PORT || process.env.port || 3000;
var server = app.listen(port, function() {
    console.log('Express is listening in port %s', port);
});

function isCachedEmail(fromEmail) {
    if (cache.get(fromEmail) != null)
        return true;
    
    // Cache for 15 minutes. Why 15 minutes? No particular reason, seems like a good number.
    cache.put(fromEmail, '1', 900000);
    return false;
}

function hasLoopHeaders(msgContents) {
    if (msgContents['X-Auto-Response-Surpress'] == 'All')
        return true;
    if (msgContents['Auto-Submitted'] == 'auto-replied')
        return true;
    if (msgContents['X-MS-Exchange-Inbox-Rules-Loop'])
        return true;

    return false;
}

function sendMessage(toEmail, originalSubject, originalBody, cb) { 
    var data = {
        from: senderEmail,
        to: toEmail,
        subject: 'Re: ' + originalSubject,
        html: template + originalBody
    };
    data['h:X-Auto-Response-Suppress'] = 'All';
    data['h:X-MS-Exchange-Inbox-Rules-Loop'] = senderEmail;
    data['h:In-Reply-To'] = toEmail;
    data['h:Auto-Submitted'] = 'auto-replied';

    mailgun.messages().send(data, function(error, body) {
        if (error != null) {
            console.log(error);
            return cb(error);
        }
        return cb(null);
    });
}
