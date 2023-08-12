import Vapor
import ArrivalGTFS
func routes(_ app: Application) throws {
    app.get { req async in
        req.redirect(to: "https://arrival.city", redirectType: .normal)
    }

   
    
    try app.register(collection: RawDataController())
    try app.register(collection: RouteController())
    try app.register(collection: ArrivalsControllers())
   // print(app.routes.all)
}
