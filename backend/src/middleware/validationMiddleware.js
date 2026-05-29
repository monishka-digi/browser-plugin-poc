const validateRecordData = (req, res, next) => {
  const { general_data } = req.body;

  if (!general_data) {
    return res.status(400).json({
      success: false,
      message: "general_data is required"
    });
  }

  next();
};

module.exports = validateRecordData;