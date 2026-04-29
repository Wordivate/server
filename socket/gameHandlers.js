function registerGameHandlers(io, socket, rooms) {
  socket.on("start_game", () => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "host" || room.phase !== "ready") return;

    room.phase = "playing";
    room.currentQuestion = 0;
    io.to(roomCode).emit("game_started");

    const q = room.questions[0];
    io.to(roomCode).emit("new_question", {
      index: 0,
      text: q.text,
      total: room.questions.length,
    });
  });

  socket.on("submit_answer", ({ questionIndex, answer }) => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "player" || room.phase !== "playing") return;
    if (room.currentQuestion !== questionIndex) return;

    // Ambil 1 kata saja, lowercase
    const cleanAnswer = answer.trim().split(/\s+/)[0].toLowerCase();
    room.players[socket.id].answers[questionIndex] = cleanAnswer;

    // Kumpulkan semua jawaban soal ini
    const answers = Object.values(room.players)
      .map((p) => p.answers[questionIndex])
      .filter(Boolean);

    // Broadcast ke host saja untuk wordcloud
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
