const express = require("express");

const router = express.Router();

const verifyAccessToken =
  require("../middleware/verifyAccessToken");

const {
  getRecords,
  getRecordData,
  getFinalDocument,
  submitRecordData
} = require("../controllers/recordsController");


router.get(
  "/",
  verifyAccessToken,
  getRecords
);

router.get(
  "/:idRecord/data",
  verifyAccessToken,
  getRecordData
);

router.get(
  "/:idRecord/final",
  verifyAccessToken,
  getFinalDocument
);

router.post(
  "/record-data",
  verifyAccessToken,
  submitRecordData
);

module.exports = router;