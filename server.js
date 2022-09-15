const express = require("express");
require("dotenv").config();
const multer = require("multer");
const app = express();
const userRoutes = require("./routes/userRoutes.js");
//const rooms = ["general", "tech", "finance", "office"];
const cors = require("cors");
const bodyParser = require("body-parser");
const Message = require("./models/Message.js");
const Rooms = require("./models/Rooms.js");
const User = require("./models/User.js");
const fs = require("fs");
const { response } = require("express");
const bcrypt = require("bcrypt");
//app.use('/static', express.static('mern-chat-backend'));

const corsOptions = {
  origin: true, //included origin as true
  credentials: true, //included credentials as true
};

app.use("/resources", express.static(__dirname + "/files"));
app.use(bodyParser.json({ limit: "30mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));
app.use(cors(corsOptions));
app.use("/users", userRoutes);
require("./connection.js");

const server = require("http").createServer(app);
const PORT = 5001;
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});
function getFormattedDate() {
  const date = new Date();
  const year = date.getFullYear();
  let month = (1 + date.getMonth()).toString();

  month = month.length > 1 ? month : "0" + month;
  let day = date.getDate().toString();
  day = day.length > 1 ? day : "0" + day;
  return month + "/" + day + "/" + year;
}

const fileStorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./files");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: fileStorageEngine });

app.post("/single", upload.single("image"), (req, res) => {
  res.status(200);
});

async function getLastMessagesFromRoom(room) {
  let roomMessages = await Message.aggregate([
    { $match: { to: room } },
    { $group: { _id: "$date", messagesByDate: { $push: "$$ROOT" } } },
  ]);
  return roomMessages;
}

function sortRoomMessagesByDate(messages) {
  return messages.sort(function (a, b) {
    let date1 = a._id.split("/");
    let date2 = b._id.split("/");
    date1 = date1[2] + date1[0] + date1[1];
    date2 = date2[2] + date2[0] + date2[1];

    return date1 < date2 ? -1 : 1;
  });
}

//io.use(authorizeUser);

/*io.use(passportSocketIo.authorize({
  cookieParser:cookieParser,
  key:'express.sid',
  secret:process.env.SECRET_KEY,
  store:sessionStore
}));*/
async function returnToken(email) {
  const user = await User.find({ email: email });
  return user[0].tokens[user[0].tokens.length - 1].token;
  //console.log(user2);
  //const user1= await User.find(email,token);
}

io.use(async (socket, next) => {
  //  const user=User.find({'email':email});//{'tokens': {$slice: -1===token}});
  try {
    const emailuser = await socket.handshake.headers["email"];
    const token = await socket.handshake.headers["token"];
    if (token != "undefined" && emailuser != "undefined") {
      const lastToken = await returnToken(emailuser);
      //  console.log(lastToken);
      if (token === lastToken) {
        //console.log("authenticated");
        const user = await User.find({ email: emailuser });
        user[0].status = "online";
        await user[0].save();
        next();
      }
    }
  } catch (err) {
    next(new Error("Login , unauthorized access"));
  }
});

io.on("connection", (socket) => {
  socket.on("new-user", async () => {
    const members = await User.find();
    io.emit("new-user", members);
  });

  socket.on("join-room", async (newRoom, previousRoom) => {
    socket.join(newRoom);
    socket.leave(previousRoom);
    let roomMessages = await getLastMessagesFromRoom(newRoom);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    socket.emit("room-messages", roomMessages);
  });

  socket.on("add-group", async (name, members) => {
    const today = new Date();
    const minutes =
      today.getMinutes() < 10 ? "0" + today.getMinutes() : today.getMinutes();

    await Rooms.create({
      name: name,
      createdDate: getFormattedDate(),
      createdTime: today.getHours() + ":" + minutes,
      Members: members,
    });
    socket.emit();
  });

  socket.on("remove-user", async (id) => {
    const user = await User.findById(id);
    const query = { "from._id": id };
    const message = await Message.find(query);
    //console.log(message);
    if (user) {
      const h = await Message.deleteMany({ "from._id": id });
      await user.deleteOne(user);
    }
    socket.emit();
  });

  socket.on(
    "message-room",
    async (room, content, sender, time, date, isFile) => {
      const newMessage = await Message.create({
        content,
        from: sender,
        time,
        date,
        to: room,
        isFile: isFile,
      });
      let roomMessages = await getLastMessagesFromRoom(room);
      roomMessages = sortRoomMessagesByDate(roomMessages);
      io.to(room).emit("room-messages", roomMessages);
      socket.broadcast.emit("notifications", room);
    }
  );

  socket.on("deleteMessage", async (id, room) => {
    const message = await Message.find({ _id: id });
    if (message[0].isFile) {
      const path = `./files/${message[0].content}`;
      try {
        fs.unlinkSync(path);
        //  console.log("file removed");
      } catch (err) {
        console.error(err);
      }
    }
    await Message.deleteOne({ _id: id });
    //console.log("deleted");
    let roomMessages = await getLastMessagesFromRoom(room);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    io.to(room).emit("room-messages", roomMessages);
  });

  socket.on("delete-room", async (room) => {
    await Rooms.deleteOne({ name: room });
    socket.emit();
  });

  app.delete("/logout", async (req, res) => {
    try {
      const { _id, newMessages } = req.body;
      const user = await User.findById(_id);
      user.status = "offline";
      user.newMessages = newMessages;
      await user.save();
      const members = await User.find();
      socket.broadcast.emit("new-user", members);

      res.status(200).send();
      socket.disconnect();
    } catch (e) {
      console.log(e);
      res.status(400).send();
    }
  });

  socket.on("disconnect", async function () {
    const emailuser = await socket.handshake.headers["email"];
    try {
      const user = await User.find({ email: emailuser });
      user[0].status = "offline";
      await user[0].save();
      const members = await User.find();
      socket.broadcast.emit("new-user", members);
    } catch (err) {
      console.log(err);
    }
    socket.disconnect();
  });
});

app.get("/rooms/:email", async (req, res) => {
  const roomsObject = await Rooms.find({ Members: req.params.email });
  let rooms = [];
  for (let i = 0; i < roomsObject.length; i++) {
    rooms[i] = roomsObject[i].name;
  }
  res.json(rooms);
});

app.get("/rooms", async (req, res) => {
  const roomsObject = await Rooms.find();
  let rooms = [];
  for (let i = 0; i < roomsObject.length; i++) {
    rooms[i] = roomsObject[i].name;
  }
  res.json(rooms);
});

app.post("/changepass", async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  const user = await User.findOne({ email });

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (isMatch) {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    await user.updateOne({ password: hashed });
    res.json("updated");
  } else {
    res.json("notupdated");
  }
});

server.listen(PORT, () => {
  console.log(`listening to ${PORT}`);
});
