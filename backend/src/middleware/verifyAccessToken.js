const jwt = require("jsonwebtoken");

const verifyAccessToken = (
  req,
  res,
  next
) => {

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Access token missing"
    });
  }

  const token =
    authHeader.split(" ")[1];

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    (err, decoded) => {

      if (err) {
        return res.status(401).json({
          success: false,
          message: "Access token expired or invalid"
        });
      }

      req.user = decoded;

      next();
    }
  );
};

module.exports = verifyAccessToken;