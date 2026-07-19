import { type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';

/**
 * One-time, idempotent repair: rewrites stored `employee_phone` values in the
 * Attendance and ShiftAssignments tabs to their normalized `972…` form so that
 * report/payroll joins and filters key cleanly. Safe to run repeatedly.
 */
export async function repairAttendancePhones(
  gateway: SheetsGateway,
): Promise<{ attendanceFixed: number; assignmentsFixed: number }> {
  const fixTab = async (tab: string): Promise<number> => {
    const rows = await gateway.readTab(tab);
    if (rows.length < 2) return 0;
    const header = rows[0].map((h) => h.trim());
    const idx = header.indexOf('employee_phone');
    if (idx < 0) return 0;
    let fixed = 0;
    for (let i = 1; i < rows.length; i++) {
      const raw = (rows[i][idx] ?? '').trim();
      if (!raw) continue;
      const norm = normalizePhone(raw);
      if (norm === raw) continue;
      const newRow = [...rows[i]];
      newRow[idx] = norm;
      await gateway.updateRow(tab, i + 1, newRow); // 1-based
      fixed++;
    }
    return fixed;
  };
  const attendanceFixed = await fixTab('Attendance');
  const assignmentsFixed = await fixTab('ShiftAssignments');
  return { attendanceFixed, assignmentsFixed };
}
