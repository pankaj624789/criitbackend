// backend/server.js
require('dotenv').config(); // <- must be at the top

const express = require("express");
const cors = require("cors");
const pool = require("./db");  // Supabase PostgreSQL via PgBouncer

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------
// Generate Requisition_No
// ------------------------------------------------------
async function generateRequisitionNo() {
  try {
    const result = await pool.query(`SELECT MAX(id) AS "MaxId" FROM indents`);

    const newId = (result.rows[0]?.MaxId || 0) + 1;
    const fy = "25-26"; // static for now

    return `IT/${newId}/${fy}`;
  } catch (err) {
    console.error("❌ Error generating requisition number:", err);
    return `IT/0/25-26`;
  }
}

// ------------------------------------------------------
// Root Route
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ IT Portal Server running on Supabase PostgreSQL");
});

// ------------------------------------------------------
// GET all indents
// ------------------------------------------------------
app.get("/api/indents", async (req, res) => {
  try {
    const query = `
      SELECT 
        id AS "Id",
        requisition_no AS "Requisition_No",
        descriptionofmaterial AS "DescriptionOfMaterial",
        reqqty AS "ReqQty",
        pendingqty AS "PendingQty",
        uom AS "UOM",
        presentstock AS "PresentStock",
        avmc_last3months AS "AVMC_Last3Months",
        maxcons_last1year AS "MaxCons_Last1Year",
        requireddate AS "RequiredDate",
        remarksordrawingno AS "RemarksOrDrawingNo",
        requiredby AS "RequiredBy",
        storemanager AS "StoreManager",
        reviewedby AS "ReviewedBy"
      FROM indents
      ORDER BY id DESC
    `;

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------------------
// CREATE new indent
// ------------------------------------------------------
app.post("/api/indents", async (req, res) => {
  try {
    const requisitionNo = await generateRequisitionNo();

    const {
      DescriptionOfMaterial,
      ReqQty,
      PendingQty,
      UOM,
      PresentStock,
      AVMC_Last3Months,
      MaxCons_Last1Year,
      RequiredDate,
      RemarksOrDrawingNo,
      RequiredBy,
      StoreManager,
      ReviewedBy,
    } = req.body;

    const insertQuery = `
      INSERT INTO indents
      (
        Requisition_No, DescriptionOfMaterial, ReqQty, PendingQty, UOM,
        PresentStock, AVMC_Last3Months, MaxCons_Last1Year, RequiredDate,
        RemarksOrDrawingNo, RequiredBy, StoreManager, ReviewedBy
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
    `;

    const params = [
      requisitionNo,
      DescriptionOfMaterial,
      ReqQty,
      PendingQty,
      UOM,
      PresentStock,
      AVMC_Last3Months,
      MaxCons_Last1Year,
      RequiredDate,
      RemarksOrDrawingNo,
      RequiredBy,
      StoreManager,
      ReviewedBy
    ];

    const result = await pool.query(insertQuery, params);

    res.status(201).json({
      Id: result.rows[0].id,
      Requisition_No: requisitionNo
    });

  } catch (err) {
    console.error("❌ Insert Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const fieldMap = {
  DescriptionOfMaterial: "descriptionofmaterial",
  ReqQty: "reqqty",
  PendingQty: "pendingqty",
  UOM: "uom",
  PresentStock: "presentstock",
  AVMC_Last3Months: "avmc_last3months",
  MaxCons_Last1Year: "maxcons_last1year",
  RequiredDate: "requireddate",
  RemarksOrDrawingNo: "remarksordrawingno",
  RequiredBy: "requiredby",
  StoreManager: "storemanager",
  ReviewedBy: "reviewedby",
};

app.put("/api/indents/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const mappedEntries = Object.entries(req.body).map(
      ([key, value]) => ({
        dbColumn: fieldMap[key],
        value
      })
    );

    const setClause = mappedEntries
      .map((x, i) => `"${x.dbColumn}"=$${i + 1}`)
      .join(",");

    const values = mappedEntries.map((x) => x.value);

    await pool.query(
      `UPDATE indents SET ${setClause} WHERE id=$${values.length + 1}`,
      [...values, id]
    );

    res.json({ message: "Updated successfully" });
  } catch (err) {
    console.error("❌ Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});



app.delete("/api/indents/:id", async (req, res) => {
  try {
    const id = req.params.id;

    await pool.query(`DELETE FROM indents WHERE Id=$1`, [id]);

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("❌ Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ Asset details routes
// =======================

// =======================
// ✅ Asset Details Routes
// =======================

// Helper: dynamically get numeric columns from PostgreSQL
async function getNumericColumns() {
  const res = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name='asset_details' 
      AND data_type IN ('numeric','double precision','real','integer','smallint','bigint');
  `);
  return res.rows.map(r => r.column_name);
}

// -----------------------
// GET all assets
// -----------------------
app.get("/api/asset-details", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM asset_details ORDER BY sn ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ PostgreSQL Error (GET /asset-details):", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------
// ADD (INSERT) asset
// -----------------------
app.post("/api/asset-details", async (req, res) => {
  try {
    const body = req.body;

    // Get numeric columns dynamically
    const numericFields = await getNumericColumns();

    // Sanitize numeric fields
    const sanitizedBody = {};
    for (const [key, val] of Object.entries(body)) {
      sanitizedBody[key] = numericFields.includes(key) && val === "" ? null
                          : numericFields.includes(key) ? parseFloat(val)
                          : val;
    }

    const keys = Object.keys(sanitizedBody);
    const values = Object.values(sanitizedBody);

    const query = `
      INSERT INTO asset_details (${keys.map(k => `"${k}"`).join(",")})
      VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ PostgreSQL Error (POST /asset-details):", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------
// UPDATE asset
// -----------------------
app.put("/api/asset-details", async (req, res) => {
  try {
    const body = req.body;
    const sn = body.sn;

    if (!sn) return res.status(400).json({ error: "❌ 'sn' is required for updating." });

    // Get numeric columns dynamically
    const numericFields = await getNumericColumns();

    const keys = Object.keys(body).filter(k => k !== "sn");
    const values = keys.map(k =>
      numericFields.includes(k) && body[k] === "" ? null
      : numericFields.includes(k) ? parseFloat(body[k])
      : body[k]
    );

    const updateQuery = `
      UPDATE asset_details
      SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ")}
      WHERE sn = $${keys.length + 1}
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [...values, sn]);
    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ PostgreSQL Error (PUT /asset-details):", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------
// DELETE asset
// -----------------------
app.delete("/api/asset-details/:sn", async (req, res) => {
  try {
    const sn = req.params.sn;
    await pool.query(`DELETE FROM asset_details WHERE sn = $1`, [sn]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ PostgreSQL Error (DELETE /asset-details):", err);
    res.status(500).json({ error: err.message });
  }
});




/// ---------------- SCRAP ITEMS API ----------------

// ✅ Get all scrap items
app.get("/api/scrap-items", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM scrap_items
      ORDER BY sn DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching scrap items:", err);
    res.status(500).send("Error fetching scrap items");
  }
});

// ✅ Add new scrap item
app.post("/api/scrap-items", async (req, res) => {
  try {
    const item = req.body;

const convertToSqlDate = (dateInput) => {
  if (!dateInput) return null;

  // If it's already a Date object
  if (dateInput instanceof Date) {
    return dateInput.toISOString().split("T")[0];
  }

  // If it's an ISO string
  const parsed = new Date(dateInput);
  if (!isNaN(parsed)) {
    return parsed.toISOString().split("T")[0];
  }

  // If it's dd/mm/yyyy format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  console.warn("⚠️ Unrecognized date format:", dateInput);
  return null;
};



    const dop = convertToSqlDate(item.dop_date);

    const query = `
      INSERT INTO scrap_items (
        location, department, asset_number, user_name,
        make_model, serial_number, processor, hdd, ram,
        status, dop_date, scrap_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      RETURNING *;
    `;

    const values = [
      item.location,
      item.department,
      item.asset_number,
      item.user_name,
      item.make_model,
      item.serial_number,
      item.processor,
      item.hdd,
      item.ram,
      item.status || "Scrap",
      dop
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ Error adding scrap item:", err);
    res.status(500).send("Error adding scrap item");
  }
});

// ✅ Update a scrap item
app.put("/api/scrap-items", async (req, res) => {
  try {
    const item = req.body;
    const SN = item.sn;

    const convertToSqlDate = (dateStr) => {
      if (!dateStr) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const [d, m, y] = dateStr.split("/");
      return `${y}-${m}-${d}`;
    };

    const query = `
      UPDATE scrap_items SET
        location=$1,
        department=$2,
        asset_number=$3,
        user_name=$4,
        make_model=$5,
        serial_number=$6,
        processor=$7,
        hdd=$8,
        ram=$9,
        status=$10,
        dop_date=$11
      WHERE sn=$12
      RETURNING *;
    `;

    const values = [
      item.location,
      item.department,
      item.asset_number,
      item.user_name,
      item.make_model,
      item.serial_number,
      item.processor,
      item.hdd,
      item.ram,
      item.status,
      convertToSqlDate(item.dop_date),
      SN
    ];

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ Error updating scrap item:", err);
    res.status(500).send("Error updating scrap item");
  }
});

// ✅ Delete scrap item
app.delete("/api/scrap-items/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM scrap_items WHERE sn = $1`, [req.params.id]);
    res.send("Scrap item removed");
  } catch (err) {
    console.error("❌ Error deleting scrap item:", err);
    res.status(500).send("Error deleting scrap item");
  }
});




// ✅ Get all Stock Items
app.get("/api/stock-items", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sn, department, asset_number, user_name,
        item_type, make_model, serial_number, processor,
        hdd, ram, status, dop_date
      FROM stock_items
      ORDER BY sn ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching stock items:", err);
    res.status(500).send("Server Error");
  }
});

// Add new Stock Item
app.post("/api/stock-items", async (req, res) => {
  try {
    const item = req.body;

    const convertToSqlDate = (dateStr) => {
      if (!dateStr) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const [d, m, y] = dateStr.split("/");
      return `${y}-${m}-${d}`;
    };

    const query = `
      INSERT INTO stock_items (
        department, asset_number, user_name, item_type,
        make_model, serial_number, processor, hdd, ram,
        status, dop_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      item.department,
      item.asset_number,
      item.user_name,
      item.item_type,
      item.make_model,
      item.serial_number,
      item.processor,
      item.hdd,
      item.ram,
      item.status,
      convertToSqlDate(item.dop_date)
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ Error adding stock item:", err);
    res.status(500).send(err.message);
  }
});

// ✅ Delete Stock Item
app.delete("/api/stock-items/:id", async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM stock_items WHERE sn = $1`,
      [req.params.id]
    );

    res.json({ message: "Stock item deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting stock item:", err);
    res.status(500).send(err.message);
  }
});

// ✅ Update a Stock Item
app.put("/api/stock-items", async (req, res) => {
  try {
    const body = req.body;
    const SN = body.sn;

    if (!SN) return res.status(400).send("Missing sn");

    const convertToSqlDate = (dateStr) => {
      if (!dateStr) return dateStr;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const [d, m, y] = dateStr.split("/");
      return `${y}-${m}-${d}`;
    };

    const query = `
      UPDATE stock_items SET
        department=$1,
        asset_number=$2,
        user_name=$3,
        item_type=$4,
        make_model=$5,
        serial_number=$6,
        processor=$7,
        hdd=$8,
        ram=$9,
        status=$10,
        dop_date=$11
      WHERE sn=$12
      RETURNING *;
    `;

    const result = await pool.query(query, [
      body.department,
      body.asset_number,
      body.user_name,
      body.item_type,
      body.make_model,
      body.serial_number,
      body.processor,
      body.hdd,
      body.ram,
      body.status,
      convertToSqlDate(body.dop_date),
      SN
    ]);

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ Error updating stock item:", err);
    res.status(500).send("Server error updating stock item");
  }
});



// ✅ Asset summary (by department)

app.get("/api/asset-summary", async (req, res) => {
  const location = req.query.location || "";
  try {
    let params = [];
    let where = "";
    if (location) {
      where = `WHERE location = $1`;
      params.push(location);
    }

    const query = `
      SELECT 
        department,
        SUM(CASE WHEN make_model ILIKE '%Desktop%' OR make_model ILIKE '%Laptop%' OR make_model ILIKE '%Computer%' THEN 1 ELSE 0 END) AS "DesktopLaptop",
        SUM(CASE WHEN make_model ILIKE '%Laptop%' THEN 1 ELSE 0 END) AS "Laptop",
        SUM(CASE WHEN printer IS NOT NULL AND printer <> '' THEN 1 ELSE 0 END) AS "Printer"
      FROM asset_details
      ${where}
      GROUP BY department
      ORDER BY department;
    `;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching asset summary:", err);
    res.status(500).send("Server Error");
  }
});


// ✅ Locations list
app.get("/api/locations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT location
      FROM asset_details
      WHERE location IS NOT NULL AND location <> ''
      ORDER BY location;
    `);
    res.json(result.rows.map(r => r.location)); // lowercase
  } catch (err) {
    console.error("Error fetching locations:", err);
    res.status(500).send("Server Error");
  }
});


// ✅ Stock summary
app.get("/api/stock-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        'IT Department' AS "Stock At",
        item_type,
        COUNT(*) AS "Total"
      FROM stock_items
      GROUP BY item_type
      ORDER BY item_type;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching stock summary:", err);
    res.status(500).send("Server Error");
  }
});



// ---------- Invoice API (server.js) ----------



/// GET invoices list with search + pagination
app.get("/api/invoices", async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 100;
    const offset = (page - 1) * pageSize;

    const params = [];
    let where = "";

    if (search) {
      where = `WHERE (
        material ILIKE $1 OR 
        particular ILIKE $1 OR 
        vendor_name ILIKE $1 OR 
        invoice_number ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    const countSql = `SELECT COUNT(*) AS totalcount FROM invoice_details ${where}`;
    const countRes = await pool.query(countSql, params);
    const total = parseInt(countRes.rows[0].totalcount, 10);

    const listSql = `
      SELECT *
      FROM invoice_details
      ${where}
      ORDER BY sn DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2};
    `;

    const listParams = params.concat([pageSize, offset]);
    const listRes = await pool.query(listSql, listParams);

    res.json({ data: listRes.rows, total, page, pageSize });
  } catch (err) {
    console.error("GET /api/invoices error:", err);
    res.status(500).send("Server Error");
  }
});


// GET single invoice by id
app.get("/api/invoices/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `SELECT * FROM invoice_details WHERE sn = $1`,
      [id]
    );

    if (!result.rows.length) return res.status(404).send("Invoice not found");
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/invoices/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// POST create invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const d = req.body;

    const insertSql = `
      INSERT INTO invoice_details (
        indent_date, material, particular, quantity, uom, vendor_name,
        purchase_order_number, purchase_order_date, invoice_number, invoice_date,
        invoice_value, taxable_value, igst, cgst, sgst, bill_handed_over_to,
        allocation_date, fixed_asset_number, user_name, use_from, use_to, remarks
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING *;
    `;

    const params = [
      d.indent_date,
      d.material,
      d.particular,
      d.quantity,
      d.uom,
      d.vendor_name,
      d.purchase_order_number,
      d.purchase_order_date,
      d.invoice_number,
      d.invoice_date,
      d.invoice_value,
      d.taxable_value,
      d.igst,
      d.cgst,
      d.sgst,
      d.bill_handed_over_to,
      d.allocation_date,
      d.fixed_asset_number,
      d.user_name,
      d.use_from,
      d.use_to,
      d.remarks
    ];

    const result = await pool.query(insertSql, params);
    res.json({ message: "Invoice saved successfully", data: result.rows[0] });
  } catch (err) {
    console.error("POST /api/invoices error:", err);
    res.status(500).send("Server Error");
  }
});


// PUT update invoice
app.put("/api/invoices/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const d = req.body;

    const updateSql = `
      UPDATE invoice_details SET
        indent_date = $1,
        material = $2,
        particular = $3,
        quantity = $4,
        uom = $5,
        vendor_name = $6,
        purchase_order_number = $7,
        purchase_order_date = $8,
        invoice_number = $9,
        invoice_date = $10,
        invoice_value = $11,
        taxable_value = $12,
        igst = $13,
        cgst = $14,
        sgst = $15,
        bill_handed_over_to = $16,
        allocation_date = $17,
        fixed_asset_number = $18,
        user_name = $19,
        use_from = $20,
        use_to = $21,
        remarks = $22
      WHERE sn = $23
      RETURNING *;
    `;

    const params = [
      d.indent_date,
      d.material,
      d.particular,
      d.quantity,
      d.uom,
      d.vendor_name,
      d.purchase_order_number,
      d.purchase_order_date,
      d.invoice_number,
      d.invoice_date,
      d.invoice_value,
      d.taxable_value,
      d.igst,
      d.cgst,
      d.sgst,
      d.bill_handed_over_to,
      d.allocation_date,
      d.fixed_asset_number,
      d.user_name,
      d.use_from,
      d.use_to,
      d.remarks,
      id
    ];

    const result = await pool.query(updateSql, params);
    res.json({ message: "Invoice updated", data: result.rows[0] });
  } catch (err) {
    console.error("PUT /api/invoices/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// DELETE invoice
app.delete("/api/invoices/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM invoice_details WHERE sn = $1`, [
      req.params.id,
    ]);

    res.json({ message: "Invoice deleted" });
  } catch (err) {
    console.error("DELETE /api/invoices/:id error:", err);
    res.status(500).send("Server Error");
  }
});

// -------------------------------------------
// E-MAIL_ID MANAGER  (similar to InvoiceManager)
// -------------------------------------------

// GET list with optional search + pagination

// GET list with optional search + pagination
app.get("/api/emailids", async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 500;
    const offset = (page - 1) * pageSize;

    const params = [];
    let where = "";

    if (search) {
      where = `WHERE (
        first_name ILIKE $1 OR 
        last_name ILIKE $1 OR 
        email_address ILIKE $1 OR 
        location ILIKE $1 OR 
        particular ILIKE $1 OR 
        remarks ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    const countSql = `SELECT COUNT(*) AS totalcount FROM email_id_details ${where}`;
    const countRes = await pool.query(countSql, params);
    const total = parseInt(countRes.rows[0].totalcount, 10) || 0;

    const listSql = `
      SELECT *
      FROM email_id_details
      ${where}
      ORDER BY sn DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const listParams = params.concat([pageSize, offset]);
    const listRes = await pool.query(listSql, listParams);

    res.json({
      data: listRes.rows,
      total,
      page,
      pageSize
    });

  } catch (err) {
    console.error("GET /api/emailids error:", err);
    res.status(500).send("Server Error");
  }
});


// GET single record
app.get("/api/emailids/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `SELECT * FROM email_id_details WHERE sn = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).send("Record not found");
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/emailids/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// POST new record
app.post("/api/emailids", async (req, res) => {
  try {
    const { first_name, last_name, email_address, location, particular, remarks } = req.body;

    const result = await pool.query(
      `INSERT INTO email_id_details 
        (first_name, last_name, email_address, location, particular, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [first_name, last_name, email_address, location, particular, remarks]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("INSERT ERROR:", err);
    res.status(500).send("Insert failed");
  }
});



// UPDATE record
app.put("/api/emailids/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body;

    const updateSql = `
      UPDATE email_id_details SET
        first_name = $1,
        last_name = $2,
        email_address = $3,
        location = $4,
        particular = $5,
        remarks = $6
      WHERE sn = $7
      RETURNING *;
    `;

    const result = await pool.query(updateSql, [
      b.first_name || null,
      b.last_name || null,
      b.email_address || null,
      b.location || null,
      b.particular || null,
      b.remarks || null,
      id
    ]);

    res.json({ message: "Updated", data: result.rows[0] });

  } catch (err) {
    console.error("PUT /api/emailids/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// DELETE record
app.delete("/api/emailids/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query(`DELETE FROM email_id_details WHERE sn = $1`, [id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /api/emailids/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// EMAIL SUMMARY
app.get("/api/email-summary", async (req, res) => {
  try {
    const sqlQuery = `
      SELECT location, particular, COUNT(sn) AS totalcount
      FROM email_id_details
      GROUP BY location, particular
      ORDER BY location, particular;
    `;
    const result = await pool.query(sqlQuery);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/email-summary error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================
// COST DETAILS API
// ==========================

// GET cost details (list)
app.get("/api/cost-details", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM cost_details ORDER BY sn DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/cost-details error:", err);
    res.status(500).json({ error: "Unable to load cost details" });
  }
});


function toSqlDate(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}


app.post("/api/cost-details", async (req, res) => {
  try {
    console.log("📨 Incoming POST Body:", req.body);

    const {
      date,
      location,
      cost_account,
      cost_details,
      amount,
      payment_date
    } = req.body;

    const sql = `
      INSERT INTO cost_details 
      (date, location, cost_account, cost_details, amount, payment_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      toSqlDate(date),            // converts "2025-01-01"
      location || null,
      cost_account || null,
      cost_details || null,
      amount || null,
      toSqlDate(payment_date)     // converts "2025-01-10"
    ];

    const result = await pool.query(sql, values);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("POST /api/cost-details error:", err);
    res.status(500).json({ error: "Error saving data" });
  }
});


// PUT update cost entry
app.put("/api/cost-details/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const {
      date,
      location,
      cost_account,
      cost_details,
      amount,
      payment_date
    } = req.body;

    const sql = `
      UPDATE cost_details
      SET date = $1,
          location = $2,
          cost_account = $3,
          cost_details = $4,
          amount = $5,
          payment_date = $6
      WHERE sn = $7
      RETURNING *;
    `;

    const values = [
      toSqlDate(date),
      location || null,
      cost_account || null,
      cost_details || null,
      amount || null,
      toSqlDate(payment_date),
      id,
    ];

    const result = await pool.query(sql, values);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("PUT /api/cost-details error:", err);
    res.status(500).json({ error: "Error updating data" });
  }
});


// DELETE cost entry
app.delete("/api/cost-details/:id", async (req, res) => {
  try {
    const sn = req.params.id;
    await pool.query(`DELETE FROM cost_details WHERE sn = $1`, [sn]);
    res.send("Deleted successfully");
  } catch (err) {
    console.error("DELETE /api/cost-details/:id error:", err);
    res.status(500).send("Delete error");
  }
});


// COST SUMMARY
app.get("/api/cost-summary", async (req, res) => {
  try {
    const sqlQuery = `
      SELECT 
        to_char(date, 'YYYY-MM') AS month,
        location,
        cost_account AS "Cost Account",
        SUM(amount) AS totalcost
      FROM cost_details
      GROUP BY to_char(date, 'YYYY-MM'), location, cost_account
      ORDER BY month DESC, location, "Cost Account";
    `;

    const result = await pool.query(sqlQuery);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/cost-summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- RENEWALS API ----------------

// GET all renewals
app.get("/api/renewals", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM renewals ORDER BY sn DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching renewals:", err);
    res.status(500).send("Error fetching renewals");
  }
});



// Add new renewal
app.post("/api/renewals", async (req, res) => {
  try {
    const item = req.body;

    const query = `
      INSERT INTO renewals 
      (sn, compliance_particulars, last_year_details, authority_provider, auth_address, 
       law_statute, last_due_date, actual_date_of_compliences, actual_cost, 
       frequency, next_due_date, notification_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *;
    `;

    const values = [
      item.sn,
      item.compliance_particulars,
      item.last_year_details,
      item.authority_provider,
      item.auth_address,
      item.law_statute,
      item.last_due_date,
      item.actual_date_of_compliences,
      item.actual_cost,
      item.frequency,
      item.next_due_date,
      item.notification_status || "pending",
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error adding renewal:", err);
    res.status(500).send("Error adding renewal");
  }
});



// Update renewal
app.put("/api/renewals/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = req.body;

    const query = `
      UPDATE renewals SET
        sn = $1,
        compliance_particulars = $2,
        last_year_details = $3,
        authority_provider = $4,
        auth_address = $5,
        law_statute = $6,
        last_due_date = $7,
        actual_date_of_compliences = $8,
        actual_cost = $9,
        frequency = $10,
        next_due_date = $11,
        notification_status = $12
      WHERE id = $13
      RETURNING *;
    `;

    const values = [
      item.sn,
      item.compliance_particulars,
      item.last_year_details,
      item.authority_provider,
      item.auth_address,
      item.law_statute,
      item.last_due_date,
      item.actual_date_of_compliences,
      item.actual_cost,
      item.frequency,
      item.next_due_date,
      item.notification_status,
      id,
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ Error updating renewal:", err);
    res.status(500).send("Error updating renewal");
  }
});



// DELETE renewal
app.delete("/api/renewals/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.query(`DELETE FROM renewals WHERE id = $1`, [id]);

    res.send("Renewal entry removed");
  } catch (err) {
    console.error("❌ Error deleting renewal:", err);
    res.status(500).send("Error deleting renewal");
  }
});

// GET all asset allotments
// GET distinct users for allotment dropdown
app.get("/api/asset-allotment/users", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT user_name
      FROM public.asset_allotment
      WHERE user_name IS NOT NULL
      ORDER BY user_name
    `);

    res.status(200).json(rows.map(r => r.user_name));
  } catch (error) {
    console.error("❌ asset-allotment/users ERROR:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


// post asser allotments
app.post("/api/asset-allotment", async (req, res) => {
  try {
    const d = req.body;

    const insertSql = `
      INSERT INTO asset_allotment (
        asset_sn,
        user_name,
        department,
        location,
        item_name,
        item_make,
        item_serial_no,
        quantity,
        allotment_date,
        status,
        remarks
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      RETURNING *;
    `;

    const params = [
      d.asset_sn,
      d.user_name,
      d.department,
      d.location,
      d.item_name,
      d.item_make || null,
      d.item_serial_no || null,
      d.quantity || 1,
      d.allotment_date || new Date(),
      d.status || "Allotted",
      d.remarks || null,
    ];

    const result = await pool.query(insertSql, params);

    res.json({
      message: "Asset item allotted successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("POST /api/asset-allotment error:", err);
    res.status(500).send("Server Error");
  }
});


// PUT update asset allotment
app.put("/api/asset-allotment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;

    const updateSql = `
      UPDATE asset_allotment SET
        asset_sn = $1,
        user_name = $2,
        department = $3,
        location = $4,
        item_name = $5,
        item_make = $6,
        item_serial_no = $7,
        quantity = $8,
        allotment_date = $9,
        return_date = $10,
        status = $11,
        remarks = $12
      WHERE allotment_id = $13
      RETURNING *;
    `;

    const params = [
      d.asset_sn,
      d.user_name,
      d.department,
      d.location,
      d.item_name,
      d.item_make,
      d.item_serial_no,
      d.quantity,
      d.allotment_date,
      d.return_date,
      d.status,
      d.remarks,
      id,
    ];

    const result = await pool.query(updateSql, params);

    res.json({
      message: "Asset allotment updated",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("PUT /api/asset-allotment/:id error:", err);
    res.status(500).send("Server Error");
  }
});

// PUT return asset
app.put("/api/asset-allotment/return/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE asset_allotment
      SET
        return_date = CURRENT_DATE,
        status = 'Returned'
      WHERE allotment_id = $1
      RETURNING *;
      `,
      [id]
    );

    res.json({
      message: "Asset item returned successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("PUT /api/asset-allotment/return/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// DELETE asset allotment
app.delete("/api/asset-allotment/:id", async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM asset_allotment WHERE allotment_id = $1`,
      [req.params.id]
    );

    res.json({ message: "Asset allotment deleted" });
  } catch (err) {
    console.error("DELETE /api/asset-allotment/:id error:", err);
    res.status(500).send("Server Error");
  }
});


// GET currently allotted assets with asset master data
app.get("/api/asset-allotment/current", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        aa.allotment_id,
        aa.asset_sn,
        aa.user_name,
        aa.department,
        aa.location,
        aa.item_name,
        aa.item_make,
        aa.item_serial_no,
        aa.quantity,
        aa.allotment_date,
        aa.status,
        ad.asset_number,
        ad.make_model,
        ad.serial_number
      FROM asset_allotment aa
      JOIN asset_details ad
        ON ad.sn = aa.asset_sn
      WHERE aa.status = 'Allotted'
      ORDER BY aa.allotment_date DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/asset-allotment/current error:", err);
    res.status(500).send("Server Error");
  }
});

// GET user-wise allotments (MUST BE ABOVE :id ROUTE)
app.get("/api/asset-allotment/by-user/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(`
      SELECT
        aa.allotment_id,
        aa.item_name,
        aa.quantity,
        aa.allotment_date,
        aa.return_date,
        aa.status,
        aa.remarks,
        ad.asset_number,
        ad.make_model,
        ad.serial_number
      FROM asset_allotment aa
      LEFT JOIN asset_details ad
        ON ad.sn = aa.asset_sn
      WHERE aa.user_name = $1
      ORDER BY aa.allotment_date DESC
    `, [username]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET by-user error:", err);
    res.status(500).send("Server Error");
  }
});

// GET asset allotment by ID
app.get("/api/asset-allotment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM asset_allotment WHERE allotment_id = $1`,
      [id]
    );

    if (!result.rows.length)
      return res.status(404).send("Asset allotment not found");

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/asset-allotment/:id error:", err);
    res.status(500).send("Server Error");
  }
});





// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
