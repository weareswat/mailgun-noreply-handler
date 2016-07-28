var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var config = require('config');
var fs = require('fs');

var api_key = config.get('mailgun.api_key');
var domain = config.get('mailgun.domain');
var senderEmail = config.get('reply.sender');

console.log('Init mailgun. api_key=%s domain=%s sender=%s', api_key, domain, senderEmail);

var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

var cache = require('memory-cache');

// create application/json parser
var jsonParser = bodyParser.json();

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

var templatePath = config.get('reply.template');
console.log('Using template in %s', templatePath);
var template = fs.readFileSync(templatePath, 'utf8');

app.post('/', urlencodedParser, function(req, res) {
    var fromEmail = req.body['from'];
    
    // This makes us well behaved. Don't reply if any of these headers are present.
    var hasLoops = hasLoopHeaders(req.body);
    // This makes sure no infinite loops happen
    var isCached = isCachedEmail(fromEmail);
    

    console.log('fromEmail: %s isCached: %s hasLoops: %s', fromEmail, isCached, hasLoops);

    if (!hasLoops && !isCached) {
        sendMessage(req.body['from'], req.body['subject'], req.body['body-html'], function(err) {
            res.send({status: 'replied'});
        });
    } else {
        console.log('skipping');
        res.send({status: 'skipped'});
    }
    
});

var port = process.env.PORT || 3000;
var server = app.listen(port, function() {
    console.log('Express is listening to http://localhost:%s', port);
});

function isCachedEmail(fromEmail) {
    if (cache.get(fromEmail) != null)
        return true;
    
    // Cache for 1 hour
    cache.put(fromEmail, '1', 3600000);
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
