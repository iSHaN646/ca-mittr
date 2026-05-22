import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cleanNum = (s) => parseFloat(String(s).replace(/,/g, '')) || 0;

const parseHDFCDate = (s) => {
  // DD/MM/YY or DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  // CRITICAL: Use Date.UTC to avoid local timezone offset shifts!
  return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
};

const toISO = (d) => (!d || isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]);

const detectBank = (text) => {
  const t = text.toLowerCase();
  if (t.includes('hdfc bank')) return 'hdfc';
  if (t.includes('state bank of india') || t.includes('sbi')) return 'sbi';
  if (t.includes('icici bank')) return 'icici';
  if (t.includes('axis bank')) return 'axis';
  if (t.includes('kotak mahindra') || t.includes('kotak bank')) return 'kotak';
  return 'generic';
};

const cleanNarr = (s) => s.replace(/\s+/g, ' ').replace(/^\W+|\W+$/g, '').trim().slice(0, 160);

const guessType = (n) => {
  const u = n.toUpperCase();
  if (/BY |CREDIT|NEFT CR|DEPOSIT|SALARY|FT-|INWARD/.test(u)) return 'CR';
  if (/TO |DEBIT|NEFT DR|WITHDRAWAL|PAYMENT|OUTWARD/.test(u)) return 'DR';
  return null;
};

// Unglue decimal amounts that got joined together without spaces (e.g. "1.001.00" -> "1.00 1.00")
const unglueDecimals = (str) => {
  return str.replace(/(\.\d{2})(\d)/g, '$1 $2');
};

// ─── HDFC parser — splits raw text on DD/MM/YY dates ──────────────────────────
const parseHDFC = (rawText) => {
  // CRITICAL: We restrict the 4-digit year pattern to start with '20' (e.g. 2026).
  // This prevents 2-digit years from devouring the starting digits of adjacent amounts
  // (e.g., "05/03/26" followed by "20.00" was matched as "05/03/2620" with a year of 2620!).
  const DATE_PAT = /(\d{2}\/\d{2}\/20\d{2}|\d{2}\/\d{2}\/\d{2})/g;
  const tokens = rawText.split(DATE_PAT);

  const transactions = [];
  let prevBalance = null;
  let lastMatchEnd = 0; // Index in tokens where the previous matched transaction's amounts section ended

  let i = 1;
  while (i + 2 < tokens.length) {
    const txDateStr = tokens[i];
    const valDateStr = tokens[i + 2];

    const txDate = parseHDFCDate(txDateStr);
    const valDate = parseHDFCDate(valDateStr);

    if (txDate && valDate) {
      const diffDays = Math.abs(txDate - valDate) / 86400000;

      // HDFC transaction dates and value dates are always within 10 days of each other
      if (diffDays <= 10) {
        const amtSection = tokens[i + 3] || '';
        const cleanedAmtSection = unglueDecimals(amtSection);

        // Extract decimal amounts
        const numRe = /\b(\d{1,3}(?:,\d{2,3})*\.\d{2})\b/g;
        const nums = [];
        let nm;
        while ((nm = numRe.exec(cleanedAmtSection)) !== null) {
          const v = cleanNum(nm[1]);
          if (v > 0) nums.push(v);
        }

        // A valid HDFC transaction must have at least one decimal amount (the transaction amount)
        if (nums.length >= 1) {
          // BINGO! Valid transaction found.
          
          // Narration spans all tokens from the end of the previous match to the current transaction date
          const narrTokens = [];
          for (let k = lastMatchEnd + 1; k <= i + 1; k++) {
            const tok = tokens[k].trim();
            // Skip dates and empty tokens to get pure narration
            if (tok && !parseHDFCDate(tok)) {
              narrTokens.push(tok);
            }
          }
          const fullNarration = cleanNarr(narrTokens.join(' '));

          // CRITICAL: We extract numbers from the LEFT (first two) to isolate the actual
          // transaction amount and closing balance from any subsequent summary totals or footer text.
          const txnAmt = nums[0];
          const closingBalance = nums.length >= 2 ? nums[1] : txnAmt;

          // Balance delta is the absolute source of truth for DR/CR
          let type = null;
          if (prevBalance !== null) {
            type = closingBalance > prevBalance ? 'CR' : 'DR';
          }
          if (!type) type = guessType(fullNarration) || 'CR';

          transactions.push({
            date: toISO(txDate),
            type,
            name: fullNarration || 'Transaction',
            debitAmount:  type === 'DR' ? txnAmt : 0,
            creditAmount: type === 'CR' ? txnAmt : 0,
            closingBalance,
            remarks: '',
          });

          prevBalance = closingBalance;
          lastMatchEnd = i + 3; // Update pointer to current transaction's amounts section
          i = i + 4; // Advance scanner past this transaction block
          continue;
        }
      }
    }

    // Slide the window by 1 to search for the next transaction date
    i++;
  }

  return transactions;
};

