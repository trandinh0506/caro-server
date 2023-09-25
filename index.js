const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.ORIGIN,
        methods: ["GET", "POST", "PUT"],
        allowedHeaders: ["Access-Control-Allow-Origin"],
        credentials: true,
    },
});
const mysql = require("mysql");
const connection = mysql.createPool({
    connectionLimit: 20,
    host: process.env.HOST,
    port: 3306,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
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
app.get("/wakeup", (req, res) => res.sendStatus(200));
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
            res.send(
                JSON.stringify({
                    status: false,
                    message: "Invalid User Name or Password",
                })
            );
        }
    } else {
        res.send(
            JSON.stringify({
                status: false,
                message: "Invalid User Name or Password",
            })
        );
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
            "INSERT INTO user (username, password, name) VALUES (?, ?, ?)",
            [username, password, name],
            (e) => {
                if (e) throw e;
                UserName.push(username);
                Names.push(name);
                Data[username] = [password, name];
                SOCKETID[name] = "";
            }
        );
        connect.release();
        res.send({ status: true, message: "Sign Up Was Successfully!" });
    });
});
app.put("/rename", (req, res) => {
    const { username, password, newName } = req.body;
    if (UserName.includes(username)) {
        if (Data[username][0] === password) {
            if (Names.includes(newName)) {
                res.send({
                    status: false,
                    message: `Name: "${newName}" is already exists`,
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
const createRoom = (id, roomName = "") => {
    return {
        id,
        name: roomName || `Room: ${id}`,
        Player: [],
        Viewer: [],
    };
};
const createGameBoard = (time = [180, 180]) => {
    const GB = Array.from(Array(20), () => Array(20).fill(""));
    let gameBoard = {
        GB,
        turn: "X",
        total: [...time],
        time: [...time],
        startedTime: [],
        limit: [...time],
    };
    return gameBoard;
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

const resetGameBoard = (id, time) => {
    GameBoards[id] = {
        GB: Array.from(Array(20), () => Array(20).fill("")),
        turn: "X",
        total: [...time],
        time: [...time],
        startedTime: [],
        limit: [...time],
    };
};
const GameBoards = Array(20)
    .fill(0)
    .map(() => createGameBoard());
const rooms = Array(20)
    .fill(0)
    .map((e, i) => createRoom(i));
let rooms_full = null;
const messages = Array(20)
    .fill(0)
    .map(() => []);

io.on("connect", (socket) => {
    socket.on("connecting", (name) => {
        SOCKETID[name] = socket.id;
    });
    socket.on("GetRooms", () => {
        socket.emit("roomsReceived", rooms);
    });
    socket.on("createCostomRoom", ({ roomName, timeLimit }) => {
        GameBoards.push(createGameBoard([timeLimit, timeLimit]));
        rooms.push(createRoom(rooms.length, roomName));
        messages.push([]);
        io.emit("roomsReceived", rooms);
        socket.emit("getCostomRoomId", rooms.length - 1);
    });
    socket.on("getTime", (id) => {
        socket.emit("viewerRecievedTime", GameBoards[id].time);
    });
    socket.on("subscribe", ({ id, name, type }) => {
        socket.join(`room${id}`);
        if (type === "play") {
            if (rooms[id].Player.length < 2) {
                rooms[id].Player.push(name);
                rooms_full = rooms.filter((e) => {
                    return e.Player.length === 2;
                }).length;

                if (rooms.length - rooms_full <= 5) {
                    GameBoards.push(createGameBoard());
                    rooms.push(createRoom(rooms.length));
                    messages.push([]);
                    io.emit("roomsReceived", rooms);
                }
            }
        } else if (type === "view") rooms[id].Viewer.push(name);
        io.emit("roomsReceived", rooms);
    });
    socket.on("GetGameBoard", (id) => {
        io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
    });
    socket.on("getDataRoom", (id) => {
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
    });
    socket.on("start?", (id) => {
        io.to(`room${id}`).emit("accept?");
    });
    socket.on("accepted", (id) => {
        io.to(`room${id}`).emit("started");
        GameBoards[id].startedTime = [
            new Date().getTime(),
            new Date().getTime(),
        ];
        console.log(GameBoards[id].startedTime);
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
                resetGameBoard(id, GameBoards[id].limit);
                io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
                io.to(`room${id}`).emit(
                    "viewerRecievedTime",
                    GameBoards[id].time
                );
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
                resetGameBoard(id, GameBoards[id].limit);
                io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
                io.to(`room${id}`).emit(
                    "viewerRecievedTime",
                    GameBoards[id].time
                );
            }
        }
    });
    socket.on("getTimeForViewer", (id) => {
        io.to(`room${id}`).emit("viewerRecievedTime", GameBoards[id].time);
    });
    socket.on("move", ({ id, row, col, name }) => {
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
            resetGameBoard(id, GameBoards[id].limit);
            io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
            io.to(`room${id}`).emit("viewerRecievedTime", GameBoards[id].time);
        }
    });
    socket.on("getAllMessages", (id) => {
        socket.emit("allMessagesReceived", messages[id]);
    });
    socket.on("sendData", ({ id, name, message }) => {
        messages[id].push({ name, message });
        io.to(`room${id}`).emit("receiveMessage", messages[id]);
    });
    socket.on("unsubscribe", ({ id, type, name }) => {
        if (type === "play") {
            rooms[id].Player.splice(rooms[id].Player.indexOf(name), 1);
            resetGameBoard(id, GameBoards[id].limit);
            io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
            io.to(`room${id}`).emit("resetTimer");
            io.to(`room${id}`).emit("viewerRecievedTime", GameBoards[id].time);
        } else {
            rooms[id].Viewer.splice(rooms[id].Viewer.indexOf(name), 1);
        }
        socket.leave(`room${id}`);
        io.emit("roomsReceived", rooms);
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
    });
    socket.on("disconnect", () => {
        let Name = "";
        let id;
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
                    resetGameBoard(id, GameBoards[id].limit);
                    io.to(`room${id}`).emit("DataReceived", GameBoards[id]);
                    io.to(`room${id}`).emit(
                        "viewerRecievedTime",
                        GameBoards[id].time
                    );
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
        console.log(Name);
        io.emit("roomsReceived", rooms);
        io.to(`room${id}`).emit("DataRoom", rooms[id]);
    });
});
server.listen(8000, () => {
    console.log("Deployed");
});
