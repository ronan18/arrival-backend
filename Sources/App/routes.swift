import Vapor
import ArrivalGTFS
func routes(_ app: Application) throws {
    app.get("/", use: {req in
        print("req root")
        return req.redirect(to: "https://arrival.city", redirectType: .normal)
    })

   
    
    try app.register(collection: RawDataController())
   // try app.register(collection: HashesController())
    try app.register(collection: RouteController())
    try app.register(collection: ArrivalsControllers())
   // print(app.routes.all)
}
