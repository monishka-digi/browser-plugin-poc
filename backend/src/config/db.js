const mysql = require("mysql2");
 
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});
 
connection.connect((err) => {
 
  if (err) {
    console.log(
      `DB Connection Failed: ${err.code || "UNKNOWN"} - ${err.sqlMessage || err.message}`
    );
 
    if (err.code === "ER_ACCESS_DENIED_ERROR") {
      console.log(
        "Check DB_USER and DB_PASSWORD in .env against your local MySQL user."
      );
    }
 
    return;
  }
 
  console.log("MySQL Connected");
 
});
 
module.exports = connection;