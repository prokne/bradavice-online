const express = require("express");
const ejs = require("ejs");
require("dotenv").config();
const bodyParser = require("body-parser");
const mysql = require("mysql");
const fileUpload = require("express-fileupload");
const nodemailer = require("nodemailer");
const _ = require("lodash");
const flash = require("req-flash");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const sha1 = require("sha1");
//const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { result } = require("lodash");
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
const con = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DB,
  multipleStatements: true,
});

//email Config
const transporter = nodemailer.createTransport({
  host: "smtp.seznam.cz",
  port: 465,
  secure: true,
  auth: {
    user: "info@bradavice-online.cz",
    pass: process.env.MAIL_PASS,
  },
});

// con.connect((err) => {
//   if (!err) {
//     console.log("Successfully connected to database");
//   }
// });

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
          if (err) {
            console.log(err);
          }
          if (result === false) {
            return done(null, false, { message: "invalid password" });
          } else {
            return done(null, rows[0]);
          }
        });
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

app.get("/news/:postId", (req, res) => {
  const postId = req.params.postId;
  con.query(
    "SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.userID = users.id WHERE posts.id = ?",
    [postId],
    (err, result) => {
      if (err) {
        console.log(err);
      } else {
        con.query(
          "SELECT * FROM post_images WHERE postId = ?",
          [result[0].id],
          (err, images) => {
            res.render("post", {
              img: result[0].img_url,
              heading: result[0].heading,
              user: result[0].username,
              date: result[0].date,
              postBody: result[0].postBody,
              images: images,
            });
          }
        );
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
  console.log(req.files);
  const articleHeading = req.body.heading;
  const articleBody = req.body.postBody;
  let imageUrl = "";
  let imageFileName = "";
  let postId = 0;

  //Array of immages to upload
  const images = [];
  const imagesKeys = Object.keys(req.files);
  imagesKeys.forEach((key) => {
    images.push(req.files[key]);
    console.log(key);
  });

  //url of the preview image for mysql
  const previewImgUrl = "/images/articles/" + images[0].name;

  //Upload image
  //Check if is there any image
  if (!req.files || Object.keys(req.files).length === 0) {
    console.log("No files were uploaded");
  } else {
    images.forEach((image) => {
      // const imageFileName = _.kebabCase(articleHeading);

      image.mv("public/images/articles/" + image.name, (err) => {
        if (err) {
          console.log(err);
        } else {
          console.log("File uploaded!");
        }
      });
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
      previewImgUrl +
      "', '" +
      curentUser +
      "', '" +
      date +
      "')",
    (err, result) => {
      if (err) {
        console.log(err);
      } else {
        //Update POST_IMAGES
        for (let index = 1; index < images.length; index++) {
          imageUrl = "/images/articles/" + images[index].name;
          con.query(
            `INSERT INTO post_images (postId, url) VALUES ("${result.insertId}", "${imageUrl}")`,
            (err, result) => {
              if (err) {
                console.log(err);
              }
            }
          );
        }
        res.redirect("/news");
      }
    }
  );
});

app.get("/login", (req, res) => {
  res.render("login", { errorMessage: "" });
});

app.post("/login", function (req, res, next) {
  passport.authenticate("local", function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.render("login", {
        errorMessage: "Nesprávné jméno nebo heslo",
      });
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }
      return res.redirect("compose");
    });
  })(req, res, next);
});

app.get("/register", (req, res) => {
  res.render("register", { errorMessage: "" });
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
        res.render("register", {
          errorMessage: "Toto uživatelské jméno již existuje",
        });
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

app.get("/game-registration", (req, res) => {
  res.render("game-registration", { errorMessage: "" });
});

app.post("/game-registration", (req, res) => {
  //HASh Password
  const login = req.body.login.toUpperCase();

  const shaPassword = sha1(
    login + ":" + req.body.password.toUpperCase()
  ).toUpperCase();

  if (req.body.house1 === req.body.house2) {
    res.render("game-registration", {
      errorMessage: "Musíš si vybrat rozdílné koleje",
    });
  } else {
    const query = "SELECT * FROM account WHERE username = ?";
    con.query(query, [login], (err, result) => {
      if (err) {
        console.log(err);
      }
      if (result.length > 0) {
        res.render("game-registration", {
          errorMessage: "Toto uživatelské jméno již existuje",
        });
      } else {
        //create WOW account
        const query = `INSERT INTO players (name,email,age, house1, house2, login) VALUES 
        ("${req.body.playerName}", 
        "${req.body.email}", 
        "${req.body.age}", 
        "${req.body.house1}", 
        "${req.body.house2}", 
        "${req.body.login}");
        INSERT INTO account (username, sha_pass_hash, email) VALUES (
        "${login}", 
        "${shaPassword}", 
        "${req.body.email}")`;
        con.query(query, (err, result) => {
          if (err) {
            console.log(err);
          } else {
            //Send confirmation email
            transporter.sendMail(
              {
                from: "info@bradavice-online.cz",
                to: req.body.email,
                subject: "Potvrzení registrace",
                html: `<p>Vážený hráči, </p> <p>obdrželi jsme Tvoji registraci na Vánoční akci 2020 na serveru Bradavice - online.
                Herní účet jsi si zaregistroval pod přihlašovacím jménem: <b>${req.body.login}</b>, tvá postava se jmenuje <b>${req.body.playerName}</b>, je jí <b>${req.body.age}</b> let. 
                Přál by sis, aby patřila do koleje <b>${req.body.house1}</b> nebo <b>${req.body.house2}</b>.</p>
                <p>Bližší informace k akci a k tvé postavě očekávej v emailu, který Ti zašleme pár dní před plánovanou akcí. 
                V mezičase si, prosíme, nastuduj rubriku „Jak se připojit“ <a href="http://bradavice-online.cz/how-to-connect">zde</a>. Je důležité stáhnout si a zprovoznit hru s dostatečným předstihem.</p></br>
                <p>Budeme se těšit na viděnou ve vánočních Bradavicích.</p>
                <p>S pozdravem</p>
                <p>GM tým Bradavice online</p>`,
              },
              (err, info) => {
                if (err) {
                  console.log(err);
                } else {
                  console.log("Email sent: " + info.response);
                }
              }
            );

            res.render("succes");
          }
        });
      }
    });
  }
});
app.listen(process.env.PORT, () => {
  console.log("Server has started on port 3000");
});
