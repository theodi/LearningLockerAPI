# Learning Locker aggregator API

Works with learning locker LRS and provides an API that can enable the export of aggregate statistics for dashboards.

Work in progress.

So for you can query for an adapt MCQ acticity URI and it will return the object description and aggregate results including cloices, number of people who succeeded and number of completions. 

http://{home_url}/?activiy={activity-uri}

The following params are also supported:

since = date
until = date

# Installing your own

1) Clone this repository

2) npm install 

3) node index.js
