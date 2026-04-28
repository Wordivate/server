require("dotenv").config();
const http = require("http");
const app = require("./app");
const { Server } = require("socket.io");
const initSocket = require("./socket");

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

initSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
