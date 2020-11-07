const express = require("express");
const ejs = require("ejs");
require("dotenv").config();
const bodyParser = require("body-parser");
const mysql = require("mysql");
const fileUpload = require("express-fileupload");
const _ = require("lodash");
const flash = require("req-flash");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const saltRounds = 10;

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(fileUpload());
app.set("view engine", "ejs");
app.use(
  session({
    secret: "My little secret.",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

//MYSQL Connection
const con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DB,
});

con.connect((err) => {
  if (!err) {
    console.log("Successfully connected to database");
  }
});

// Passport setup
passport.use(
  new LocalStrategy(function (username, password, done) {
    con.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
      (err, rows) => {
        console.log(err);
        console.log(rows);
        if (err) {
          return done(err);
        }
        if (!rows.length) {
          return done(null, false, { message: "Incorrect username." });
        }
        bcrypt.compare(password, rows[0].password, (err, result) => {
          if (result === false) {
            return done(null, false, { message: "invalid password" });
          }
        });

        return done(null, rows[0]);
      }
    );
  })
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  con.query("SELECT * FROM users WHERE id = " + id, function (err, rows) {
    done(err, rows[0]);
  });
});

app.get("/", (req, res) => {
  con.query(
    "SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.userID=users.id",
    (err, result) => {
      if (!err) {
        //Reverse the array in order to see the newest articles on top
        let posts = result;
        res.render("index", { posts: posts.slice().reverse() });
      } else {
        console.log(err);
      }
    }
  );
});

app.get("/news", (req, res) => {
  con.query(
    "SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.userID=users.id",
    (err, result) => {
      if (!err) {
        //Reverse the array in order to see the newest articles on top
        let posts = result;
        res.render("news", { posts: posts.slice().reverse() });
      } else {
        console.log(err);
      }
    }
  );
});

app.get("/how-to-connect", (req, res) => {
  res.render("how-to-connect");
});

app.get("/compose", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("newpost");
  } else {
    res.redirect("/login");
  }
});

app.post("/compose", (req, res) => {
  const articleHeading = req.body.heading;
  const articleBody = req.body.postBody;
  let imageUrl = "";

  //Upload image
  //Check if is there any image
  if (!req.files || Object.keys(req.files).length === 0) {
    console.log("No files were uploaded");
  } else {
    const imageToUpload = req.files.image;
    const imageFileName = imageToUpload.name;
    // const imageFileName = _.kebabCase(articleHeading);
    imageUrl = "images/articles/" + imageFileName;

    imageToUpload.mv("public/images/articles/" + imageToUpload.name, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log("File uploaded!");
      }
    });
  }

  const today = new Date();
  const date =
    today.getDate() +
    ". " +
    (today.getMonth() + 1) +
    ". " +
    today.getFullYear();
  const curentUser = req.user.id;
  //Update MYSQL
  con.query(
    "INSERT INTO posts (heading, postBody, img_url, userID, date) VALUES ('" +
      articleHeading +
      "', '" +
      articleBody +
      "', '" +
      imageUrl +
      "', '" +
      curentUser +
      "', '" +
      date +
      "')",
    (err, result) => {
      if (err) {
        console.log(err);
      }
    }
  );

  res.redirect("/news");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/compose",
    failureRedirect: "/login",
  })
);

app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", (req, res) => {
  con.query(
    "SELECT * FROM users WHERE username = ?",
    [req.body.username],
    (err, result) => {
      if (err) {
        console.log(err);
      }
      if (result.length > 0) {
        console.log(result);
        console.log("user already exists");
      } else {
        const username = req.body.username;
        const password = bcrypt.hashSync(req.body.password, saltRounds);
        console.log(password);
        con.query(
          "INSERT INTO users (username, password) VALUES ('" +
            username +
            "', '" +
            password +
            "')",
          (err, result) => {
            if (err) {
              console.log(err);
            }
            res.redirect("/compose");
          }
        );
      }
    }
  );
});
app.listen(process.env.PORT, () => {
  console.log("Server has started on port 3000");
});
