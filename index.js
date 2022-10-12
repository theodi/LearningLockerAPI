const express = require('express'); // Library than creates and manages REST requests
const ejs = require('ejs'); // Library to render HTML pages for web browsers
const fetch = require('node-fetch');
var json2csv = require('json2csv'); // Library to create CSV for output
const { Headers } = fetch;


const app = express(); // Initialise the REST app

const execQuery = async (query) => {
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

    let base = "https://theodi.learninglocker.net";
    query = base + query;

    const getJson = async (query) => {
        try {
            const res = await fetch(
                query,
                requestOptions
            );
            return await res.json();
        }
        // catch error and return 404 to user 
        catch (error) {
            res.statusMessage = "Internal server error";
            res.status(500).end();
            res.send();
            return;
        }
    };
    return await getJson(query);
}

const getStatements = async (activity, verb, since, until, related_activities) => {
    let base = "/data/xAPI/statements?";
    let args = [];
    if (verb) { args.push("verb=" + verb); }
    if (activity) { args.push("activity=" + encodeURIComponent(activity)); }
    if (since) { args.push("since=" + since); }
    if (until) { args.push("until=" + until); }
    if (related_activities) { args.push("related_activities=true"); }
    var query = base + args.join('&');

    return await execQuery(query);
}

function simplifyOutput(input) {
    var array = [];
    input.map((a) => {
        array.push(a.count);
    });
    return array;
}

var promises = [];
var resolved = false;

/* 
 * Function to handle the users REST request
 */
function handleRequest(req, res) {
    resolved = false;
    promises = [];
    var filter = req.query;
    if (!filter.activity) {
        res.statusMessage = "You need to define an activity e.g. http://url.com/?activity=http://....";
        res.status(400).end();
        res.send();
        return;
    }

    var activity = filter.activity;
    var verb = filter.verb || null;
    var since = filter.since || null;
    var until = filter.until || null;
    var related_activities = filter.related_activities || false;
    var format = filter.format;

    if (verb == "http://adlnet.gov/expapi/verbs/answered") {
        processQuestion(req,res,activity,verb,since,until,filter);
    } else {
        processRequest(req,res,activity,verb,since,until,related_activities,filter);
    }
}

function getCombinedProgress(eProg,nProg) {
    for (const [key, value] of Object.entries(eProg)) {
        if (nProg[key]) {
            eProg[key] = [...eProg[key],...nProg[key]];
        } 
    }
    return {...nProg,...eProg};
}

const getNestedActors = (arr) => {
    var combined = {};
    for (var i=0; i<arr.length;i++) {
        actors = arr[i].actors;
        for (const [key, value] of Object.entries(actors)) {
            if (combined[key]) {
                combined[key].progress = getCombinedProgress(combined[key].progress,actors[key].progress);
            } else {
                combined[key] = value;
            }
        }
    }
    return combined;
}

const getNestedObjects = (arr) => {
    var combined = {};
    for (var i=0; i<arr.length;i++) {
        objects = arr[i].objects;
        for (const [key, value] of Object.entries(objects)) {
            if (combined[key]) {
                // IGNORE and continue;
            } else {
                combined[key] = value;
            }
        }
    }
    return combined;
}

function getSessionTime(sortedList) {
    var paused = false;
    var lastTime = null;
    var timeSpent = 0;
    for (var i=0;i<sorted.length;i++) {
      verb = sorted[i].verb;
      timestamp = sorted[i].timestamp;
      if (verb == "http://adlnet.gov/expapi/verbs/launched" || verb == "http://adlnet.gov/expapi/verbs/resumed" || verb == "http://adlnet.gov/expapi/verbs/initialized") {
        paused = false;
        lastTime = timestamp;
      }
      if (verb == "http://adlnet.gov/expapi/verbs/suspended" || verb == "http://adlnet.gov/expapi/verbs/terminated") {
        if (!paused && lastTime) {
          timeSpent += new Date(timestamp) - new Date(lastTime);
          lastTime = null;
        }
      }
    }
    return Math.round(timeSpent / 1000);
}

