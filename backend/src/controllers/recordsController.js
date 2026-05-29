const records = require("../data/records.json");
const recordDetails = require("../data/recordDetails.json");


// GET /records
const getRecords = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      records
    });

  } catch (error) {
    next(error);
  }
};


// GET /records/:idRecord/data
const getRecordData = async (req, res, next) => {
  try {
    const { idRecord } = req.params;

    const data = recordDetails[idRecord];

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      });
    }

    res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    next(error);
  }
};


// GET /records/:idRecord/final
const getFinalDocument = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      document_url:
        "https://example.com/mock-deed.pdf"
    });

  } catch (error) {
    next(error);
  }
};


// POST /records/record-data
const submitRecordData = async (req, res, next) => {
  try {
    console.log("Submitted Data:", req.body);

    res.status(201).json({
      success: true,
      message: "Record data submitted successfully"
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRecords,
  getRecordData,
  getFinalDocument,
  submitRecordData
};