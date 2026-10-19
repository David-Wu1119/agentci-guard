export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell !== "" || closed) {
        throw new Error("Invalid CSV quote inside an unquoted field.");
      }
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (
      character === "\n" ||
      (character === "\r" && text[index + 1] === "\n")
    ) {
      if (character === "\r") index++;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) {
        throw new Error("Invalid CSV content after a closing quote.");
      }
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field.");
  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

export function csvObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const duplicate = header.find(
    (name, index) => header.indexOf(name) !== index,
  );
  if (duplicate !== undefined)
    throw new Error(`Duplicate CSV header: ${duplicate}`);
  return rows.map((row, index) => {
    if (row.length !== header.length) {
      throw new Error(
        `CSV row ${index + 2} has ${row.length} cells; expected ${header.length}.`,
      );
    }
    return Object.fromEntries(
      header.map((name, column) => [name, row[column]]),
    );
  });
}

export function renderCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
