//
//  File.swift
//  
//
//  Created by Ronan Furuta on 8/9/23.
//
import Vapor
import Foundation
import ArrivalGTFS
struct ArrivalsControllers: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let route = routes.grouped("v2").grouped("trains")
        route.get(":from", ":at", use: arrivals)
        route.get(":from", use: arrivals)
      
    }
    func arrivals(req: Request) async throws -> ArrivalsResponse {
        let time = Date()
        guard let fromStationID = req.parameters.get("from") else {
            throw Abort(.notFound)
        }
        
        guard let fromStation = agtfs.db.stations.byStopID(fromStationID) else {
            throw Abort(.notFound)
        }
        
        var at = Date()
        
        if let time = req.parameters.get("at") {
            guard let time = Double(time) else {
                throw Abort(.notAcceptable)
            }
             let newDate = Date(timeIntervalSince1970: time) 
            at = newDate
        }
       
      //  print(at.formatted(), at.bayTime)
        print("init in", time.timeIntervalSinceNow)
        let stopTimes = await agtfs.arrivals(for: fromStation, at: at)
        print("\(stopTimes.count) stoptimes in", time.timeIntervalSinceNow)
        var trips: [String: Trip] = [:]
        var routes: [String: ArrivalGTFS.Route] = [:]
        
        for stopTime in stopTimes {
          
            guard let trip = agtfs.db.trips.byTripID(stopTime.tripId) else {continue }
            trips[stopTime.tripId] = trip
           
            guard let route = agtfs.db.routes.byRouteID(trip.routeId) else {continue}
            routes[route.routeId] = route
            
        }
        req.logger.log(level: .info, "req arrials from \(fromStation.stopName) at localtime:\(at) baytime:\(at.bayTime) \(stopTimes.count) stop times found in \(Date().timeIntervalSince(time))s")
        print("loaded in", time.timeIntervalSinceNow)
        return ArrivalsResponse(stopTimes: stopTimes, trips:trips, routes: routes, time: at)
    }
}
