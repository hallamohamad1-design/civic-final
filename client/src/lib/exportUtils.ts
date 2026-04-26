import * as XLSX from "xlsx";

export function exportToExcel(data: any[], filename: string) {
  if (!data || data.length === 0) return;

  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Create worksheet from data array
  const ws = XLSX.utils.json_to_sheet(data);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  // Generate an Excel file
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
