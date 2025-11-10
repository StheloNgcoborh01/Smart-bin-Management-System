import express from "express";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { access } from "fs";

import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";


import session from "express-session";
import connectPgSimple from "connect-pg-simple";


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,  // from .env
    pass: process.env.EMAIL_PASS,  // from .env
  },
});


const app = express();
const port = 3000;

app.use(express.static("public"));

app.use(express.json());
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);


const db = new pg.Client({
  port: 5432,
  database: "IoT-SBMS",
  user: "postgres",
  password: process.env.DB_PASSWORD,
  host: "localhost",
});
db.connect();


app.use(
  session({
    store: new PgSession({
      pool: db, // <— your pg Pool instance
      tableName: "session", // default 'session' or change it
    }),
    secret: process.env.SESSION_SECRET || "replace_with_env_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      httpOnly: true,
      sameSite: "lax", // adjust for your frontend
      secure: process.env.NODE_ENV === "production", // true in prod with HTTPS
    },
  })
);

app.get("/", requireLogin, CheckRole("admin"),  async (req, res) => {

  try {
  const result = await db.query("SELECT * FROM bin_data ORDER BY timestamp DESC LIMIT 5");
   const rowsToFill = result.rows.reverse().map(row => {
  return {
    time:new Date(row.timestamp).toLocaleString(
      'en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false  // 24-hour format
}
    ),
    fillLevel: convertDistance(row.distance) 
  };
});


// console.log(result);
  
  res.render("index.ejs", { user: req.session.user , rows: rowsToFill});

  } catch (error) {
    res.send("unable to get data");
  }


});

app.get("/AddUser", async (req, res) => {
  res.render("AddUser.ejs");
});

function CheckDomain(Newusername) {
  const cleanEmail = Newusername.trim().toLowerCase();
  return cleanEmail.endsWith("@dut4life.ac.za");
}

async function emailExists(Newusername) {
  try {
    const result = await db.query(
      "SELECT * FROM userdetails WHERE student_email = $1",
      [Newusername]
    );

    return result.rows.length > 0; // true if exists, false otherwise
  } catch (err) {
    console.error("Database error:", err);
    throw err; // re-throw error for higher-level handling
  }
}

function convertDistance(distance) {
  const bin_height = 20;
  return ((bin_height - distance  ) / bin_height * 100).toFixed(0); // %
};


function CheckRole(role) {

  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect("/login"); // user not logged in
    }

    if (req.session.user.role !== role) {
      // redirect to their correct dashboard
      if (req.session.user.role === "admin") return res.redirect("/");
      if (req.session.user.role === "client") return res.redirect("/clientDashboard");

      // optional: fallback in case of unknown role
      return res.status(403).send("Access denied");
    }

    // role matches, continue to route handler
    next();
  };
}




function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    
    return next();
  }

  res.redirect("/login");
}


function RedirectifLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }



  next();
}

app.post("/UserAdded", async (req, res) => {
  const { Your_username, Newusername, acessKey } = req.body;

  //this checks if the email of the adder is valid
  try {
    const result = await db.query(
      "SELECT * FROM userdetails WHERE student_email = $1",
      [Your_username]
    );

    if (result.rows.length > 0) {
      try {
        if (CheckDomain(Newusername)) {
          // checks if the added username has a valid domain

          if (await emailExists(Newusername)) {
            // check if the New username does not exist on the database
            return res.send("this email already exist");
          } else {
            // if not exist.. hash the acess key , add to the db then redirect

            const UserRole = "admin";
            const hashedAcess_key = await bcrypt.hash(acessKey, 10); // 10 = salt rounds

            await db.query(
              "INSERT INTO userdetails (student_email , acess_key, role) VALUES ($1, $2 , $3)",
              [Newusername, hashedAcess_key , UserRole ]
            );

            res.redirect("/");
          }
        } else {
          res.send("Use the dut4life email"); // this is for the domain if
        }
      } catch (error) {
        res.send("cannot add-user"); //this is after result rows
      }
    } else {
      res.send("please enter valid student email");
    }
  } catch (error) {
    res.send("failed to add user");
  }
});

