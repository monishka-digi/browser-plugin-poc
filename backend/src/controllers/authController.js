const {
  registerUser,
  getAccountMeService,
  refreshAccessTokenService
} = require("../services/authService");
 
 
// ==========================================
// REGISTER
// ==========================================
const register = async (req, res, next) => {
 
  try {
 
    const {
      name,
      email,
      password
    } = req.body;
 
    // VALIDATION
    if (!name || !email || !password) {
 
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required"
      });
 
    }
 
    const response =
      await registerUser(req.body);
 
    res.status(201).json(response);
 
  } catch (error) {
 
    if (error.status) {
 
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
 
    }
 
    next(error);
 
  }
 
};
 
 
// ==========================================
// ACCOUNT ME
// ==========================================
const getAccountMe = async (
  req,
  res,
  next
) => {
 
  try {
 
    const email  = req.headers.email;
 
    if (!email) {
 
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
 
    }
 
    const response =
      await getAccountMeService(email);
 
    res.status(200).json(response);
 
  } catch (error) {
 
    if (error.status) {
 
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
 
    }
 
    next(error);
 
  }
 
};
 
 
// ==========================================
// REFRESH ACCESS TOKEN
// ==========================================
const refreshAccessToken = async (
  req,
  res,
  next
) => {
 
  try {
 
    const { refresh_token } = req.body;
 
    if (!refresh_token) {
 
      return res.status(401).json({
        success: false,
        message: "Refresh token required"
      });
 
    }
 
    const response =
      await refreshAccessTokenService(
        refresh_token
      );
 
    res.status(200).json(response);
 
  } catch (error) {
 
    if (error.status) {
 
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
 
    }
 
    next(error);
 
  }
 
};
 
 
module.exports = {
  register,
  getAccountMe,
  refreshAccessToken
};