import { getRequestGateway } from '../../lib/sheets';
import { loadCities, TRANSPORTATION, HEBREW_LEVEL, SCHEDULE, GENDER } from '@scourage/worklog-core';
import { RegisterForm } from './register-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const gw = getRequestGateway();
  const cities = await loadCities(gw);
  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Register</h1>
        <a href="/login" className="text-sm text-gray-500 underline">Already have an account? Log in</a>
      </div>
      <RegisterForm
        cities={cities}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, schedule: SCHEDULE, gender: GENDER }}
      />
    </main>
  );
}
