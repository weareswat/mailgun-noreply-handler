# Mailgun noreply handler

A small node.js project that listens to messages sent by Mailgun to an endpoint and replies with a template message. This would typically be used to implement a noreply autoresponder. 

## Context

Implementing a noreply autoresponder can create the problem of infinite loops. This happens when an autoreply is sent to a recipient that is also an autoreply. 

While this is a commonly used feature, there's no standard way of preventing infinite loops. There are, however, a few headers that can be used to minimize it:

* X-Auto-Response-Suppress 
* X-MS-Exchange-Inbox-Rules-Loop
* In-Reply-To
* Auto-Submitted

## How it works

The endpoint implemented in this app is called by Mailgun by using a route. This sends the email in a POST request, and we can access the original email headers and content. 

If any of the headers mentioned above is found, we don't send a reply message. This makes us well behaved. However, an infinite loop may still happen, as it's not mandatory that email clients respect these headers. 

To get around that issue, we cache all senders for an hour. If an email address is cached, we don't reply.

## Installing

    npm install

## Configuration and launching

Configuration can be found in `config/default.json`. I used the `config` npm package. Which means you can override the values by setting environment variables or passing parameters to node. This prevents Mailgun api keys and other data to be public. 

Here's an example using parameters:

    npm start -- --NODE_CONFIG='{"mailgun":{"api_key":"your_mailgun_api_key", "domain":"example.com"}, "reply":{"sender":"noreply@example.com"}}'

The full list of params that can be specified includes Bugsnag and Librato, but feel free to ignore them if you don't use them. 

    npm start -- --NODE_CONFIG='{"mailgun":{"api_key":"your_mailgun_api_key", "domain":"example.com"}, "reply":{"sender":"noreply@example.com"}, "bugsnag":{"api_key": "your_bugsnag_api_key"}, "librato": {"email":"your_librato_account", "token":"your_token"}}'
    
## Additional notes

Take this as an example. I tried to keep it as simple as possible. All the code is in `index.js`.

Caching is done in memory. The goal is to prevent infinte loops, not to have a bulletproof distributed caching.  