const db = require("../config/db");

const {
  generateAccessToken,
  generateRefreshToken
} = require("../utils/generateToken");

const jwt = require("jsonwebtoken");


// ==========================================
// REGISTER SERVICE
// ==========================================
const registerUser = (userData) => {

  return new Promise((resolve, reject) => {

    const {
      name,
      email,
      password,
      role
    } = userData;

    // CHECK USER EXISTS
    const checkQuery =
      "SELECT * FROM users WHERE email = ?";

    db.query(
      checkQuery,
      [email],
      (err, result) => {

        if (err) {
          return reject(err);
        }

        if (result.length > 0) {

          return reject({
            status: 400,
            message: "User already exists"
          });

        }

        // INSERT USER
        const insertQuery = `
          INSERT INTO users
          (name, email, password, role)
          VALUES (?, ?, ?, ?)
        `;

        db.query(
          insertQuery,
          [
            name,
            email,
            password,
            role || "user"
          ],
          (err, result) => {

            if (err) {
              return reject(err);
            }

            resolve({
              success: true,
              message: "User registered successfully",

              user: {
                id: result.insertId,
                name,
                email,
                role: role || "user"
              }
            });

          }
        );

      }
    );

  });

};


// ==========================================
// ACCOUNT ME SERVICE
// ==========================================
const getAccountMeService = (email) => {

  return new Promise((resolve, reject) => {

    const query = `
      SELECT id, name, email, role
      FROM users
      WHERE email = ?
    `;

    db.query(
      query,
      [email],
      (err, result) => {

        if (err) {
          return reject(err);
        }

        // USER NOT FOUND
        if (result.length === 0) {

          return reject({
            status: 404,
            message: "User not found"
          });

        }

        const user = result[0];

        // ACCESS TOKEN
        const accessToken =
          generateAccessToken({
            id: user.id,
            email: user.email,
            role: user.role
          });

        // REFRESH TOKEN
        const refreshToken =
          generateRefreshToken({
            id: user.id
          });

        resolve({
          success: true,

          access_token: accessToken,

          refresh_token: refreshToken,

          expires_in: "30m",

          user
        });

      }
    );

  });

};


// ==========================================
// REFRESH TOKEN SERVICE
// ==========================================
const refreshAccessTokenService = (
  refresh_token
) => {

  return new Promise((resolve, reject) => {

    jwt.verify(
      refresh_token,
      process.env.JWT_REFRESH_SECRET,
      (err, decoded) => {

        if (err) {

          return reject({
            status: 403,
            message: "Invalid refresh token"
          });

        }

        const newAccessToken =
          generateAccessToken({
            id: decoded.id
          });

        resolve({
          success: true,

          access_token: newAccessToken,

          expires_in: "30m"
        });

      }
    );

  });

};


module.exports = {
  registerUser,
  getAccountMeService,
  refreshAccessTokenService
};