//
//  File.swift
//  
//
//  Created by Ronan Furuta on 8/9/23.
//

import Foundation
import Vapor
import ArrivalGTFS

public struct TripResponse: Content {
    let stopTimes: [String: StopTime]
    let trips: [String: Trip]
    let routes: [String: ArrivalGTFS.Route]
    let connections: [[Connection]]
    let time: Date
   
}

extension TripResponse: AsyncResponseEncodable {
    public func encodeResponse(for request: Vapor.Request) async throws -> Response {
        var headers = HTTPHeaders()
           headers.add(name: .contentType, value: "text/json")
        let data = try! JSONEncoder().encode(self)
        return .init(status: .ok, headers: headers, body: .init(string: String(decoding: data, as: UTF8.self)))
    }
    
    
}
