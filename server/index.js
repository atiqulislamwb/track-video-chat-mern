const express = require("express");
const app = express();
const cors = require("cors");
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server);
const PORT = 5000;
const geoip = require("geoip-lite");
const UAParser = require("ua-parser-js");
const { MongoClient, ServerApiVersion } = require("mongodb");
app.use(cors());
app.use(express.json());
const visits = [];
const activeUsers = new Set();
function getVisitorDevice(visitor) {
  const ua = visitor; // Assuming you have the visitor's user agent in the visitor object

  const parser = new UAParser(ua);
  const parsedUA = parser.getResult();

  if (parsedUA.device && parsedUA.device.model) {
    return parsedUA.device.model;
  } else {
    return "Unknown";
  }
}

function getVisitorLocation(visitor) {
  const ip = visitor; // Assuming you have the visitor's IP address in the visitor object

  const location = geoip.lookup(ip);

  if (location) {
    const { city, region, country } = location;
    return `${city}, ${region}, ${country}`;
  } else {
    return "Unknown";
  }
}

const uri =
  "mongodb+srv://aptdeco:1234567890@cluster0.gdutw1d.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const _db = client.db("serviceBell");
const Visitors = _db.collection("visitors");
const connect = async () => {
  await client.connect();
};

app.get("/", async (req, res) => {
  // Record the visitor's information
  const visit = {
    timestamp: new Date(),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    browser: req.headers["user-agent"].split(" ")[0],
    location: getVisitorLocation(req.ip), // Assuming you have a function that gets the visitor's location based on their IP address
    device: getVisitorDevice(req.headers["user-agent"]), // Assuming you have a function that gets the visitor's device based on their user agent
  };

  visits.push(visit);
  await Visitors.findOne({ ip: req.ip }, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }

    if (!result) {
      // If no record was found, insert a new record with the visitor's IP address
      Visitors.insertOne({ ip: req.ip }, (err) => {
        if (err) {
          console.log(err);
          return;
        }

        // Add the visitor to the set of active users and emit the updated set to all clients
        activeUsers.add(req.ip);
        io.emit("active-users", Array.from(activeUsers));
      });
    } else {
      // If a record was found, do not add the visitor to the set of active users
      console.log(
        `Visitor with IP address ${req.ip} already exists in the database`
      );
    }
  });

  // Emit a notification to the admin dashboard
  io.emit("newVisit", visit);

  res.send({ msg: "Users Information", user: visit });
});

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("user-visit", (visitor) => {
    activeUsers.add(visitor.id);
    io.emit("active-users", Array.from(activeUsers));
  });

  socket.on("user-leave", (visitor) => {
    activeUsers.delete(visitor.id);
    io.emit("active-users", Array.from(activeUsers));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

server.listen(PORT, async () => {
  await connect();
  console.log(`Server listening on port ${PORT}`);
});
