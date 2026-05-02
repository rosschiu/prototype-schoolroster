import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://nexus:nexus@127.0.0.1:5432/nexus2';
const schema = process.env.DATABASE_SCHEMA ?? 'schoolroster_val18';
const apiPort = Number(process.env.API_PORT ?? 33101);
const baseUrl = `http://127.0.0.1:${apiPort}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

function startApi(logLabel) {
  const child = spawn('npm', ['run', 'dev', '--workspace', '@prototype-schoolroster/api'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SCHEMA: schema,
      API_PORT: String(apiPort),
      API_HOST: '127.0.0.1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${logLabel}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${logLabel}] ${chunk}`));
  return child;
}

async function stopApi(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]);
  if (!child.killed) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function waitForApi() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`);
      if (response.ok) return;
    } catch {
      // retry until the API listener is up
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Roster API did not become ready at ${baseUrl}`);
}

let cookie = '';
async function req(path, options = {}) {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(cookie ? { cookie } : {}),
    ...(options.headers ?? {})
  };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  if (setCookie.length > 0) cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function signIn(role) {
  const body = await req('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({
      email: role === 'teacher' ? 'teacher@schoolroster.test' : 'admin@schoolroster.test',
      password: 'Password123!',
      requestedRole: role
    })
  });
  return body.session.csrfToken;
}

async function smokeBeforeRestart() {
  cookie = '';
  const csrf = await signIn('school_admin');
  const created = await req('/api/roster/timetables', {
    method: 'POST',
    headers: { 'x-schoolroster-csrf': csrf },
    body: JSON.stringify({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      name: `VAL-018 pglocal smoke ${Date.now()}`
    })
  });
  const period = created.periods[0];
  await req(`/api/roster/timetables/${created.timetable.id}/confirm-structure`, {
    method: 'POST',
    headers: { 'x-schoolroster-csrf': csrf }
  });
  const session = await req('/api/roster/sessions', {
    method: 'POST',
    headers: { 'x-schoolroster-csrf': csrf },
    body: JSON.stringify({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: created.timetable.id,
      timetablePeriodId: period.id,
      subjectId: 'subject-math',
      gradeLevelId: 'p4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo',
      equipmentResourceIds: ['projector-1']
    })
  });
  await req(`/api/roster/timetables/${created.timetable.id}/publish`, {
    method: 'POST',
    headers: { 'x-schoolroster-csrf': csrf }
  });
  const teacherCsrf = await signIn('teacher');
  const leave = await req('/api/roster/leave', {
    method: 'POST',
    headers: { 'x-schoolroster-csrf': teacherCsrf },
    body: JSON.stringify({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      coverageRequired: true
    })
  });
  return {
    timetableId: created.timetable.id,
    sessionId: session.session.id,
    leaveRequestId: leave.leaveRequest.id,
    impactCountBeforeRestart: leave.impacts.length
  };
}

async function smokeAfterRestart(ids) {
  cookie = '';
  await signIn('school_admin');
  const detail = await req(`/api/roster/timetables/${ids.timetableId}`);
  const leaves = await req('/api/roster/leave?schoolId=school-steck-demo');
  const impacts = await req(`/api/roster/leave/${ids.leaveRequestId}/impacts`);
  return {
    ...ids,
    database: 'pglocal postgres:18-alpine on 127.0.0.1:5432/nexus2',
    schema,
    timetableStatusAfterRestart: detail.timetable.status,
    sessionCountAfterRestart: detail.sessions.length,
    matchingSessionStatusAfterRestart: detail.sessions.find((session) => session.id === ids.sessionId)?.status,
    leaveFoundAfterRestart: leaves.leaveRequests.some((leave) => leave.id === ids.leaveRequestId),
    impactCountAfterRestart: impacts.impacts.length
  };
}

async function main() {
  console.log(`Using PostgreSQL 18 pglocal: ${databaseUrl.replace(/:[^:@/]+@/, ':***@')} schema=${schema}`);
  await run('npm', ['test', '--workspace', '@prototype-schoolroster/api'], {
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  let api = startApi('api-1');
  await waitForApi();
  const ids = await smokeBeforeRestart();
  await stopApi(api);

  api = startApi('api-2');
  await waitForApi();
  const evidence = await smokeAfterRestart(ids);
  await stopApi(api);

  if (evidence.timetableStatusAfterRestart !== 'published' || evidence.matchingSessionStatusAfterRestart !== 'published' || !evidence.leaveFoundAfterRestart || evidence.impactCountAfterRestart !== evidence.impactCountBeforeRestart) {
    throw new Error(`Persistence smoke failed: ${JSON.stringify(evidence)}`);
  }

  await writeFile('output/val-018-pglocal-evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log('Wrote output/val-018-pglocal-evidence.json');
}

await main();
