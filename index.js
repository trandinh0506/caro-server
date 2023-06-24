const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://192.168.1.2:3000",
            "https://trandinh0506.github.io",
            "http://localhost:5500",
        ],
        methods: ["GET", "POST", "PUT"],
        allowedHeaders: ["Access-Control-Allow-Origin"],
        credentials: true,
    },
});

const mysql = require("mysql");
const connection = mysql.createPool({
    connectionLimit: 20,
    host: "sql12.freemysqlhosting.net",
    port: 3306,
    user: "sql12628306",
    password: "FPupv5ynzY",
    database: "sql12628306",
});
let Data = {};
let UserName = [];
let Names = [];
let SOCKETID = {};
connection.getConnection((err, connect) => {
    if (err) {
        console.error("Error acquiring connection from the pool:", err);
        return;
    }
    connect.query("SELECT * FROM user", (err, rows) => {
        console.log("Query database");
        for (let i = 0; i < rows.length; i++) {
            Data[rows[i]["username"]] = [rows[i]["password"], rows[i]["name"]];
            UserName.push(rows[i]["username"]);
            SOCKETID[rows[i]["name"]] = "";
            Names.push(rows[i]["name"]);
        }
    });
    connect.release();
});
app.use(express.json());
app.use(cors());
app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    if (UserName.includes(username)) {
        if (Data[username][0] === password) {
            const name = Data[username][1];
            if (!SOCKETID[name]) {
                SOCKETID[name] = "temporary";
                res.send(
                    JSON.stringify({
                        name: Data[username][1],
                        status: true,
                    })
                );
            } else {
                res.send(
                    JSON.stringify({
                        status: false,
                        message: "Account was logged in!",
                    })
                );
            }
        } else {
            res.send(JSON.stringify({ status: false }));
        }
    } else {
        res.send(JSON.stringify({ status: false }));
    }
});
app.post("/signup", (req, res) => {
    const username = req.body.Username;
    const password = req.body.password;
    const name = req.body.name;
    if (UserName.includes(username)) {
        res.send(
            JSON.stringify({
                status: false,
                message: `username: ${username} is already`,
            })
        );
        return;
    }
    if (Names.includes(name)) {
        res.send(
            JSON.stringify({
                status: false,
                message: `name: ${name} is already`,
            })
        );
        return;
    }
    connection.getConnection((err, connect) => {
        if (err) throw err;
        connect.query(
            `INSERT INTO user (username, password, name) VALUES ("${username}", "${password}", "${name}")`,
            (e) => {
                if (e) throw e;
                UserName.push(username);
                Names.push(name);
                Data[username] = [password, name];
                res.send({ status: true });
                SOCKETID[name] = "";
            }
        );
        connect.release();
    });
});
app.put("/rename", (req, res) => {
    const { username, password, newName } = req.body;
    if (UserName.includes(username)) {
        if (Data[username][0] === password) {
            if (Names.includes(newName)) {
                res.send({
                    status: false,
                    message: `"${newName}" already exists`,
                });
            } else {
                connection.getConnection((err, connect) => {
                    if (err) throw err;
                    connect.query(
                        `UPDATE user SET name = '${newName}' WHERE username = '${username}'`,
                        (e) => {
                            if (e) throw e;
                            Names[Names.indexOf(Data[username][1])] = newName;
                            Data[username] = [password, newName];
                        }
                    );
                    connect.release();
                });
                res.send({ status: true });
            }
        } else {
            res.send({
                status: false,
                message: "Invalid username or password",
            });
        }
    } else {
        res.send({ status: false, message: "Invalid username or password" });
    }
});
const createRoom = (StId, n) => {
    const rooms = [];
    for (let i = StId; i < n; i++) {
        rooms.push({
            id: i,
            Player: [],
            Viewer: [],
        });
    }
    return rooms;
};
const createGameBoard = (StTd, n, time = [180, 180]) => {
    let gameBoards = [];
    for (let i = StTd; i < n; i++) {
        let GB = Array.from(Array(20), () => Array(20).fill(""));
        gameBoards.push({
            GB,
            turn: "X",
            total: [...time],
            time: [...time],
            timerId: null,
            startedTime: [],
        });
    }
    return gameBoards;
};
const checkWin = (board, player) => {
    const rows = board.length;
    const cols = board[0].length;

    // Check horizontal
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols - 4; col++) {
            if (
                board[row][col] === player &&
                board[row][col + 1] === player &&
                board[row][col + 2] === player &&
                board[row][col + 3] === player &&
                board[row][col + 4] === player
            ) {
                return true;
            }
        }
    }

    // Check vertical
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows - 4; row++) {
            if (
                board[row][col] === player &&
                board[row + 1][col] === player &&
                board[row + 2][col] === player &&
                board[row + 3][col] === player &&
                board[row + 4][col] === player
            ) {
                return true;
            }
        }
    }

    // Check diagonal (top-left to bottom-right)
    for (let row = 0; row < rows - 4; row++) {
        for (let col = 0; col < cols - 4; col++) {
            if (
                board[row][col] === player &&
                board[row + 1][col + 1] === player &&
                board[row + 2][col + 2] === player &&
                board[row + 3][col + 3] === player &&
                board[row + 4][col + 4] === player
            ) {
                return true;
            }
        }
    }

    // Check diagonal (top-right to bottom-left)
    for (let row = 4; row < rows; row++) {
        for (let col = 0; col < cols - 4; col++) {
            if (
                board[row][col] === player &&
                board[row - 1][col + 1] === player &&
                board[row - 2][col + 2] === player &&
                board[row - 3][col + 3] === player &&
                board[row - 4][col + 4] === player
            ) {
                return true;
            }
        }
    }

    return false;
};
const createMessage = (StId, n) => {
    let messages = [];
    for (let i = StId; i < n; i++) {
        messages.push([]);
    }
    return messages;
};
const resetGameBoard = (id) => {
    GameBoards[id] = {
        GB: Array.from(Array(20), () => Array(20).fill("")),
        turn: "X",
        total: [180, 180],
        time: [180, 180],
        timerId: null,
        startedTime: [],
    };
};
const GameBoards = [...createGameBoard(0, 50)];
const rooms = [...createRoom(0, 50)];
const messages = [...createMessage(0, 50)];
io.on("connect", (socket) => {
    console.log("user connected", socket.id);
    socket.on("connecting", (name) => {
        console.log("name: ", name, "connected");
        SOCKETID[name] = socket.id;
    });

    socket.on("GetRooms", () => {
        console.log("get room");
        socket.emit("roomsReceived", rooms);
    });
    socket.on("subscribe", (room) => {
        const RoomId = room.id;
        console.log("subscribed", socket.id);
        socket.join(RoomId);
        console.log(room);
        let id = parseInt(RoomId.slice(4)); // 4 -> "room"
        if (room.type === "play") {
            if (rooms[id].Player.length < 2) {
                console.log(room.name);
                rooms[id].Player.push(room.name);
            }
        } else if (room.type === "view") rooms[id].Viewer.push(room.name);
        io.emit("roomsReceived", rooms);
    });

    socket.on("GetGameBoard", (id) => {
        console.log("get game board", `room${id}`);
        io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
    });
    socket.on("getDataRoom", (id) => {
        console.log("get data room", `room${id}`);
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
    });
    socket.on("start?", (id) => {
        console.log(`room${id} starting game`);
        io.to(`room${id}`).emit("accept?");
    });
    socket.on("accepted", (id) => {
        io.to(`room${id}`).emit("started");
        GameBoards[id].startedTime = [
            new Date().getTime(),
            new Date().getTime(),
        ];
    });
    socket.on("updateTime", (id) => {
        if (GameBoards[id].turn === "X") {
            if (GameBoards[id].time[0] > 0) {
                GameBoards[id].time[0] =
                    GameBoards[id].total[0] -
                    (new Date().getTime() - GameBoards[id].startedTime[0]) /
                        1000;
                io.to(`room${id}`).emit("timeReceived", {
                    time: GameBoards[id].time[0],
                    turn: "X",
                });
            } else {
                io.to(`room${id}`).emit("win", "O");
                resetGameBoard(id);
                io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
            }
        } else {
            if (GameBoards[id].time[1] > 0) {
                GameBoards[id].time[1] =
                    GameBoards[id].total[1] -
                    (new Date().getTime() - GameBoards[id].startedTime[1]) /
                        1000;
                io.to(`room${id}`).emit("timeReceived", {
                    time: GameBoards[id].time[1],
                    turn: "O",
                });
            } else {
                io.to(`room${id}`).emit("win", "X");
                resetGameBoard(id);
                io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
            }
        }
    });
    socket.on("getTimeForViewer", (id) => {
        io.to(`room${id}`).emit("viewerRecievedTime", GameBoards[id].time);
    });
    socket.on("move", ({ id, row, col, name }) => {
        console.log(id, row, col, name);
        const turn = GameBoards[id].turn;
        if (turn === "X") {
            GameBoards[id].total[0] = GameBoards[id].time[0];
            GameBoards[id].startedTime[1] = new Date().getTime();
        } else {
            GameBoards[id].total[1] = GameBoards[id].time[1];
            GameBoards[id].startedTime[0] = new Date().getTime();
        }
        if (GameBoards[id].GB[row][col] === "") {
            GameBoards[id].GB[row][col] = GameBoards[id].turn;
            GameBoards[id].turn = GameBoards[id].turn === "X" ? "O" : "X";
        }
        io.to(`room${id}`).emit("DataReceived", GameBoards[id]);

        if (checkWin(GameBoards[id].GB, turn)) {
            io.to(`room${id}`).emit("win", turn);
            resetGameBoard(id);
            io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
        }
    });
    socket.on("getAllMessages", (id) => {
        console.log("getAllMessages", id);
        socket.emit("allMessagesReceived", messages[id]);
    });
    socket.on("sendData", ({ id, name, message }) => {
        messages[id].push({ name, message });
        io.to(`room${id}`).emit("receiveMessage", messages[id]);
        console.log(`room${id}: ${name} : ${message}`);
    });
    socket.on("unsubscribe", (room) => {
        console.log("user unsubscribed");
        const RoomId = room.id;
        let id = parseInt(RoomId.slice(4)); // 4 -> "room"
        console.log(id, rooms[id]);
        if (room.type === "play") {
            rooms[id].Player.splice(rooms[id].Player.indexOf(room.name), 1);
        } else {
            rooms[id].Viewer.splice(rooms[id].Viewer.indexOf(room.name), 1);
        }
        socket.leave(RoomId);
        io.emit("roomsReceived", rooms);
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
    });
    socket.on("disconnect", () => {
        let Name = "";
        let id;
        console.log(socket.id, SOCKETID);
        for (const name in SOCKETID) {
            if (socket.id === SOCKETID[name]) {
                SOCKETID[name] = "";
                Name = name;
                break;
            }
        }
        for (const room of rooms) {
            for (const name of room.Player) {
                if (name === Name) {
                    room.Player.splice(room.Player.indexOf(name), 1);
                    id = room.id;
                    break;
                }
            }
            for (const name of room.Viewer) {
                if (name === Name) {
                    room.Viewer.splice(room.Viewer.indexOf(name), 1);
                    id = room.id;
                    break;
                }
            }
        }
        io.emit("roomsReceived", rooms);
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
        console.log("user " + Name + " disconnected");
    });
});
const port = 8000 || process.env.PORT;
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
