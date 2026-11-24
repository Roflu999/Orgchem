"""Exercise the job-owned subprocess without requiring the optional Java installation."""
import asyncio
from contextlib import contextmanager
import os
import sys
import unittest
from unittest.mock import patch

from backend import opsin
from backend.jobs import JobManager


@contextmanager
def cli(code):
    # Use a real child/pipe so timeout and cancellation assertions check reaping,
    # not merely cancellation of a mocked coroutine. Capture the actual CLI argv.
    create = asyncio.create_subprocess_exec
    processes = []

    async def launch(*argv, **kwargs):
        process = await create(sys.executable, '-I', '-c', code, **kwargs)
        processes.append((process, argv))
        return process

    with patch.object(opsin, 'runtime', return_value=('java', 'local.jar')), \
            patch.object(asyncio, 'create_subprocess_exec', side_effect=launch):
        yield processes


class OpsinTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_and_invalid_input(self):
        with patch.object(opsin, 'runtime', return_value=None) as runtime:
            for text in (None, [], '', ' ', 'x' * 257, '\nethanol', 'ethanol\r\nmethane',
                         'a\0b', 'a\tb', 'a' + chr(0x2028) + 'b', 'a\ud800b'):
                with self.subTest(text=text), self.assertRaisesRegex(ValueError, 'single line'):
                    await opsin.resolve(text)
            runtime.assert_not_called()
            self.assertFalse(await opsin.available())
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                await opsin.resolve('ethanol')

    async def test_stdin_is_data_and_jvm_options_are_bounded(self):
        text = '-osmi (a); $xyz'
        with patch.dict(os.environ, {'JAVA_TOOL_OPTIONS': 'not for the CLI'}), cli(
                f'import os,sys; assert sys.stdin.read() == {text + chr(10)!r}; '
                'assert "JAVA_TOOL_OPTIONS" not in os.environ; print("C/C=C/C")') as processes:
            self.assertEqual(await opsin.resolve(text), 'C/C=C/C')
            process, argv = processes[0]
            self.assertEqual(process.returncode, 0)
            self.assertNotIn(text, argv)
            self.assertIn('-Xmx128m', argv)
            self.assertEqual(argv[-3:], ('-jar', 'local.jar', '-osmi'))

    async def test_cli_failures_never_echo_name_or_stderr(self):
        for code in ('print("")', 'print("CCO\\nC")', 'print("CCO name")',
                     'import sys; sys.stdout.buffer.write(b"\\xff")',
                     'import sys; print("private-text",file=sys.stderr); sys.exit(1)',
                     'print("C" * 1000000)'):
            with self.subTest(code=code), cli(code) as processes:
                with self.assertRaises(ValueError) as caught:
                    await asyncio.wait_for(opsin.resolve('private-text'), 3)
                self.assertNotIn('private-text', str(caught.exception))
                self.assertIsNotNone(processes[0][0].returncode)

    async def test_job_cancel_and_timeout_reap_jvm(self):
        for action in ('cancel', 'timeout'):
            manager = JobManager(workers=1, timeout=.25 if action == 'timeout' else 5)
            try:
                with self.subTest(action=action), cli('import time; time.sleep(10)') as processes:
                    job = manager.submit('parse', {'format': 'name', 'text': 'ethanol'})
                    async with asyncio.timeout(2):
                        while not processes:
                            await asyncio.sleep(.005)
                    if action == 'cancel':
                        manager.cancel(job.id)
                    await asyncio.wait_for(job.task, 3)
                    self.assertEqual(job.status, 'cancelled' if action == 'cancel' else 'timed_out')
                    self.assertIsNotNone(processes[0][0].returncode)
                    self.assertIsNone(job.result)
                    self.assertEqual(manager.semaphore._value, 1)
            finally:
                await manager.close()
