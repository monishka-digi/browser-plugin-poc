const express = require("express");

const router = express.Router();

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  register,
  getAccountMe,
  refreshAccessToken
} = require("../controllers/authController");


// REGISTER
router.post(
  "/register",
  register
);


// ACCOUNT ME
router.get(
  "/account-me",
  authMiddleware,
  getAccountMe
);


// REFRESH TOKEN
router.post(
  "/refresh-token",
  refreshAccessToken
);

module.exports = router;