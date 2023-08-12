//
//  File.swift
//  
//
//  Created by Ronan Furuta on 8/9/23.
//

import Foundation
import ArrivalGTFS
import Vapor

struct RawDataController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
       
        routes.grouped("v2").get("stations", use: stations)
        routes.grouped("v2").get("stations", "version", use: stationsVersion)
        routes.grouped("v2").get("station", ":stopId", use: station)
        
        routes.grouped("v2").get("trips", use: trips)
        routes.grouped("v2").get("trips", "version", use: tripsVersion)
        routes.grouped("v2").get("trip", ":tripId", use: trip)
        
        routes.grouped("v2").get("stoptimes","all", use: stoptimes)
        routes.grouped("v2").get("stoptimes","bytrip", ":tripId", use: stopTimesByTripId)
        routes.grouped("v2").get("stoptimes", "version", use: stoptimesVersion)
        routes.grouped("v2").get("stoptime", ":id", use: stoptime)
        
        routes.grouped("v2").get("routes", use: routesServer)
        routes.grouped("v2").get("routes", "version", use: routesVersion)
        routes.grouped("v2").get("route", ":id", use: route)
    }
    func stations(req: Request) async throws -> StationsResponse {
        return StationsResponse(hash: agtfs.db.stations.all.hashValue, stations: agtfs.db.stations.all, date: Date())
    }
    func stationsVersion(req: Request) async throws -> Int {
        return agtfs.db.stations.all.hashValue
    }
    func station(req: Request) async throws -> StationResponse {
        guard let station = agtfs.db.stations.byStopID(req.parameters.get("stopId") ?? "") else {
            throw Abort(.notFound)
        }
        return .init(id: req.parameters.get("stopId") ?? "", station: station, date: Date())
    }
    
    func trips(req: Request) async throws -> TripsResponse {
        return TripsResponse(hash: agtfs.db.trips.all.hashValue, trips: agtfs.db.trips.all, date: Date())
    }
    func tripsVersion(req: Request) async throws -> Int {
        return agtfs.db.trips.all.hashValue
    }
    func trip(req: Request) async throws -> TripDataResponse {
        guard let trip = agtfs.db.trips.byTripID(req.parameters.get("tripId") ?? "") else {
            throw Abort(.notFound)
        }
       
        return .init(id: req.parameters.get("tripId") ?? "", trip: trip, date: Date())
    }
    
    func stoptimes(req: Request) async throws -> StopTimesResponse {
        
       
            return .init(hash: agtfs.db.stopTimes.all.hashValue, stopTimes: agtfs.db.stopTimes.all, date: Date())
        
    }
    func stopTimesByTripId(req: Request) async throws -> StopTimesResponse {
        guard let tripId = req.parameters.get("tripId") else {
            throw Abort(.notAcceptable)
        }
        
       
            return .init(hash: (agtfs.db.stopTimes.byTripID(tripId) ?? []).hashValue, stopTimes: agtfs.db.stopTimes.byTripID(tripId) ?? [], date: Date())
        
    }
    func stoptimesVersion(req: Request) async throws -> Int {
        return agtfs.db.stopTimes.all.hashValue
    }
    func stoptime(req: Request) async throws -> StopTimeResponse {
        guard let stopTime = agtfs.db.stopTimes.byStopTimeID(req.parameters.get("id") ?? "") else {
           
            throw Abort(.notFound)
        }
       
        return .init(id: req.parameters.get("id") ?? "", stopTime: stopTime, date: Date())
    }
    
    func routesServer(req: Request) async throws -> RoutesResponse {
        return .init(hash: agtfs.db.routes.all.hashValue, routes: agtfs.db.routes.all, date: Date())
    }
    func routesVersion(req: Request) async throws -> Int {
        return agtfs.db.routes.all.hashValue
    }
    func route(req: Request) async throws -> RouteResponse {
        guard let result = agtfs.db.routes.byRouteID(req.parameters.get("id") ?? "") else {
           
            throw Abort(.notFound)
        }
       
        return .init(id: req.parameters.get("id") ?? "", route: result, date: Date())
    }
}

struct StationsResponse:Content {
    let hash: Int
    let stations: [Stop]
    let date: Date
}
struct StationResponse:Content {
    let id: String
    let station: Stop
    let date: Date
}

struct TripsResponse:Content {
    let hash: Int
    let trips: [Trip]
    let date: Date
}
struct TripDataResponse:Content {
    let id: String
    let trip: Trip
    let date: Date
}

struct StopTimesResponse:Content {
    let hash: Int
    let stopTimes: [StopTime]
    let date: Date
}
struct StopTimeResponse:Content {
    let id: String
    let stopTime: StopTime
    let date: Date
}

struct RoutesResponse:Content {
    let hash: Int
    let routes: [ArrivalGTFS.Route]
    let date: Date
}
struct RouteResponse:Content {
    let id: String
    let route: ArrivalGTFS.Route
    let date: Date
}
