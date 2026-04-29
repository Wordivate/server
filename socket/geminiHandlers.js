const { generateContent, parseGeminiJSON } = require("../helpers/gemini");

function registerGeminiHandlers(io, socket, rooms) {
  socket.on("generate_questions", async ({ topic } = {}) => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "host" || room.phase !== "lobby") return;
    if (!topic || typeof topic !== "string") {
      return socket.emit("gemini_error", { message: "Topik wajib diisi." });
    }

    room.phase = "generating";

    try {
      const prompt = `
Kamu adalah pembuat soal kuis trivia.
Buat maksimal 10 pertanyaan trivia tentang topik: "${topic}".
Setiap pertanyaan harus bisa dijawab dengan TEPAT SATU KATA dalam bahasa Indonesia.
Jawaban (baseAnswer) harus satu kata, huruf kecil semua, tanpa tanda baca.

Kembalikan HANYA JSON array berikut, tanpa teks lain, tanpa markdown:
[
  { "text": "teks pertanyaan?", "baseAnswer": "satukatajawabannya" }
]
      `.trim();

      const raw = await generateContent(prompt);
      const questions = parseGeminiJSON(raw);

      const valid = questions.filter(
        (q) =>
          q.text &&
          q.baseAnswer &&
          typeof q.baseAnswer === "string" &&
          !q.baseAnswer.includes(" "),
      );

      if (valid.length === 0) {
        throw new Error("Tidak ada soal valid yang dihasilkan.");
      }

      room.questions = valid;
      room.phase = "ready";
      socket.emit("questions_ready", { count: valid.length });
    } catch (err) {
      room.phase = "lobby";
      socket.emit("gemini_error", {
        message: err?.message || "Gagal generate soal. Coba topik lain.",
      });
    }
  });

  socket.on("end_game", async () => {
    const { roomCode, role } = socket.data;
    const room = rooms[roomCode];
    if (!room || role !== "host" || room.phase !== "playing") return;

    room.phase = "grading";
    io.to(roomCode).emit("grading_start");

    try {
      const gradingData = room.questions.map((q, i) => ({
        questionIndex: i,
        question: q.text,
        baseAnswer: q.baseAnswer,
        playerAnswers: Object.values(room.players).map((p) => ({
          nickname: p.nickname,
          answer: p.answers[i] || "",
        })),
      }));

      const prompt = `
Kamu adalah juri kuis yang adil.
Untuk setiap soal, nilai apakah jawaban setiap pemain BENAR atau MENDEKATI BENAR
dibandingkan baseAnswer. Kedua kata adalah satu kata bahasa Indonesia.
Toleransi: typo ringan (1-2 huruf berbeda), sinonim yang jelas, dan variasi ejaan dianggap benar.
Jawaban kosong selalu salah.

Data soal dan jawaban:
${JSON.stringify(gradingData, null, 2)}

Kembalikan HANYA JSON array berikut, tanpa teks lain, tanpa markdown:
[
  {
    "questionIndex": 0,
    "results": [
      { "nickname": "Ahmad", "correct": true },
      { "nickname": "Reza",  "correct": false }
    ]
  }
]
      `.trim();

      const raw = await generateContent(prompt);
      const gradingResult = parseGeminiJSON(raw);

      const scores = {};
      Object.values(room.players).forEach((p) => {
        scores[p.nickname] = 0;
      });

      gradingResult.forEach((q) => {
        q.results.forEach((r) => {
          if (r.correct && scores[r.nickname] !== undefined) {
            scores[r.nickname] += 1;
          }
        });
      });

      const rankings = Object.values(room.players)
        .map((p) => ({
          nickname: p.nickname,
          score: scores[p.nickname] || 0,
          total: room.questions.length,
          answers: p.answers.map((ans, qi) => {
            const qResult = gradingResult.find((g) => g.questionIndex === qi);
            const playerResult = qResult?.results.find(
              (r) => r.nickname === p.nickname,
            );
            return {
              questionIndex: qi,
              questionText: room.questions[qi]?.text || "",
              baseAnswer: room.questions[qi]?.baseAnswer || "",
              answer: ans || "",
              correct: playerResult?.correct ?? false,
            };
          }),
        }))
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ rank: i + 1, ...p }));

      room.phase = "result";
      room.rankings = rankings; // simpan di room state
      io.to(roomCode).emit("show_leaderboard", { rankings });
    } catch (err) {
      console.error("Grading error:", err);
      const rankings = Object.values(room.players).map((p, i) => ({
        rank: i + 1,
        nickname: p.nickname,
        score: 0,
        total: room.questions.length,
        answers: p.answers.map((ans, qi) => ({
          questionIndex: qi,
          answer: ans || "",
          correct: false,
        })),
      }));
      room.phase = "result";
      room.rankings = rankings; // simpan di room state
      io.to(roomCode).emit("show_leaderboard", { rankings });
    }
  });

  socket.on("get_leaderboard", () => {
    const { roomCode } = socket.data;
    const room = rooms[roomCode];
    if (!room || !room.rankings) return;

    socket.emit("show_leaderboard", { rankings: room.rankings });
  });
}

module.exports = { registerGeminiHandlers };
