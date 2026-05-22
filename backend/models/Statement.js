import mongoose from 'mongoose';

const statementSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    type: {
      type: String,
      enum: ['CR', 'DR'],
      required: [true, 'Transaction type (CR/DR) is required'],
    },
    name: {
      type: String,
      required: [true, 'Name / narration is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    debitAmount: {
      type: Number,
      default: 0,
      min: [0, 'Debit amount cannot be negative'],
    },
    creditAmount: {
      type: Number,
      default: 0,
      min: [0, 'Credit amount cannot be negative'],
    },
    closingBalance: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [300, 'Remarks cannot exceed 300 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const Statement = mongoose.model('Statement', statementSchema);

export default Statement;