app.post("/login", async (req, res) => {
  const { username, acessKey } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM userdetails WHERE student_email = $1",
      [username]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const Stored_acessKey = user.acess_key;

      //   console.log(acessKey, Stored_acessKey);

      const match = await bcrypt.compare(
        acessKey.trim(),
        Stored_acessKey.trim()
      );

      if (match) {
        req.session.user = {
          id: user.id, // your database user ID
          email: user.student_email.trim().toLowerCase(), // the admin’s email
           role: user.role.trim().toLowerCase(), // <— add this
        };

        res.redirect("/");
      } else {
        res.send("wrong Acess Key");
      }
    } else {
      res.send("failed to login, username does not exist");
    }
  } catch (error) {
    res.send("failed to login");
  }
});

app.get("/login", RedirectifLoggedIn , (req, res) => {
  res.render("main.ejs");
});

app.post("/api/bin-data",  async(req, res) =>{

// console.log("received data:", req.body);

 const data =  req.body
    
 const distance = data.distance;
 const timestamp = data.timestamp;

 console.log(distance, timestamp);

 try {
   await db.query("INSERT INTO bin_data (distance , timestamp) VALUES($1 , $2)", [distance, timestamp]);
   res.json({message: "data receved successfully!" });
 } catch (error) {
       res.status(500).send("unable to update the Database");
 }

});



app.get("/api/latest-bin-data", async (req, res) => {

  try {
      const result = await db.query(
    "SELECT * FROM bin_data ORDER BY timestamp DESC LIMIT 5"
  );

  const rows = result.rows.map(row => ({
    time: new Date(row.timestamp).toLocaleString('en-GB', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }),
    fillLevel: convertDistance(row.distance)
  }));


  res.json(rows); // sends JSON only

  } catch (error) {
      res.send("unable to get live data");
  }

});



app.get('/Logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log(err);
      return res.status(500).send('Could not log out.');
    }
    res.clearCookie('connect.sid'); // clears the cookie in the browser
    res.redirect('/login');          // redirect to login page
  });
});



app.get("/signup" , (req, res) =>{

  res.render("signup");
})

app.post("/signUp", async (req, res) => {
  
   const body = req.body;

   const username = body.Newusername;
  const  accesskey =  body.acessKey;
  const confirm = body.CacessKey;

  if (accesskey === confirm){
       if ( await emailExists(username)){

        res.send("ths email Already Exist, Try to login or use Anouther One")
       }

       else{

             if (CheckDomain(username)){
              
            const UserRole = "client";
            const hashedAcess_key = await bcrypt.hash(accesskey, 10); // 10 = salt rounds

            await db.query(
              "INSERT INTO userdetails (student_email , acess_key, role) VALUES ($1, $2 , $3)",
              [username, hashedAcess_key , UserRole]
            );

            res.redirect("clientDashboard");
             }
             else{
              res.send("please use the dut4life.ac.za email")
             }
       }

  }

  else{
    res.send ("The Acess key does not match");
  }

});



app.get("/clientDashboard", requireLogin , CheckRole("client"),  async (req, res) =>{

 try {
  const result = await db.query("SELECT * FROM bin_data ORDER BY timestamp DESC LIMIT 5");
   const rowsToFill = result.rows.reverse().map(row => {
  return {
    time:new Date(row.timestamp).toLocaleString(
      'en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false  // 24-hour format
}
    ),
    fillLevel: convertDistance(row.distance) 
  };
});
// console.log(result);
  res.render("clientDashboard.ejs", { user: req.session.user , rows: rowsToFill});

  } catch (error) {
    res.send("unable to get data");
  }

});


app.post("/ReportBin", requireLogin, CheckRole("client"), async (req, res) => {
  try {
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: "decoythingpholoba@gmail.com, amandankwa5@gmail.com, velilengxongo@gmail.com, ngcobonokuphila30@gmail.com", 
      subject: "🚨 Bin Full Alert!",
      text: `The bin reported by ${req.session.user.email} is now full. Please schedule maintenance.`,
    };
 
    await transporter.sendMail(mailOptions);

    console.log("Alert email sent successfully!");
    res.status(200).send("Full bin reported successfully!");
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send("Failed to send email alert");
  }
});

app.listen(port, "0.0.0.0",  () => {
  console.log(`Listening on port http://localhost:${port}`);
});
