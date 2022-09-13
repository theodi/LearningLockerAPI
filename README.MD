# Learning Locker aggregator API

Works with learning locker LRS and provides an API that can enable the export of aggregate statistics for dashboards.

Work in progress.

So for you can query for an adapt MCQ acticity URI and it will return the object description and aggregate results including cloices, number of people who succeeded and number of completions. 

http://{home_url}/?activiy={activity-uri}

The following params are also supported:

since = date
until = date

Currently the "answered" verb is hardcoded so it will only look for activities where this exists.

# Installing your own

1) Clone this repository

2) npm install 

3) node index.js

# Some working test requests

http://localhost:3000/?activity=https://learning.theodi.org/xapi/activities/mit-moral-machine-test%23/id/630f81656b4097008b2afd6f_branching_0&format=chartjs#/id/630f81656b4097008b2afd6f_branching_0&format=chartjs