// ─── Generic parser (SBI, ICICI, Axis, Kotak) ────────────────────────────────
const parseGeneric = (rawText) => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const transactions = [];
  let prevBalance = null;

  const DATE_PATS = [
    /^(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
    /^(\d{2}[\/\-]\d{2}[\/\-]\d{2})\b/,
    /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i,
  ];

  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const parseDate = (s) => {
    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));
    m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m) return new Date(Date.UTC(2000+ +m[3], +m[2]-1, +m[1]));
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/i);
    if (m) { const mon = months[m[2].toLowerCase()]; if (mon!==undefined) return new Date(Date.UTC(+m[3],mon,+m[1])); }
    return null;
  };

  for (const line of lines) {
    let dateStr = null, dateEnd = 0;
    for (const pat of DATE_PATS) {
      const m = line.match(pat);
      if (m) { dateStr = m[1]; dateEnd = m[0].length; break; }
    }
    if (!dateStr) continue;
    const date = toISO(parseDate(dateStr));
    if (!date) continue;

    const rest = line.slice(dateEnd).trim();
    const cleanedRest = unglueDecimals(rest);

    const numRe = /\b(\d{1,3}(?:,\d{2,3})*\.\d{2})\b/g;
    const nums = []; let nm;
    while ((nm = numRe.exec(cleanedRest)) !== null) { const v=cleanNum(nm[1]); if(v>0) nums.push(v); }
    if (nums.length < 2) continue;

    const closingBalance = nums[nums.length - 1];
    const txnAmt = nums[nums.length - 2];
    const firstDigit = cleanedRest.search(/\d/);
    const narration = firstDigit > 0 ? cleanedRest.slice(0, firstDigit).trim() : cleanedRest;

    let type = null;
    if (/\bDR\b/.test(cleanedRest) && !/\bCR\b/.test(cleanedRest)) type = 'DR';
    else if (/\bCR\b/.test(cleanedRest) && !/\bDR\b/.test(cleanedRest)) type = 'CR';
    if (!type && /withdrawal|debit/i.test(cleanedRest))   type = 'DR';
    if (!type && /deposit|credit/i.test(cleanedRest))     type = 'CR';
    if (!type && /^TO\s/i.test(narration))         type = 'DR';
    if (!type && /^BY\s/i.test(narration))         type = 'CR';
    if (!type) type = guessType(narration);
    if (!type && prevBalance !== null) type = closingBalance > prevBalance ? 'CR' : 'DR';
    if (!type) type = 'CR';

    transactions.push({
      date, type,
      name: cleanNarr(narration) || 'Transaction',
      debitAmount:  type === 'DR' ? txnAmt : 0,
      creditAmount: type === 'CR' ? txnAmt : 0,
      closingBalance, remarks: '',
    });
    prevBalance = closingBalance;
  }
  return transactions;
};

// ─── Controller ───────────────────────────────────────────────────────────────
export const parsePDF = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No PDF uploaded.' });

    const data = await pdfParse(req.file.buffer);
    const rawText = data.text;

    if (!rawText || rawText.trim().length < 20) {
      return res.status(422).json({ success: false, error: 'PDF is image-based (scanned). Only text-based PDFs are supported.' });
    }

    const bank = detectBank(rawText);
    const transactions = bank === 'hdfc' ? parseHDFC(rawText) : parseGeneric(rawText);

    if (transactions.length === 0) {
      return res.status(422).json({
        success: false,
        bank,
        error: 'No transactions found.',
        rawTextPreview: rawText.slice(0, 800),
      });
    }

    res.status(200).json({ success: true, bank, count: transactions.length, data: transactions });
  } catch (err) {
    console.error('[PDF Parse Error]', err.message);
    res.status(500).json({ success: false, error: 'Failed to parse PDF.', message: err.message });
  }
};
