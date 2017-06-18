from flask import Flask, request

import json
import requests
import datetime

import isodate
import pytz

app = Flask(__name__)

API_BASE = "https://api.tfl.gov.uk"
LONDON = pytz.timezone('Europe/London')
STOPPOINTS_BUS = 'stoptypes=NaptanBusCoachStation,NaptanPublicBusCoachTram&modes=bus&radius=500'
STOPPOINTS_TRAIN = 'stoptypes=NaptanRailStation&modes=national-rail&radius=2000'


#curl https://api.tfl.gov.uk/StopPoint/meta/StopTypes

#["CarPickupSetDownArea","NaptanAirAccessArea","NaptanAirEntrance","NaptanAirportBuilding","NaptanBusCoachStation","NaptanBusWayPoint","NaptanCoachAccessArea","NaptanCoachBay","NaptanCoachEntrance","NaptanCoachServiceCoverage","NaptanCoachVariableBay","NaptanFerryAccessArea","NaptanFerryBerth","NaptanFerryEntrance","NaptanFerryPort","NaptanFlexibleZone","NaptanHailAndRideSection","NaptanLiftCableCarAccessArea","NaptanLiftCableCarEntrance","NaptanLiftCableCarStop","NaptanLiftCableCarStopArea","NaptanMarkedPoint","NaptanMetroAccessArea","NaptanMetroEntrance","NaptanMetroPlatform","NaptanMetroStation","NaptanOnstreetBusCoachStopCluster","NaptanOnstreetBusCoachStopPair","NaptanPrivateBusCoachTram","NaptanPublicBusCoachTram","NaptanRailAccessArea","NaptanRailEntrance","NaptanRailPlatform","NaptanRailStation","NaptanSharedTaxi","NaptanTaxiRank","NaptanUnmarkedPoint","TransportInterchange"]

@app.route("/uk-transport/bus/stops.json")
def bus_stops():
    lat = request.args['lat']
    lon = request.args['lon']
    resp = requests.get('{}/Stoppoint?lat={}&lon={}&{}'.format(
        API_BASE, lat, lon, STOPPOINTS_BUS))
    assert resp.ok
    obj = json.loads(resp.content)
    stops = []
    for sp in obj['stopPoints']:
        stops.append({"atcocode": sp["id"],
                      "name": sp["commonName"],
                      "indicator": sp["indicator"],})
    
    return json.dumps(
        {
        "stops": stops
            })


@app.route("/uk-transport/train/stations.json")
def train_stations():
    lat = request.args['lat']
    lon = request.args['lon']
    resp = requests.get('{}/Stoppoint?lat={}&lon={}&{}'.format(
        API_BASE, lat, lon, STOPPOINTS_TRAIN))
    assert resp.ok
    obj = json.loads(resp.content)
    stops = []
    for sp in obj['stopPoints']:
        stops.append({"code": sp["id"],
                      "name": sp["commonName"],
        })
    
    return json.dumps(
        {
        "stops": stops
            })


def whendue(isowhen):
    dt = isodate.parse_datetime(isowhen)
    lontime = dt.astimezone(LONDON)
    return "{:02d}:{:02d}".format(lontime.hour,
                                  lontime.minute)

@app.route("/uk-transport/bus/departures.json")
def bus_departures():
    stop = request.args['stop']

    resp = requests.get('{}/StopPoint/{}/arrivals'.format(API_BASE,
                                                          stop))
    assert resp.ok
    obj = json.loads(resp.content)
    buses = [{'line': o['lineName'],
              'direction': o['destinationName'],
               # best_departure_estimate?
              'best_departure_estimate': whendue(o['expectedArrival']),}
             for o in obj]
    buses = sorted(buses, key=lambda b: b['best_departure_estimate'])
    return json.dumps({"departures":{"all":buses}})


@app.route("/uk-transport/train/departures.json")
def train_departures():
    stop = request.args['stop']

    resp = requests.get('{}/StopPoint/{}/arrivals'.format(API_BASE,
                                                          stop))
    assert resp.ok
    obj = json.loads(resp.content)
    trains = [{'line': o['lineName'],
              'direction': o['destinationName'],
               # best_departure_estimate?
              'best_departure_estimate': whendue(o['expectedArrival']),}
             for o in obj]
    trains = sorted(trains, key=lambda b: b['best_departure_estimate'])
    return json.dumps({"departures":{"all":trains}})


if __name__ == "__main__":
    app.run(host='0.0.0.0')
