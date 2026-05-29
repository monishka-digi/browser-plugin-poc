const authMiddleware = (req, res, next) => {
  const providerId = req.headers["provider-id"];
  const providerSecret = req.headers["provider-secret"];
  const apiKey = req.headers["api-key"];

  if (!providerId || !providerSecret || !apiKey) {
    return res.status(401).json({
      success: false,
      message: "Missing API credentials"
    });
  }

  next();
};

module.exports = authMiddleware;