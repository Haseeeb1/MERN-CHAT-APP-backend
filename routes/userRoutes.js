const router = require("express").Router()
const User = require("../models/User.js")
const jwt = require("jsonwebtoken")
const authenticate = require("../middleware/authenticate.js");

router.post("/", async (req, res) => {
  try {
    const { name, email, password, picture } = req.body;
    const user = await User.create({ name, email, password, picture });
    res.status(201).json(user);
  } catch (e) {
    let msg;
    if (e.code === 11000) {
      msg = "user already exists";
    } else {
      e.message;
    }
    console.log(e);
    res.status(400).json(msg);
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email, password);
    const token = await user.generateAuthToken();
   // user.status = "online";
    await user.save();
    res.cookie("jwtoken", token, {
      expires: new Date(Date.now() + 2589200000000),
      httpOnly: false,
      secure: false,
    });
    res.status(200).json(user);
  } catch (e) {
    res.status(400).json(e.message);
  }
});

router.get("/chat", authenticate, (req, res) => {
  console.log("Hello my About");
  res.send(req.rootUser);
});

module.exports = router;
