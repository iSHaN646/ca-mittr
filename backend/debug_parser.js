import fs from 'fs';
import pdfParse from 'pdf-parse';

const parseHDFCDate = (s) => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
};

const cleanNum = (s) => parseFloat(String(s).replace(/,/g, '')) || 0;

const unglueDecimals = (str) => {
  return str.replace(/(\.\d{2})(\d)/g, '$1 $2');
};

const run = async () => {
  const pdfBuffer = fs.readFileSync('C:\\Users\\Apptunix\\Downloads\\Acct Statement.pdf');
  const data = await pdfParse(pdfBuffer);
  const rawText = data.text;

  // Pattern restricting 4-digit year to start with 20 (standard 21st century HDFC statement years)
  // to avoid consuming subsequent digits from the amounts column (e.g. 05/03/26 followed by 20.00 was split as 05/03/2620).
  const DATE_PAT = /(\d{2}\/\d{2}\/20\d{2}|\d{2}\/\d{2}\/\d{2})/g;
  const tokens = rawText.split(DATE_PAT);

  let out = '';
  tokens.forEach((tok, idx) => {
    out += `Token [${idx}]: "${tok.replace(/\n/g, '\\n')}"\n`;
  });
  fs.writeFileSync('debug_tokens.txt', out);

  const transactions = [];
  let prevBalance = null;
  let lastMatchEnd = 0;

  let i = 1;
  const trace = [];
  while (i + 2 < tokens.length) {
    const txDateStr = tokens[i];
    const valDateStr = tokens[i + 2];

    const txDate = parseHDFCDate(txDateStr);
    const valDate = parseHDFCDate(valDateStr);

    trace.push(`i=${i}: txDateStr="${txDateStr}" valDateStr="${valDateStr}" parsedTx=${txDate ? txDate.toISOString().split('T')[0] : 'null'} parsedVal=${valDate ? valDate.toISOString().split('T')[0] : 'null'}`);

    if (txDate && valDate) {
      const diffDays = Math.abs(txDate - valDate) / 86400000;
      if (diffDays <= 10) {
        const amtSection = tokens[i + 3] || '';
        const cleanedAmtSection = unglueDecimals(amtSection);

        const numRe = /\b(\d{1,3}(?:,\d{2,3})*\.\d{2})\b/g;
        const nums = [];
        let nm;
        while ((nm = numRe.exec(cleanedAmtSection)) !== null) {
          const v = cleanNum(nm[1]);
          if (v > 0) nums.push(v);
        }

        trace.push(`  diffDays=${diffDays} amtSection="${amtSection.replace(/\n/g, '\\n')}" nums=${JSON.stringify(nums)}`);

        if (nums.length >= 1) {
          const narrTokens = [];
          for (let k = lastMatchEnd + 1; k <= i + 1; k++) {
            const tok = tokens[k].trim();
            if (tok && !parseHDFCDate(tok)) {
              narrTokens.push(tok);
            }
          }
          const fullNarration = narrTokens.join(' ').replace(/\s+/g, ' ').trim().slice(0, 160);

          const closingBalance = nums[nums.length - 1];
          const txnAmt = nums.length >= 2 ? nums[nums.length - 2] : closingBalance;

          transactions.push({
            idx: transactions.length + 1,
            date: txDate.toISOString().split('T')[0],
            valDate: valDate.toISOString().split('T')[0],
            narration: fullNarration,
            txnAmt,
            closingBalance
          });

          prevBalance = closingBalance;
          lastMatchEnd = i + 3;
          trace.push(`  SUCCESS! Added transaction. Advanced i to ${i + 4}`);
          i = i + 4;
          continue;
        } else {
          trace.push(`  FAILED: No valid decimal numbers in amtSection.`);
        }
      } else {
        trace.push(`  FAILED: diffDays=${diffDays} > 10.`);
      }
    } else {
      trace.push(`  FAILED: One or both dates are invalid.`);
    }
    i++;
  }

  fs.writeFileSync('debug_trace.txt', trace.join('\n'));
  fs.writeFileSync('debug_transactions.json', JSON.stringify(transactions, null, 2));
  console.log(`Saved debug_trace.txt and debug_transactions.json. Total parsed: ${transactions.length}`);
};

run().catch(console.error);
