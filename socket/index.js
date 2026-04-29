const rooms = {}; // { [roomCode]: RoomState }

const { registerRoomHandlers } = require("./roomHandlers");
const { registerGameHandlers } = require("./gameHandlers");
const { registerGeminiHandlers } = require("./geminiHandlers");

function initSocket(io) {
  io.on("connection", (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    registerRoomHandlers(io, socket, rooms);
    registerGameHandlers(io, socket, rooms);
    registerGeminiHandlers(io, socket, rooms);

    socket.on("disconnect", () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      for (const [code, room] of Object.entries(rooms)) {
        if (room.hostId === socket.id) {
          io.to(code).emit("host_disconnected");
          delete rooms[code];
        }
      }
    });
  });
}

module.exports = initSocket;
