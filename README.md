# Wordivate — Server

Backend server untuk aplikasi kuis kata real-time **Wordivate**. Dibangun di atas **Express** dan **Socket.IO**, dengan integrasi **Google Gemini AI** untuk pembuatan soal dan penilaian jawaban secara otomatis.

---

## Tech Stack

| Paket         | Versi   | Kegunaan                           |
| ------------- | ------- | ---------------------------------- |
| express       | ^5.2.1  | HTTP server & REST endpoint        |
| socket.io     | ^4.8.3  | Komunikasi real-time               |
| @google/genai | ^1.50.1 | Generasi soal & grading via Gemini |
| dotenv        | ^17.4.2 | Manajemen environment variable     |
| cors          | ^2.8.6  | Cross-Origin Resource Sharing      |

---

## Struktur Folder

```
server/
├── index.js                  # Entry point, inisialisasi HTTP & Socket.IO
├── app.js                    # Konfigurasi Express
├── helpers/
│   └── gemini.js             # Wrapper Google Gemini AI
└── socket/
    ├── index.js              # Registrasi semua socket handler
    ├── roomHandlers.js       # Event: buat & join room
    ├── gameHandlers.js       # Event: alur permainan
    └── geminiHandlers.js     # Event: generate soal & grading
```

---

## Setup & Menjalankan

### 1. Install dependensi

```bash
npm install
```

### 2. Buat file `.env`

```env
PORT=3000
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Jalankan server

```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

Server akan berjalan di `http://localhost:3000` (atau sesuai `PORT` di `.env`).

---

## REST API

### `GET /health`

Mengecek apakah server berjalan normal.

**Response `200 OK`**

```json
{ "status": "ok" }
```

---

## Socket.IO API

Semua komunikasi real-time menggunakan Socket.IO. Koneksikan client ke URL server, lalu gunakan event-event berikut.

### Alur Fase Room

```
lobby → generating → ready → playing → grading → result
```

| Fase         | Keterangan                                 |
| ------------ | ------------------------------------------ |
| `lobby`      | Room baru dibuat, menunggu pemain & topik  |
| `generating` | Soal sedang di-generate oleh Gemini        |
| `ready`      | Soal siap, host bisa memulai game          |
| `playing`    | Game berlangsung, pemain menjawab soal     |
| `grading`    | Jawaban sedang dinilai oleh Gemini         |
| `result`     | Penilaian selesai, leaderboard ditampilkan |

---

### Client → Server

#### `create_room`

Host membuat room baru. Tidak memerlukan payload.

```js
socket.emit("create_room");
```

