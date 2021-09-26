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

//Crypto
const sha1 = require("sha1");
const crypto = require("crypto");
var hexToBinary = require("hex-to-binary");
const bcrypt = require("bcrypt");
var bigInt = require("big-integer");
const bigintBuffer = require(`bigint-buffer`);
const { computeVerifier, params } = require(`trinitycore-srp6`);

const { result, toUpper } = require("lodash");
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
  port: process.env.DB_PORT,
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

app.get("/how-to-play-rp", (req, res) => {
  res.render("how-to-play-rp");
});

app.get("/years-events", (req, res) => {
  res.render("years-events");
});

app.get("/calendar", (req, res) => {
  res.render("calendar");
});

app.get("/lore", (req, res) => {
  res.render("lore");
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
      return res.redirect("admin");
    });
  })(req, res, next);
});

// app.get("/register", (req, res) => {
//   res.render("register", { errorMessage: "" });
// });

/*app.post("/register", (req, res) => {
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
});*/

app.get("/game-registration", (req, res) => {
  res.render("game-registration", { errorMessage: "" });
});

app.post("/game-registration", (req, res) => {
  //HASh Password
  const login = req.body.login;

  // const shaPassword = sha1(
  //   login + ":" + req.body.password.toUpperCase()
  // ).toUpperCase();

  const [salt, verifier] = encryptPass(login, req.body.password);

  if (req.body.house1 === req.body.house2) {
    res.render("game-registration", {
      errorMessage: "Musíš si vybrat rozdílné koleje",
    });
  } else {
    const query = "SELECT * FROM account WHERE username = ?";
    con.query(query, login, (err, result) => {
      if (err) {
        console.log(err);
      }
      if (result.length > 0) {
        res.render("game-registration", {
          errorMessage: "Toto uživatelské jméno již existuje",
        });
      } else {
        //create WOW account
        // const query = `INSERT INTO players (name,email, house1, house2, login) VALUES
        // ("${req.body.playerName}",
        // "${req.body.email}",
        // "${req.body.house1}",
        // "${req.body.house2}",
        // "${req.body.login}");
        const query = `INSERT INTO account SET ?; INSERT INTO players SET ?`,
          values = [
            {
              username: login.toUpperCase(),
              salt: salt,
              verifier: verifier,
              email: req.body.email,
            },
            {
              name: req.body.playerName,
              email: req.body.email,
              house1: req.body.house1,
              house2: req.body.house2,
              login: login,
            },
          ];
        // "${login}",
        // "${salt}",
        // "${verifier}",
        // "${req.body.email}")`;
        con.query(query, values, (err, result) => {
          if (err) {
            console.log(err);
          } else {
            //Send confirmation email
            transporter.sendMail(
              {
                from: "info@bradavice-online.cz",
                to: req.body.email,
                subject: "Potvrzení registrace",
                html: `<p>Vážený hráči, </p> <p>obdrželi jsme Tvoji registraci do prvního ročníku na serveru Bradavice - online.
                Herní účet jsi si zaregistroval pod přihlašovacím jménem: <b>${req.body.login}</b> a tvá postava se jmenuje <b>${req.body.playerName}</b>. 
                Přál by sis, aby patřila do koleje <b>${req.body.house1}</b> nebo <b>${req.body.house2}</b>.</p>
                <p>Bližší informace očekávej v emailu, který Ti zašleme pár dní před začátkem nového školního roku. 
                V mezičase si, prosíme, nastuduj rubriku „Jak se připojit“ <a href="http://bradavice-online.cz/how-to-connect">zde</a>.
                Připojit se můžeš také na náš Discord: <a href="https://discord.gg/wqkH3mdPu5">zde</a>, kde můžeš o hře diskutovat a kde rádi zodpovíme tvé dotazy.</p></br>
                Rovněž si můžeš přečíst naše články o tom <a href="https://bradavice-online.cz/how-to-play-rp">jak hrát RP</a> nebo si něco přečíst 
                <a href="https://bradavice-online.cz/lore">o našem lore</a>.
                <p>Budeme se těšit na viděnou v Bradavicích.</p></br>
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

app.get("/admin", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("admin", { user: req.user.username });
  } else {
    res.redirect("/login");
  }
});

app.get("/registered-players", (req, res) => {
  if (req.isAuthenticated()) {
    con.query("SELECT * FROM players", (err, result) => {
      if (err) {
        console.log(err);
      }
      if (result) {
        res.render("registered-players", { players: result });
      }
    });
  } else {
    res.redirect("/login");
  }
});
app.listen(process.env.PORT, () => {
  console.log("Server has started on port 3000");
});

// function encryptPass(login, password) {
//   const g = BigInt(0x7);
//   const N =
//     BigInt(0x894b645e89e1535bbdad5b8b290650530801b18ebfbf5e8fab3c82872a3e9bb7);

//   const salt = crypto.randomBytes(32);

//   //const salt = Buffer.alloc(32).fill(randSalt.toString("binary"));
//   console.log(salt);

//   let h1 = crypto
//     .createHash("sha1")
//     .update(login + ":" + password)
//     .digest();
//   console.log("h1: " + h1);

//   let h2 = crypto.createHash("sha1").update(salt).update(h1).digest();
//   //h2 = BigInt(parseInt(hexToBinary(h2))); //convert binary h2 to number
//   h2 = bigintBuffer.toBigIntLE(h2);
//   console.log("h2: " + h2);

//   //const verifier = powerMod(g, h2Num, N);
//   let verifier = bigInt(g).modPow(h2, N);
//   //verifier = BigInt(verifier).toString(2);
//   console.log("verifier: " + BigInt(verifier).toString(2));

//   const lEVerifier = verifier.value
//     .toString(16)
//     .match(/.{2}/g)
//     .reverse()
//     .join(``);

//   console.log(Buffer.from(lEVerifier, `hex`));

//   return [salt, Buffer.from(lEVerifier, `hex`)];
// }

function encryptPass(login, password) {
  const salt = crypto.randomBytes(32);

  const verifier = computeVerifier(
    params.trinitycore,
    salt,
    login.toUpperCase(),
    password.toUpperCase()
  );
  return [salt, verifier];
}