function calculateSessionTimes(objects) {
    for (const [key, value] of Object.entries(objects)) {
        var sessionTime = value.progress.sessionTime;
        sorted = sessionTime.sort(
            (objA, objB) => new Date(objA.timestamp) - new Date(objB.timestamp),
        );
        objects[key].timeSpentSeconds = getSessionTime(sorted);
    }
    return objects;
}

function processRequest(req,res,activity,verb,since,until,related_activities,filter) {
    getStatements(activity, verb, since, until, related_activities).then((objects) => {
        promises.push(new Promise((resolve,reject) => {
            resolve(processObjects(objects,activity,related_activities));
        }));
        var resolve = setInterval(() => {
            if (resolved == true) {
                clearInterval(resolve);
                Promise.all(promises).then((values) =>{
                    var output = {};
                    console.log("All promises returned");
                    output.actors = calculateSessionTimes(getNestedActors(values));
                    output.objects = getNestedObjects(values);
                    console.log("done processing");
                    processReturn(req,res,filter,output); 
                });
            }
        },100);
    });
}

//START OF FUNCTION TO PROCESS OBJECTS
function processObjects(objects,activity,related_activities) {
        var output = {};
        console.log("Processing objects");
        if (!objects) {
            res.statusMessage = "Internal server error";
            res.status(500).end();
            res.send();
            return;
        }
        if (objects.more) {
            console.log("Adding promise to the array");
            promises.push(new Promise((resolve,reject) => {
                execQuery(objects.more).then((objects) => {
                    resolve(processObjects(objects,activity,related_activities));
                });
            }));
        } else {
            resolved = true;
        }
        
        var statements = objects.statements;
        if (statements.length < 1 || !statements) {
            res.statusMessage = "No data found for activity " + activity + " with verb " + verb;
            res.status(404).end();
            res.send();
            return;
        }

        if (!related_activities) {
            output.object = statements[0].object;
        } else {
            output.objects = {};
        }
        output.actors = {};

        try {
            statements.map((a) => {
                actorid = a.actor.account.name;
                objectid = a.object.id;
                if (related_activities && !output.objects[objectid]) {
                    output.objects[objectid] = a.object;    
                }
                if (!output.actors[actorid]) {
                    output.actors[actorid] = a.actor;
                    progress = {};
                } else {
                    progress = output.actors[actorid].progress;
                }
                verb = a.verb.id;
                if(objectid == activity) {
                    if (verb == "http://adlnet.gov/expapi/verbs/passed") {
                        objectid = "passed";
                    } else if (verb == "http://adlnet.gov/expapi/verbs/completed") {
                        objectid = "completed";
                    } else { 
                        objectid = "sessionTime";
                    }
                }
                if (!progress[objectid]){
                    progress[objectid] = [];
                    statement = {};
                    statement.verb = a.verb.id;
                    statement.timestamp = a.timestamp;
                    progress[objectid].push(statement);
                } else {
                    statement = {};
                    statement.verb = a.verb.id;
                    statement.timestamp = a.timestamp;
                    progress[objectid].push(statement);
                }
                output.actors[actorid].progress = progress;
            });
        } catch (error) {
            console.log(error);
            output.success = "unknown";
            output.completion = "unknown";
        }
        return output;
}
        // CUT HERE TO MAKE OUTPUT THEN ROTATE IT FOR CSV

function makeCSVOutput(output) {
    var csvOutput = [];
    for (const [actorid, data] of Object.entries(output.actors)) {
        var item = {};
        item.actor = actorid;
        item.name = data.name || "";
        item.mbox = data.mbox || "";
        item.timeSpentSeconds = data.timeSpentSeconds || "";
        for (const [activityid, progressdata] of Object.entries(data.progress)) {
            if (progressdata[0].verb != "sessionTime") {
                item[activityid] = progressdata[0].verb;
            }
        }
        csvOutput.push(item);
    }
    return csvOutput;
}

