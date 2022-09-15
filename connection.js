const mongoose = require("mongoose");
mongoose.connect(
  "mongodb://0.0.0.0:27017/mern-chat-app",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  (err) => {
    if (err) {
      console.log("not connected" + err.message);
    } else {
      console.log("connected");
    }
  }
);
