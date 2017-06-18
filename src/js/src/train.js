/*

UK Transport v1.7

http://matthewtole.com/pebble/uk-transport/

----------------------

The MIT License (MIT)

Copyright © 2013 - 2014 Matthew Tole

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

--------------------

src/js/src/train.js

*/

/* global Pebble */
/* global MessageQueue */
/* global http */
/* exported Train */

var http = require('./libs/http');
var MessageQueue = require('./libs/js-message-queue.min')
var keen = require('./libs/keen')

var Train = function (options) {
  this.pebble = options.pebble || Pebble;
  this.messageQueue = options.messageQueue || MessageQueue;
  this.http = options.http || http;
  this.location = options.location || navigator.geolocation;

  this.debug = options.debug;
  this.keen = options.keen;
  this.version = options.version;
  this.api = options.api;

  this.onPebbleAppMessage = function (event) {
    var payload = event.payload;
    var group = payload.group.toLowerCase();
    if (group !== 'train') {
      return;
    }
    this.log('Payload', JSON.stringify(payload));
    var operation = payload.operation.toLowerCase();
    switch (operation) {
      case 'stations':
        try {
          opTrainStations.call(this, payload.data);
        }
        catch (ex) {
          this.log('Error', JSON.stringify(ex));
        }
        break;
      case 'departures':
        try {
          opTrainDepartures.call(this, payload.data);
        }
        catch (ex) {
          this.log('Error', JSON.stringify(ex));
        }
        break;
    }
  };

  function opTrainStations() {

    var timeLocation = new Date();
    var timeLookup = null;

    var locationOptions = {
      enableHighAccuracy: false,
      timeout: 10 * 1000,
      maximumAge: 60 * 1000
    };
    this.location.getCurrentPosition(locationCallback.bind(this), locationError.bind(this), locationOptions);

    function locationCallback(position) {
      trackTimeTaken.call(this, timeLocation, 'train.location');
      logTimeElapsed.call(this, timeLocation, 'Getting location took %TIME%.');
      var requestData = {
        lon: position.coords.longitude,
          lat: position.coords.latitude,
	  stoptypes: "NaptanRailStation",
	  modes: "national-rail",
	  radius: 2000
      };
      timeLookup = new Date();
      this.http.get(this.api.stations, requestData, requestCallback.bind(this));
    }

    function locationError() {
      trackTimeTaken.call(this, timeLocation, 'train.locationError');
      logTimeElapsed.call(this, timeLocation, 'Failing to get location took %TIME%.');
      this.messageQueue.sendAppMessage({ group: 'TRAIN', operation: 'ERROR', data: 'Location access failed.' });
    }

    function requestCallback(err, data) {
      if (err) {
        // TODO
        return console.log(err);
      }
      trackTimeTaken.call(this, timeLookup, 'train.stations');
      logTimeElapsed.call(this, timeLookup, 'Finding nearest stations took %TIME%.');
      var stations = data.stopPoints;
      var responseData = [];
      responseData.push(stations.length);
      stations.forEach(function (station) {
        responseData.push(station.id);
        responseData.push(station.commonName);
      });
      this.messageQueue.sendAppMessage({ group: 'TRAIN', operation: 'STATIONS', data: responseData.join('|') });
    }
  }

  function opTrainDepartures(data) {
    var code = data;
    var requestData = {
	//station: code
    };
      this.http.get(this.api.departures.replace("_STATION_", code), requestData, function (err, data) {
      if (err) {
        switch (err.message) {
        case 'NOT_CONNECTED':
          this.messageQueue.sendAppMessage({ group: 'TRAIN', operation: 'ERROR', data: 'Not online.' });
          return;
        default:
          this.messageQueue.sendAppMessage({ group: 'TRAIN', operation: 'ERROR', data: 'Unknown HTTP error.' });
          return;
        }
      }
      var departures = data;
      var responseData = [];
      responseData.push(departures.length);
      departures.forEach(function (departure) {
        /*jshint -W106*/
          responseData.push(departure.destinationName);
	  var d = new Date(Date.parse(departure.expectedArrival));
	  responseData.push(d.toString().slice(16,21)); 	  
          responseData.push(departure.lineName); // can't find status in this API
        responseData.push(departure.platformName);
        /*jshint +W106*/
      });
      this.messageQueue.sendAppMessage({ group: 'TRAIN', operation: 'DEPARTURES', data: responseData.join('|') });
    }.bind(this));
  }

  function logTimeElapsed(start, message) {
    var now = new Date();
    var totalMs = now.getTime() - start.getTime();
    this.log(message.replace('%TIME%', totalMs + 'ms'));
  }

  function trackTimeTaken(start, event) {
    var now = new Date();
    if (this.keen) {
      this.keen.sendEvent('time.taken', { event: event, msTaken: now.getTime() - start.getTime() });
    }
  }

};

Train.prototype.log = function () {
  if (! this.debug) {
    return;
  }
  var pieces = [ 'UK Transport', this.version, 'Train' ];
  pieces = pieces.concat(Array.prototype.slice.call(arguments));
  console.log(pieces.join(' // '));
};

Train.prototype.init = function() {
  this.pebble.addEventListener('appmessage', this.onPebbleAppMessage.bind(this));
  this.log('Ready');
};

module.exports = Train;