function processReturn(req,res,filter,output) {
        // fix cannot set headers after they are sent to the client error
    
        // Work out what the client asked for, the ".ext" specified always overrides content negotiation
        ext = req.params["ext"] || filter.format;

        // If there is no extension specified then manage it via content negoition, yay!
        if (!ext) {
            ext = req.accepts(['json', 'csv', 'html']);
        }

        // Return the data to the user in a format they asked for
        // CSV, JSON or by default HTML (web page)
        res.set('Access-Control-Allow-Origin', '*');
        if (ext == "csv") {
            res.set('Content-Type', 'text/csv');
            res.send(json2csv({ data: makeCSVOutput(output) }));
        } else if (ext == "json") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(output, null, 4));
        } else if (ext == "chartjs") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(simplifyOutput(makeCSVOutput(output)), null, 4));
        } else {
            ejs.renderFile(__dirname + '/page.html', { path: req.path, query: req.query }, function (err, csvOutput) {
                res.send(csvOutput);
            });
        }
}

function processQuestion(req,res,activity,verb,since,until,filter) {
    getStatements(activity, verb, since, until, false).then((objects) => {
        if (!objects) {
            res.statusMessage = "Internal server error";
            res.status(500).end();
            res.send();
            return;
        }
        var statements = objects.statements;
        if (statements.length < 1 || !statements) {
            res.statusMessage = "No data found for activity " + activity + " with verb " + verb;
            res.status(404).end();
            res.send();
            return;
        }

        var output = {};

        var csvOutput = [];

        output.object = statements[0].object;

        output.responses = [];
        output.success = 0;
        output.completion = 0;

        var responseArray = [];

        try {
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
                if (result.success) { output.success += 1; }
                if (result.completion) { output.completion += 1; }
            });
        } catch (error) {
            output.success = "unknown";
            output.completion = "unknown";
        }

        try {
            statements[0].object.definition.choices.map((a) => {
                let jsonres = {};
                jsonres.id = a.id;
                jsonres.count = responseArray[a.id] || 0;
                output.responses.push(jsonres);

                let csvres = {};
                try {
                    csvres.answer = a.description.en;
                } catch (error) {
                    csvres.answer = a.id;
                }
                csvres.count = responseArray[a.id] || 0;
                csvOutput.push(csvres);
            });
        } catch (error) {
            // Do nothing
        }
        
        // fix cannot set headers after they are sent to the client error
    
        // Work out what the client asked for, the ".ext" specified always overrides content negotiation
        ext = req.params["ext"] || filter.format;

        // If there is no extension specified then manage it via content negoition, yay!
        if (!ext) {
            ext = req.accepts(['json', 'csv', 'html']);
        }
        // Return the data to the user in a format they asked for
        // CSV, JSON or by default HTML (web page)
        res.set('Access-Control-Allow-Origin', '*');
        if (ext == "csv") {
            res.set('Content-Type', 'text/csv');
            res.send(json2csv({ data: csvOutput }));
        } else if (ext == "json") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(output, null, 4));
        } else if (ext == "chartjs") {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(simplifyOutput(csvOutput), null, 4));
        } else {
            ejs.renderFile(__dirname + '/page.html', { path: req.path, query: req.query }, function (err, csvOutput) {
                res.send(csvOutput);
            });
        }
    });
}

/*
 * Set the available REST endpoints and how to handle them
 */
app.get('/', function (req, res) { handleRequest(req, res); });
//app.get('/:column_heading/:value.:ext', function(req,res) { handleRequest(req,res); });
//app.get('/:column_heading/:value', function(req,res) { handleRequest(req,res); });

/*
 * Start the app!
 */

var port = process.env.PORT || 3000;
app.listen(port, () => console.log('Listening on port ' + port));
