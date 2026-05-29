const jwt = require("jsonwebtoken");


// ACCESS TOKEN -> 30 mins
const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn: "30m"
    }
  );
};


// REFRESH TOKEN -> 1 month
const generateRefreshToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "30d"
    }
  );
};


module.exports = {
  generateAccessToken,
  generateRefreshToken
};