import asyncio
from concurrent.futures import ThreadPoolExecutor
import multiprocessing as mp
from multiprocessing.reduction import ForkingPickler
import struct
import threading
import time
import unittest
from unittest.mock import patch
from backend.jobs import Job, JobManager


def blocking_worker(connection, operation, payload, seconds, memory_mb):
    """A controlled native-call stand-in to prove process deadlines, not a network target."""
    time.sleep(3)
    connection.send({'result': {'unexpected': True}})
    connection.close()


def partial_frame_worker(connection, operation, payload, seconds, memory_mb):
    """Pause between a valid multiprocessing message header and its body."""
    response = ForkingPickler.dumps({'result': {'message': 'x' * 65536}, 'bytes': 65550})
    try:
        connection._send(struct.pack('!i', len(response)))
        payload['header_sent'].send_bytes(b'header')
        # Also bound the child if a failing test never releases the gate.
        if payload['release'].poll(5):
            payload['release'].recv_bytes()
        connection._send(response)
    finally:
        connection.close()


class _ProcessGate:
    """A pipe gate remains safe to release after its waiting child is terminated."""
    def __init__(self, context):
        self.receiver, self.sender = context.Pipe(duplex=False)
        self.header_receiver, self.header_sender = context.Pipe(duplex=False)
        self.state = threading.Event()
        self.lock = threading.Lock()

    def set(self):
        with self.lock:
            if not self.state.is_set():
                self.sender.send_bytes(b'release')
                self.state.set()

    def is_set(self):
        return self.state.is_set()

    def wait(self, timeout=None):
        return self.state.wait(timeout)

    def close(self):
        self.receiver.close()
        self.sender.close()
        self.header_receiver.close()
        self.header_sender.close()


class _Watchdog:
    """An out-of-loop fallback keeps regressions bounded even if asyncio blocks."""
    def __init__(self, entered, release, seconds=1):
        self.entered = entered
        self.release = release
        self.seconds = seconds
        self.expired = False
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        if self.entered.wait(5) and not self.release.wait(self.seconds):
            self.expired = True
            self.release.set()

    def close(self):
        self.release.set()
        self.entered.set()
        self.thread.join(1)


class _ObservedReceiver:
    def __init__(self, connection):
        self.connection = connection
        self.entered = threading.Event()
        self.active = threading.Event()
        self.finished = threading.Event()

    def __getattr__(self, name):
        return getattr(self.connection, name)

    def recv(self):
        self.active.set()
        try:
            # Arm the partial-frame watchdog only when bytes (or EOF) arrive.
            # Child startup can be slow under concurrent browser/WebGL load;
            # counting that delay falsely reports a blocked asyncio loop.
            self.connection.poll(None)
            self.entered.set()
            return self.connection.recv()
        finally:
            self.active.clear()
            self.finished.set()

    def close(self):
        if self.active.is_set():
            raise AssertionError('Receiver closed while a receive thread is using it')
        self.connection.close()


class _ObservedContext:
    def __init__(self, context):
        self.context = context
        self.receiver = None
        self.sender = None
        self.receivers = []

    def Pipe(self, **kwargs):
        receiver, self.sender = self.context.Pipe(**kwargs)
        self.receiver = _ObservedReceiver(receiver)
        self.receivers.append(self.receiver)
        return self.receiver, self.sender

    def Process(self, **kwargs):
        return self.context.Process(**kwargs)


class _ControlledProcess:
    """Exercise startup ownership without importing chemistry or creating a child."""
    def __init__(self, sender, gate=None, failure=None, previous=None):
        self.sender = sender
        self.gate = gate
        self.failure = failure
        self.previous = previous
        self.entered = threading.Event()
        self.finished = threading.Event()
        self.closed = False
        self.alive = False
        self.pid = None

    def start(self):
        self.entered.set()
        try:
            if self.previous is not None and not self.previous.closed:
                raise AssertionError('Next job started before the previous process was closed')
            if self.gate is not None and not self.gate.wait(3):
                raise RuntimeError('Startup test gate was not released')
            if self.failure:
                raise OSError(self.failure)
            self.pid = 99999999
            self.alive = True
            self.sender.send({'result': {'ok': True}, 'bytes': 12})
        finally:
            self.finished.set()

    def is_alive(self):
        if not self.finished.is_set():
            raise AssertionError('Process inspected while start is still in progress')
        return self.alive

    def terminate(self):
        self.alive = False

    def kill(self):
        self.alive = False

    def join(self, timeout=None):
        if not self.finished.is_set():
            raise AssertionError('Process joined before startup finished')
        if self.pid is None:
            raise AssertionError('can only join a started process')

    def close(self):
        if not self.finished.is_set() or self.alive:
            raise AssertionError('Process closed before startup/termination finished')
        self.closed = True


