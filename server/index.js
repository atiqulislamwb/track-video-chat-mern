const express = require("express");
const app = express();
const cors = require("cors");
const http = require("http");
const axios = require("axios");
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

  const ip = req?.ip;

  // Get user's location based on IP address
  const locationResponse = await axios.get(
    `https://geo.ipify.org/api/v2/country,city?apiKey=at_o6wJvZuxvDKTtBXgPugx5kZEhrbcN&ipAddress=${ip}`
  );
  const locationData = locationResponse?.data;
  const { city, region, country } = locationData?.location;

  // Get user's browser and device information based on User-Agent header
  const parser = new UAParser();
  const userAgent = req?.headers["user-agent"];
  const result = parser?.setUA(userAgent).getResult();
  const browserName = result?.browser.name;
  const deviceName = result?.device?.vendor + " " + result?.device?.model;

  let visit = {
    timestamp: new Date(),
    ip,
    browser: browserName,
    device: deviceName,
    location: `${country}, ${city}, ${region}`,
  };

  visits.push(visit);

  // Emit a notification to the admin dashboard
  io.on("connection", (socket) => {
    var visitorId = socket.id;
    var visitorIpAddress = socket.handshake.address;

    socket.on("updateActivityStatus", (activityStatus) => {
      visit.active = activityStatus;

      io.emit("newVisit", visit);
      console.log(visit);

      // Update database record for visitor with visitorId to include activityStatus
    });
  });

  // Listen for user activity events and update the activity status accordingly
  let active = true;
  const inactivityThreshold = 30000; // 30 seconds
  let lastActivityTime = Date.now();

  function updateUserActivity() {
    const currentTime = Date.now();
    const timeSinceLastActivity = currentTime - lastActivityTime;

    if (timeSinceLastActivity > inactivityThreshold && active) {
      active = false;
      socket.emit("updateActivityStatus", false);
    } else if (timeSinceLastActivity <= inactivityThreshold && !active) {
      active = true;
      socket.emit("updateActivityStatus", true);
    }

    setTimeout(updateUserActivity, 1000);
  }

  updateUserActivity();

  // Listen for user activity events and update the lastActivityTime variable
  const userActivityEvents = ["mousemove", "keydown", "click"];

  function handleUserActivityEvent() {
    lastActivityTime = Date.now();
  }

  userActivityEvents.forEach((event) => {
    socket.on(event, handleUserActivityEvent);
  });

  res.send({ msg: "Users Information", user: visit });
});

// io.on("connection", (socket) => {
//   console.log("Client connected");

//   socket.on("user-visit", (visitor) => {
//     activeUsers.add(visitor.id);
//     io.emit("active-users", Array.from(activeUsers));
//   });

//   socket.on("user-leave", (visitor) => {
//     activeUsers.delete(visitor.id);
//     io.emit("active-users", Array.from(activeUsers));
//   });

//   socket.on("disconnect", () => {
//     console.log("Client disconnected");
//   });
// });

server.listen(PORT, async () => {
  await connect();
  console.log(`Server listening on port ${PORT}`);
});
