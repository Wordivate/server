function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function registerRoomHandlers(io, socket, rooms) {
  socket.on("create_room", () => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      hostId: socket.id,
      phase: "lobby",
      questions: [],
      currentQuestion: 0,
      players: {},
    };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "host";
    socket.emit("room_created", { roomCode });
    console.log(`Room created: ${roomCode}`);
  });

  socket.on("join_room", ({ roomCode, nickname }) => {
    const room = rooms[roomCode];
    if (!room) {
      return socket.emit("join_error", { message: "Room tidak ditemukan." });
    }
    if (room.phase !== "lobby" && room.phase !== "ready") {
      return socket.emit("join_error", { message: "Game sudah dimulai." });
    }
    rooms[roomCode].players[socket.id] = { nickname, answers: [] };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "player";

    const playerList = Object.values(room.players).map((p) => ({
      nickname: p.nickname,
    }));
    io.to(roomCode).emit("player_joined", { players: playerList });
  });
}

module.exports = { registerRoomHandlers };
