function registerGameHandlers(io, socket, rooms) {
  socket.on("start_game", () => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "host" || room.phase !== "ready") return;

    room.phase = "playing";
    room.currentQuestion = 0;

    io.to(roomCode).emit("game_started");
  });

  socket.on("get_current_question", () => {
    const { roomCode } = socket.data;
    const room = rooms[roomCode];
    if (!room || room.phase !== "playing") return;

    const q = room.questions[room.currentQuestion];
    if (!q) return;

    socket.emit("new_question", {
      index: room.currentQuestion,
      text: q.text,
      total: room.questions.length,
    });
  });

  socket.on("submit_answer", ({ questionIndex, answer }) => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "player" || room.phase !== "playing") return;
    if (room.currentQuestion !== questionIndex) return;

    const cleanAnswer = answer.trim().split(/\s+/)[0].toLowerCase();
    room.players[socket.id].answers[questionIndex] = cleanAnswer;

    const answers = Object.values(room.players)
      .map((p) => p.answers[questionIndex])
      .filter(Boolean);

    io.to(room.hostId).emit("wordcloud_update", { answers });
  });

  socket.on("next_question", () => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "host" || room.phase !== "playing") return;

    room.currentQuestion += 1;
    if (room.currentQuestion >= room.questions.length) return;

    const q = room.questions[room.currentQuestion];
    io.to(roomCode).emit("new_question", {
      index: room.currentQuestion,
      text: q.text,
      total: room.questions.length,
    });
  });
}

module.exports = { registerGameHandlers };
