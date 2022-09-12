const express = require('express'); // Library than creates and manages REST requests
const ejs = require('ejs'); // Library to render HTML pages for web browsers
const fetch = require('node-fetch');
var json2csv = require('json2csv'); // Library to create CSV for output
const { Headers } = fetch;

const app = express(); // Initialise the REST app

const getStatements = async (activity,verb,since,until) => {
  let myHeaders = new Headers();
  myHeaders.append(
    'Authorization',
    'Basic ' + process.env.KEY
  );
  myHeaders.append('Content-Type', 'application/json');
  myHeaders.append('X-Experience-API-Version', '1.0.0');

  let requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow',
  };
  // get paramters from search param in url

  let base = "https://theodi.learninglocker.net/data/xAPI/statements?";
  let args = [];
  if (verb) { args.push("verb="+verb); }
  if (activity) { args.push("activity="+encodeURIComponent(activity)); }
  if (since) { args.push("since="+since); }
  if (until) { args.push("until="+until); }
  var query = base + args.join('&');
  
  // insert params in fetch
  const getJson = async (query) => {

    const res = await fetch(
      query,
      requestOptions
    );
    return await res.json();
  }

  return await getJson(query);
}

function simplifyOutput(input) {
    var array = [];
    input.map((a) => {
        array.push(a.count);
    });
    return array;    
}


/* 
 * Function to handle the users REST request
 */
function handleRequest(req,res) {
    var filter = req.query;
    if (!filter.activity) {
        res.statusMessage = "You need to define an activity e.g. http://url.com/?activity=http://....";
        res.status(400).end();
    }

    var activity = filter.activity;
    var verb = "http://adlnet.gov/expapi/verbs/answered";
    var since = filter.since || null;
    var until = filter.until || null;
    var format = filter.format;

    getStatements(activity,verb,since,until).then((objects) => {
        var statements = objects.statements;
        
        var output = {};

        var csvOutput = [];

        output.object = statements[0].object;
        output.responses = [];
        output.success = 0;
        output.completion = 0;
        
        var responseArray = [];

        statements.map((a) => {
            result = a.result;
            responses = result.response.split('[,]');
            responses.map((response) => { 
                if (responseArray[response]) {
                    responseArray[response] += 1; 
                } else {
                    responseArray[response] = 1;
                }
            });
            if (result.success) {output.success += 1;}
            if (result.completion) {output.completion += 1;}
        });

        statements[0].object.definition.choices.map((a) => {
            var jsonres = {};
            jsonres.id = a.id;
            jsonres.count = responseArray[a.id] || 0;
            output.responses.push(jsonres);

            var csvres = {};
            csvres.answer = a.description.en;
            csvres.count = responseArray[a.id] || 0;
            csvOutput.push(csvres);
        });

        // Work out what the client asked for, the ".ext" specified always overrides content negotiation
        ext = req.params["ext"] || filter.format;
        // If there is no extension specified then manage it via content negoition, yay!
        if (!ext) {
           ext = req.accepts(['json','csv','html']);
        }

        // Return the data to the user in a format they asked for
        // CSV, JSON or by default HTML (web page)
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (ext == "csv") {
            res.set('Content-Type', 'text/csv');
            res.send(json2csv({ data: csvOutput }));
        } else if (ext == "json") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(output,null,4));
        } else if (ext == "chartjs") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(simplifyOutput(csvOutput),null,4));
        } else {
            //TODO
            ejs.renderFile(__dirname + '/page.html', { path: req.path, query: req.query }, function(err,csvOutput) {
                res.send(csvOutput);
            });
        }
    });
}
/*
 * Set the available REST endpoints and how to handle them
 */
app.get('/', function(req,res) { handleRequest(req,res); });
//app.get('/:column_heading/:value.:ext', function(req,res) { handleRequest(req,res); });
//app.get('/:column_heading/:value', function(req,res) { handleRequest(req,res); });

/*
 * Start the app!
 */
app.listen(3000, () => console.log('Example app listening on port 3000!'));
