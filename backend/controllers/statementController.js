import Statement from '../models/Statement.js';

// @desc    Get all statement entries (sorted oldest-first for correct running balance)
// @route   GET /api/statements
export const getStatements = async (req, res) => {
  try {
    const statements = await Statement.find({}).sort({ date: 1, createdAt: 1 });
    res.status(200).json({ success: true, count: statements.length, data: statements });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Get single statement entry
// @route   GET /api/statements/:id
export const getStatementById = async (req, res) => {
  try {
    const entry = await Statement.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// Helper: Recalculate closingBalance for all entries after a given date
const recalculateBalances = async (fromDate) => {
  // Get all entries from the changed date onwards, sorted chronologically
  const entries = await Statement.find({ date: { $gte: fromDate } }).sort({ date: 1, createdAt: 1 });

  // Find the closing balance of the entry just before this date (the "opening" for the chain)
  const prevEntry = await Statement.findOne({ date: { $lt: fromDate } }).sort({ date: -1, createdAt: -1 });
  let runningBalance = prevEntry ? prevEntry.closingBalance : 0;

  for (const entry of entries) {
    if (entry.type === 'CR') {
      runningBalance += entry.creditAmount;
    } else {
      runningBalance -= entry.debitAmount;
    }
    entry.closingBalance = runningBalance;
    await entry.save();
  }
};

// @desc    Create a new statement entry
// @route   POST /api/statements
export const createStatement = async (req, res) => {
  try {
    const { date, type, name, debitAmount, creditAmount, remarks } = req.body;

    if (!date || !type || !name) {
      return res.status(400).json({ success: false, error: 'date, type, and name are required.' });
    }

    // Compute running closing balance up to this new entry
    const entryDate = new Date(date);
    const prevEntry = await Statement.findOne({ date: { $lte: entryDate } }).sort({ date: -1, createdAt: -1 });
    let prevBalance = prevEntry ? prevEntry.closingBalance : 0;

    let closingBalance;
    if (type === 'CR') {
      closingBalance = prevBalance + (parseFloat(creditAmount) || 0);
    } else {
      closingBalance = prevBalance - (parseFloat(debitAmount) || 0);
    }

    const entry = await Statement.create({
      date: entryDate,
      type,
      name,
      debitAmount: type === 'DR' ? (parseFloat(debitAmount) || 0) : 0,
      creditAmount: type === 'CR' ? (parseFloat(creditAmount) || 0) : 0,
      closingBalance,
      remarks,
    });

    // Recalculate all entries after this new date to keep balances accurate
    await recalculateBalances(entryDate);

    // Re-fetch the saved entry with updated balance
    const saved = await Statement.findById(entry._id);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
};

// @desc    Update a statement entry
// @route   PUT /api/statements/:id
export const updateStatement = async (req, res) => {
  try {
    const { date, type, name, debitAmount, creditAmount, remarks } = req.body;

    const entry = await Statement.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

    const entryDate = date ? new Date(date) : entry.date;
    const earliestDate = entryDate < entry.date ? entryDate : entry.date;

    entry.date = entryDate;
    entry.type = type || entry.type;
    entry.name = name || entry.name;
    entry.debitAmount = (type || entry.type) === 'DR' ? (parseFloat(debitAmount) || 0) : 0;
    entry.creditAmount = (type || entry.type) === 'CR' ? (parseFloat(creditAmount) || 0) : 0;
    entry.remarks = remarks !== undefined ? remarks : entry.remarks;
    await entry.save();

    // Recalculate all entries from the earliest affected date
    await recalculateBalances(earliestDate);

    const updated = await Statement.findById(req.params.id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
};

// @desc    Delete a statement entry
// @route   DELETE /api/statements/:id
export const deleteStatement = async (req, res) => {
  try {
    const entry = await Statement.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

    const entryDate = entry.date;
    await entry.deleteOne();

    // Recalculate all entries after this date
    await recalculateBalances(entryDate);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

// @desc    Delete all statement entries
// @route   DELETE /api/statements
export const deleteStatements = async (req, res) => {
  try {
    await Statement.deleteMany({});
    res.status(200).json({ success: true, message: 'All entries deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};

