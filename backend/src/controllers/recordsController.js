const db = require("../config/db");


// GET /records
 // your mysql connection

const getRecords = async (req, res, next) => {
  try {
    const query = "SELECT * FROM records";

    db.query(query, (err, results) => {
      if (err) {
        return next(err);
      }

      res.status(200).json({
        success: true,
        records: results
      });
    });

  } catch (error) {
    next(error);
  }
};


// GET /records/:idRecord/data
const getRecordData = async (req, res, next) => {
  try {
    const { idRecord } = req.params;

    const query = `
      SELECT *
      FROM records
      WHERE record_id = ?
    `;

    db.query(query, [idRecord], (err, results) => {
      if (err) {
        return next(err);
      }

      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Record not found"
        });
      }

      res.status(200).json({
        success: true,
        data: results[0]
      });
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
    const {
      record_id,
      full_name,
      birth_date,
      rfc,
      curp,
      fiscal_registration_number,
      company_name,
      document_type,
      identification_number
    } = req.body;

    const query = `
      INSERT INTO records (
        record_id,
        full_name,
        birth_date,
        rfc,
        curp,
        fiscal_registration_number,
        company_name,
        document_type,
        identification_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        birth_date = VALUES(birth_date),
        rfc = VALUES(rfc),
        curp = VALUES(curp),
        fiscal_registration_number = VALUES(fiscal_registration_number),
        company_name = VALUES(company_name),
        document_type = VALUES(document_type),
        identification_number = VALUES(identification_number)
    `;

    db.query(
      query,
      [
        record_id,
        full_name,
        birth_date,
        rfc,
        curp,
        fiscal_registration_number,
        company_name,
        document_type,
        identification_number
      ],
      (err, result) => {
        if (err) {
          return next(err);
        }

        res.status(200).json({
          success: true,
          message:
            result.affectedRows === 1
              ? "Record created successfully"
              : "Record updated successfully"
        });
      }
    );
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
