//
//  File.swift
//  
//
//  Created by Ronan Furuta on 8/9/23.
//

import Foundation
import Vapor
import ArrivalGTFS
struct RouteController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let route = routes.grouped("v2").grouped("plan")
        route.get(":from", ":to", ":at", use: departRoute)
        route.get(":from", ":to", "arrive", ":at", use: arriveRoute)
        route.get(":from", ":to", use: departRoute)
    }
    func departRoute(req: Request) async throws -> TripResponse {
        guard let fromStationID = req.parameters.get("from") else {
            throw Abort(.notAcceptable)
        }
        guard let toStationID = req.parameters.get("to") else {
            throw Abort(.notAcceptable)
        }
        guard let fromStation = agtfs.db.stations.byStopID(fromStationID) else {
            throw Abort(.notAcceptable)
        }
        guard let toStation = agtfs.db.stations.byStopID(toStationID) else {
            throw Abort(.notAcceptable)
        }
        var at = Date()
        
        if let time = req.parameters.get("at") {
            guard let time = Double(time) else {
                throw Abort(.notAcceptable)
            }
             let newDate = Date(timeIntervalSince1970: time) 
            at = newDate
        }
      let connections = await agtfs.findPaths(from: fromStation, to: toStation, at: at)
        var trips: [String: Trip] = [:]
        var routes: [String: ArrivalGTFS.Route] = [:]
        var stopTimes: [String: ArrivalGTFS.StopTime] = [:]
        for routePlan in connections {
            for connection in routePlan {
                guard let trip = agtfs.db.trips.byTripID(connection.tripId) else {continue }
                trips[connection.tripId] = trip
               
                guard let route = agtfs.db.routes.byRouteID(trip.routeId) else {continue}
                routes[route.routeId] = route
                guard let conStopTimes = agtfs.db.stopTimes.byTripID(trip.tripId) else {
                    continue
                }
                conStopTimes.forEach({stopTime in
                    stopTimes[stopTime.id] = stopTime
                })
                
            }
        }
        
        return TripResponse(stopTimes: stopTimes, trips:trips, routes: routes, connections: connections, time: at)
    }
    func arriveRoute(req: Request) async throws -> TripResponse {
        throw Abort(.notImplemented)
    }
}