class _ControlledContext(_ObservedContext):
    def __init__(self, gate=None, failure=None):
        super().__init__(mp.get_context())
        self.gate = gate
        self.failure = failure
        self.processes = []
        self.pipes = []
        self.entered = threading.Event()

    def Pipe(self, **kwargs):
        pair = super().Pipe(**kwargs)
        self.pipes.append(pair)
        return pair

    def Process(self, **kwargs):
        previous = self.processes[-1] if self.processes else None
        process = _ControlledProcess(
            kwargs['args'][0],
            gate=self.gate if not self.processes else None,
            failure=self.failure if not self.processes else None,
            previous=previous,
        )
        if not self.processes:
            process.entered = self.entered
        self.processes.append(process)
        return process


class JobTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_terminates_process_before_releasing_slot(self):
        manager=JobManager(workers=1,capacity=1,timeout=.08)
        with patch('backend.jobs._worker',blocking_worker):
            job=manager.submit('parse',{'text':'CCO'})
            await asyncio.wait_for(job.task,3)
        self.assertEqual(job.status,'timed_out')
        self.assertIsNone(job.process)
        self.assertEqual(manager.semaphore._value,1)
        await manager.close()

    async def test_queue_capacity_and_result_memory_bound(self):
        manager=JobManager(workers=1,capacity=1)
        with patch('backend.jobs._worker',blocking_worker):
            job=manager.submit('parse',{'text':'CCO'})
            with self.assertRaises(OverflowError):manager.submit('parse',{'text':'CC'})
            manager.cancel(job.id)
            await manager.close()
        for i in range(6):
            item=Job(operation='parse',payload={},id=str(i),status='complete',finished=time.monotonic()+i,result_bytes=16*1024*1024)
            manager.jobs[item.id]=item
        manager.cleanup()
        self.assertLessEqual(sum(j.result_bytes for j in manager.jobs.values()),64*1024*1024)
        await manager.close()

    async def wait_event(self, event, timeout=4):
        self.assertTrue(await asyncio.wait_for(asyncio.to_thread(event.wait, timeout), timeout + 1))

    async def wait_headers(self, gate, count=1):
        for _ in range(count):
            while not gate.header_receiver.poll():
                await asyncio.sleep(.005)
            self.assertEqual(gate.header_receiver.recv_bytes(), b'header')

    async def test_startup_does_not_block_event_loop(self):
        gate = threading.Event()
        manager = JobManager(workers=1, timeout=5)
        context = manager.context = _ControlledContext(gate=gate)
        job = manager.submit('parse', {'text': 'CCO'})
        watchdog = _Watchdog(context.entered, gate)
        try:
            await self.wait_event(context.entered)
            await asyncio.sleep(.03)
            self.assertFalse(watchdog.expired, 'Process.start blocked the event loop')
            self.assertFalse(job.task.done())
            gate.set()
            await asyncio.wait_for(job.task, 3)
            self.assertEqual(job.status, 'complete', job.error)
            self.assertTrue(context.processes[0].closed)
            self.assertEqual(manager.semaphore._value, 1)
        finally:
            watchdog.close()
            await manager.close()

    async def test_cancel_during_startup_holds_slot_until_process_is_cleaned(self):
        gate = threading.Event()
        manager = JobManager(workers=1, capacity=2, timeout=5)
        context = manager.context = _ControlledContext(gate=gate)
        job = manager.submit('parse', {'text': 'CCO'})
        watchdog = _Watchdog(context.entered, gate)
        try:
            await self.wait_event(context.entered)
            self.assertFalse(watchdog.expired, 'Cancellation could not run during startup')
            manager.cancel(job.id)
            queued = manager.submit('parse', {'text': 'CC'})
            await asyncio.sleep(.02)
            # Interrupt cleanup itself, not just the initial cancellation delivery.
            job.task.cancel()
            await asyncio.sleep(.03)
            self.assertEqual(manager.semaphore._value, 0)
            self.assertEqual(queued.status, 'queued')
            self.assertFalse(job.task.done())
            self.assertFalse(context.processes[0].closed)
            self.assertEqual(len(context.processes), 1)
            manager.ttl = 0
            manager.cleanup()
            self.assertIs(manager.jobs.get(job.id), job, 'TTL pruning lost a job still cleaning up')
            gate.set()
            await asyncio.wait_for(asyncio.gather(job.task, queued.task), 3)
            self.assertEqual(job.status, 'cancelled')
            self.assertIsNone(job.process)
            self.assertEqual(queued.status, 'complete', queued.error)
            self.assertTrue(all(process.closed for process in context.processes))
            self.assertTrue(all(receiver.closed and sender.closed for receiver, sender in context.pipes))
            self.assertEqual(manager.semaphore._value, 1)
        finally:
            watchdog.close()
            await manager.close()

    async def test_cancel_waits_for_killed_process_before_reusing_slot(self):
        gate = threading.Event()
        manager = JobManager(workers=1, capacity=2, timeout=5)
        context = manager.context = _ControlledContext(gate=gate)
        killed = threading.Event()
        reaped = threading.Event()
        try:
            job = manager.submit('parse', {'text': 'CCO'})
            await self.wait_event(context.entered)
            process = context.processes[0]

            # Termination is asynchronous. Even a forced exit need not finish
            # within the grace period allowed for a cooperative terminate().
            def join(timeout=None):
                if killed.is_set() and timeout is None:
                    if not reaped.wait(3):
                        raise AssertionError('Test did not release the killed process')
                    process.alive = False

            with patch.object(process, 'terminate'), patch.object(process, 'kill', killed.set), \
                    patch.object(process, 'join', join):
                manager.cancel(job.id)
                following = manager.submit('parse', {'text': 'CC'})
                gate.set()
                await self.wait_event(killed)
                self.assertFalse(job.task.done())
                self.assertEqual(following.status, 'queued')
                reaped.set()
                await asyncio.wait_for(asyncio.gather(job.task, following.task), 3)
            self.assertTrue(process.closed)
            self.assertEqual(following.status, 'complete', following.error)
        finally:
            gate.set()
            reaped.set()
            await manager.close()

    async def test_failed_process_start_closes_unstarted_process_and_pipes(self):
        manager = JobManager(workers=1, timeout=3)
        context = manager.context = _ControlledContext(failure='controlled startup failure')
        try:
            job = manager.submit('parse', {'text': 'CCO'})
            await asyncio.wait_for(job.task, 3)
            self.assertEqual(job.status, 'failed')
            self.assertIn('controlled startup failure', job.error)
            self.assertTrue(context.processes[0].closed)
            self.assertIsNone(context.processes[0].pid)
            self.assertIsNone(job.process)
            self.assertTrue(context.receiver.closed)
            self.assertTrue(context.sender.closed)
            self.assertEqual(manager.semaphore._value, 1)
            following = manager.submit('parse', {'text': 'CC'})
            await asyncio.wait_for(following.task, 3)
            self.assertEqual(following.status, 'complete', following.error)
        finally:
            await manager.close()

    async def partial_receive(self, action):
        manager = JobManager(workers=1, timeout=2 if action == 'timeout' else 5)
        # Spawn avoids inheriting native-library state from other chemistry tests.
        context = manager.context = _ObservedContext(mp.get_context('spawn'))
        release = _ProcessGate(context.context)
        job = process = watchdog = None
        try:
            with patch('backend.jobs._worker', partial_frame_worker):
                job = manager.submit('parse', {'release': release.receiver, 'header_sent': release.header_sender})
                # Wait for Pipe creation before observing its receive operation.
                while context.receiver is None:
                    await asyncio.sleep(.005)
                receiver = context.receiver
                watchdog = _Watchdog(receiver.entered, release, seconds=3 if action == 'timeout' else 1)
                if action == 'timeout':
                    await asyncio.wait_for(job.task, 7)
                    self.assertTrue(receiver.entered.is_set(), 'Worker timed out before testing partial receive')
                    self.assertTrue(release.header_receiver.poll(), 'Child never emitted a frame header')
                    self.assertEqual(release.header_receiver.recv_bytes(), b'header')
                    self.assertEqual(job.status, 'timed_out', job.error)
                    self.assertFalse(watchdog.expired, 'Deadline waited for the response body')
                else:
                    await self.wait_event(receiver.entered)
                    await asyncio.wait_for(self.wait_headers(release), 2)
                    process = job.process
                    await asyncio.sleep(.03)
                    self.assertFalse(watchdog.expired, 'Partial-frame recv blocked the event loop')
                    self.assertFalse(job.task.done())
                    if action == 'cancel':
                        manager.cancel(job.id)
                        await asyncio.wait_for(job.task, 3)
                        self.assertEqual(job.status, 'cancelled')
                        self.assertFalse(release.is_set(), 'Cancellation required the child to finish sending')
                    else:
                        release.set()
                        await asyncio.wait_for(job.task, 3)
                        self.assertEqual(job.status, 'complete', job.error)
                        self.assertEqual(len(job.result['message']), 65536)
                self.assertTrue(receiver.finished.is_set())
                self.assertTrue(receiver.closed)
                self.assertTrue(context.sender.closed)
                self.assertIsNone(job.process)
                self.assertEqual(manager.semaphore._value, 1)
                if process is not None:
                    self.assertTrue(process._closed)
        finally:
            if watchdog:
                watchdog.close()
            release.set()
            await manager.close()
            release.close()

    async def test_partial_frame_receive_does_not_block_event_loop(self):
        await self.partial_receive('complete')

    async def test_deadline_is_enforced_during_partial_frame_receive(self):
        await self.partial_receive('timeout')

    async def test_cancel_during_partial_frame_receive_cleans_process_and_reader(self):
        await self.partial_receive('cancel')

    async def test_partial_receivers_cannot_starve_cleanup_with_small_default_executor(self):
        loop = asyncio.get_running_loop()
        previous_executor = loop._default_executor
        default_executor = ThreadPoolExecutor(max_workers=1)
        loop.set_default_executor(default_executor)
        default_gate = threading.Event()
        occupied = loop.run_in_executor(None, default_gate.wait, 8)
        manager = JobManager(workers=2, timeout=6)
        context = manager.context = _ObservedContext(mp.get_context('spawn'))
        release = _ProcessGate(context.context)
        try:
            with patch('backend.jobs._worker', partial_frame_worker):
                jobs = [manager.submit('parse', {'release': release.receiver, 'header_sent': release.header_sender}) for _ in range(2)]
                async def both_receivers_started():
                    while len(context.receivers) != 2 or not all(receiver.entered.is_set() for receiver in context.receivers):
                        await asyncio.sleep(.01)
                # Do not use to_thread here: the shared executor is deliberately full.
                await asyncio.wait_for(both_receivers_started(), 4)
                await asyncio.wait_for(self.wait_headers(release, count=2), 2)
                for job in jobs:
                    manager.cancel(job.id)
                await asyncio.wait_for(asyncio.gather(*(job.task for job in jobs)), 2)
                self.assertFalse(default_gate.is_set())
                self.assertFalse(release.is_set())
                self.assertEqual([job.status for job in jobs], ['cancelled', 'cancelled'])
                self.assertTrue(all(job.process is None for job in jobs))
                self.assertTrue(all(receiver.finished.is_set() and receiver.closed for receiver in context.receivers))
                self.assertEqual(manager.semaphore._value, 2)
        finally:
            release.set()
            default_gate.set()
            await occupied
            await manager.close()
            release.close()
            # IsolatedAsyncioTestCase owns the loop; restore any preexisting pool.
            if previous_executor is not None:
                loop.set_default_executor(previous_executor)
            else:
                loop._default_executor = None
            default_executor.shutdown(wait=True)


if __name__=='__main__':unittest.main()