**Response:** [`room_created`](#room_created)

---

#### `join_room`

Pemain bergabung ke room yang sudah ada.

```js
socket.emit("join_room", {
  roomCode: "ABC123", // string — kode room 6 karakter
  nickname: "Ahmad", // string — nama tampilan pemain
});
```

**Response sukses:** [`player_joined`](#player_joined) (di-broadcast ke seluruh room)  
**Response gagal:** [`join_error`](#join_error)

> Pemain hanya bisa bergabung saat fase `lobby` atau `ready`.

---

#### `generate_questions`

Host meminta Gemini membuat soal trivia berdasarkan topik. Hanya bisa dipanggil oleh host saat fase `lobby`.

```js
socket.emit("generate_questions", {
  topic: "Hewan Laut", // string — topik soal
});
```

**Response sukses:** [`questions_ready`](#questions_ready)  
**Response gagal:** [`gemini_error`](#gemini_error)

---

#### `start_game`

Host memulai permainan. Hanya bisa dipanggil oleh host saat fase `ready`. Tidak memerlukan payload.

```js
socket.emit("start_game");
```

**Response:** [`game_started`](#game_started) (di-broadcast ke seluruh room)

---

#### `get_current_question`

Pemain meminta data soal yang sedang aktif. Berguna ketika pemain reconnect atau baru bergabung di tengah game. Tidak memerlukan payload.

```js
socket.emit("get_current_question");
```

**Response:** [`new_question`](#new_question) (hanya ke pemain yang meminta)

---

#### `submit_answer`

Pemain mengirimkan jawaban untuk soal saat ini. Hanya kata pertama yang akan diambil (satu kata), dikonversi ke huruf kecil.

```js
socket.emit("submit_answer", {
  questionIndex: 0, // number — index soal (0-based)
  answer: "lumba", // string — jawaban pemain
});
```

**Side effect:** Host menerima [`wordcloud_update`](#wordcloud_update) setiap kali ada jawaban baru masuk.

---

#### `next_question`

Host melanjutkan ke soal berikutnya. Hanya bisa dipanggil oleh host saat fase `playing`. Tidak memerlukan payload.

```js
socket.emit("next_question");
```

**Response:** [`new_question`](#new_question) (di-broadcast ke seluruh room)

> Jika sudah di soal terakhir, event ini tidak melakukan apa-apa.

---

#### `end_game`

Host mengakhiri game dan memicu proses penilaian oleh Gemini. Hanya bisa dipanggil oleh host saat fase `playing`. Tidak memerlukan payload.

```js
socket.emit("end_game");
```

**Response:** [`grading_start`](#grading_start) → [`show_leaderboard`](#show_leaderboard)

---

#### `get_leaderboard`

Meminta ulang data leaderboard (berguna saat reconnect di fase `result`). Tidak memerlukan payload.

```js
socket.emit("get_leaderboard");
```

**Response:** [`show_leaderboard`](#show_leaderboard) (hanya ke socket yang meminta)

---

### Server → Client

#### `room_created`

Dikirim ke host setelah room berhasil dibuat.

```js
socket.on("room_created", ({ roomCode }) => {
  // roomCode: string — kode unik room (contoh: "K3X9ZA")
});
```

---

#### `join_error`

Dikirim ke pemain jika gagal bergabung ke room.

```js
socket.on("join_error", ({ message }) => {
  // message: string — pesan error
  // Contoh: "Room tidak ditemukan." | "Game sudah dimulai."
});
```

---

#### `player_joined`

Di-broadcast ke seluruh room setiap kali ada pemain baru bergabung.

```js
socket.on("player_joined", ({ players }) => {
  // players: Array<{ nickname: string }> — daftar semua pemain di room
});
```

---

#### `questions_ready`

Dikirim ke host setelah Gemini berhasil membuat soal.

```js
socket.on("questions_ready", ({ count }) => {
  // count: number — jumlah soal yang berhasil dibuat
});
```

---

#### `gemini_error`

Dikirim ke host jika Gemini gagal membuat soal.

```js
socket.on("gemini_error", ({ message }) => {
  // message: string — pesan error
});
```

---

#### `game_started`

Di-broadcast ke seluruh room saat host memulai game. Tidak ada payload.

```js
socket.on("game_started", () => {
  // Navigasi ke halaman game
});
```

---

#### `new_question`

Di-broadcast ke seluruh room saat soal baru dimulai (atau dikirim ke pemain yang meminta via `get_current_question`).

```js
socket.on("new_question", ({ index, text, total }) => {
  // index: number — index soal saat ini (0-based)
  // text:  string — teks pertanyaan
  // total: number — total jumlah soal
});
```

---

#### `wordcloud_update`

Dikirim **hanya ke host** setiap kali ada pemain yang mengirim jawaban.

```js
socket.on("wordcloud_update", ({ answers }) => {
  // answers: string[] — semua jawaban yang sudah masuk untuk soal saat ini
});
```

---

#### `grading_start`

Di-broadcast ke seluruh room saat proses penilaian dimulai. Tidak ada payload.

```js
socket.on("grading_start", () => {
  // Tampilkan loading/animasi menunggu hasil
});
```

---

#### `show_leaderboard`

Di-broadcast ke seluruh room setelah penilaian selesai. Berisi ranking lengkap dengan detail jawaban per pemain.

```js
socket.on("show_leaderboard", ({ rankings }) => {
  /*
  rankings: Array<{
    rank:     number,   // peringkat (1 = tertinggi)
    nickname: string,   // nama pemain
    score:    number,   // jumlah jawaban benar
    total:    number,   // total soal
    answers:  Array<{
      questionIndex: number,   // index soal
      questionText:  string,   // teks pertanyaan
      baseAnswer:    string,   // jawaban benar (dari Gemini)
      answer:        string,   // jawaban pemain
      correct:       boolean   // dinilai benar atau tidak
    }>
  }>
  */
});
```

---

#### `host_disconnected`

Di-broadcast ke seluruh room jika host terputus dari server. Room akan langsung dihapus. Tidak ada payload.

```js
socket.on("host_disconnected", () => {
  // Arahkan pemain kembali ke halaman utama
});
```
