"""Bounded, cancellable per-job processes. Structures are kept in memory temporarily.

A native RDKit call cannot reliably be stopped by cancelling an asyncio Task.
Each job therefore owns a process that can be terminated on timeout/cancellation.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import multiprocessing as mp
import os
import time
import uuid
from typing import Any

from . import opsin

OPERATIONS = {"parse", "enumerate", "conformers", "projection", "torsion", "export", "relationship", "name"}
TERMINAL = {"complete", "failed", "cancelled", "timed_out"}


def _worker(connection, operation, payload, seconds, memory_mb, *, opsin_name=None):
    try:
        os.environ["OMP_NUM_THREADS"] = "1"
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (int(seconds) + 1, int(seconds) + 2))
        except (ImportError, ValueError, OSError):
            pass
        # Native scientific libraries reserve address ranges at import time.
        # A fixed pre-import AS cap can deadlock the dynamic loader depending on
        # ASLR. Load trusted code first, then cap additional calculation space;
        # the parent separately enforces resident memory throughout the job.
        from .chemistry_service import dispatch
        if memory_mb:
            try:
                with open('/proc/self/statm') as stats:
                    baseline = int(stats.read().split()[0]) * os.sysconf('SC_PAGE_SIZE')
                limit = baseline + int(memory_mb) * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
            except (NameError, ImportError, ValueError, OSError):
                pass
        if operation == 'name':
            from .names import lookup
            result = lookup(payload)
        elif operation == 'export' and payload.get('molecules'):
            from .exports import export_many
            result = export_many(payload)
        else:
            result = dispatch(operation, payload)
            if opsin_name is not None:
                # OPSIN interpreted this input label; it did not generate a preferred name.
                result['molecules'][0].update(name=opsin_name, knownName=True, nameSource='OPSIN')
        import json
        result_size = len(json.dumps(result, allow_nan=False))
        if result_size > 16 * 1024 * 1024:
            raise ValueError('The result exceeds the response budget. Request fewer records or conformers.')
        connection.send({"result": result, "bytes": result_size})
    except BaseException as error:
        # Return a bounded explanation, never a traceback or echoed molecule payload.
        connection.send({"error": str(error)[:1000] or type(error).__name__})
    finally:
        connection.close()


@dataclass
class Job:
    operation: str
    payload: dict[str, Any]
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created: float = field(default_factory=time.monotonic)
    started: float | None = None
    finished: float | None = None
    status: str = "queued"
    result: dict | None = None
    error: str | None = None
    task: asyncio.Task | None = None
    process: Any = None
    result_bytes: int = 0

    def public(self):
        return {"id": self.id, "operation": self.operation, "status": self.status,
                "result": self.result, "error": self.error,
                "elapsed": round((self.finished or time.monotonic()) - self.created, 3)}


class JobManager:
    def __init__(self, workers=2, capacity=8, timeout=45, ttl=600, memory_mb=2048):
        self.workers = workers
        self.capacity = capacity
        self.timeout = timeout
        self.ttl = ttl
        self.memory_mb = memory_mb
        self.jobs: dict[str, Job] = {}
        self.semaphore = asyncio.Semaphore(workers)
        # At most one blocking startup/receive per job, plus room for stopping
        # every worker. Partial pipe frames must never starve cleanup threads
        # or the application's shared default executor on low-core hosts.
        self.executor = ThreadPoolExecutor(max_workers=2 * workers, thread_name_prefix='chemistry-io')
        if 'forkserver' in mp.get_all_start_methods():
            # Initialize native RDKit/NumPy once in a clean, single-threaded
            # supervisor instead of racing dynamic imports in every web job.
            os.environ['OMP_NUM_THREADS'] = '1'
            os.environ['OPENBLAS_NUM_THREADS'] = '1'
            mp.set_forkserver_preload(['backend.chemistry_service'])
            self.context = mp.get_context('forkserver')
        else:
            self.context = mp.get_context('spawn')

    def cleanup(self):
        now = time.monotonic()
        for key, job in list(self.jobs.items()):
            if job.finished and now - job.finished > self.ttl and (job.task is None or job.task.done()):
                del self.jobs[key]
        # Terminal status can precede process cleanup. Keep those jobs tracked
        # until their lifecycle task ends so shutdown can still join them.
        completed = [j for j in self.jobs.values() if j.status in TERMINAL and (j.task is None or j.task.done())]
        oldest = sorted(completed, key=lambda j: j.finished or 0)
        retained = sum(j.result_bytes for j in oldest)
        while oldest and (len(oldest) > 64 or retained > 64 * 1024 * 1024):
            expired = oldest.pop(0)
            retained -= expired.result_bytes
            self.jobs.pop(expired.id, None)

    def submit(self, operation, payload):
        self.cleanup()
        if operation not in OPERATIONS:
            raise ValueError("Unsupported chemistry operation.")
        if sum(j.status not in TERMINAL for j in self.jobs.values()) >= self.capacity:
            raise OverflowError("The chemistry queue is full. Try again after a calculation finishes.")
        job = Job(operation=operation, payload=payload)
        self.jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job))
        return job

    def get(self, key):
        self.cleanup()
        return self.jobs.get(key)

    def cancel(self, key):
        job = self.get(key)
        if job and job.status not in TERMINAL:
            job.status = "cancelled"
            job.finished = time.monotonic()
            job.payload = {}
            if job.task:
                job.task.cancel()
        return job

    @staticmethod
    def _stop(process):
        if process is None:
            return
        # A failed start may leave a Process object without a child/PID.
        if process.pid is not None:
            if process.is_alive():
                process.terminate()
            process.join(.4)
            if process.is_alive():
                process.kill()
                process.join(.4)
        process.close()

    async def _finish_process(self, job, startup, receive, receiver, sender):
        # Cancelling an executor future does not stop its thread. Wait for startup to
        # finish before touching the Process or releasing its worker slot.
        if startup:
            try:
                await startup
            except Exception:
                pass  # _run already reports startup failures.
        if sender:
            sender.close()
        try:
            if job.process:
                await asyncio.get_running_loop().run_in_executor(self.executor, self._stop, job.process)
        finally:
            # Terminating the writer (and closing our copy above) unblocks a
            # partial-frame recv with EOF. Never close a pipe still in use.
            if receive:
                try:
                    await receive
                except Exception:
                    pass  # The job already reported a failed/aborted receive.
            if receiver:
                receiver.close()
            job.process = None

    async def _run(self, job):
        receiver = sender = startup = receive = None
        acquired = False
        try:
            await self.semaphore.acquire()
            acquired = True
            if job.status == "cancelled":
                return
            job.started = time.monotonic()
            job.status = "running"
            worker_options = {}
            if job.operation == 'parse' and str(job.payload.get('format', '')).lower() == 'name':
                # This stage consumes the same worker slot and wall-clock budget as
                # RDKit. Forward only validated OPSIN output, never caller flags.
                smiles = await opsin.resolve(job.payload.get('text'), timeout=self.timeout)
                worker_options['opsin_name'] = job.payload['text'].strip()
                job.payload = {'format': 'smiles', 'text': smiles}
            receiver, sender = self.context.Pipe(duplex=False)
            job.process = self.context.Process(target=_worker, args=(sender, job.operation, job.payload, self.timeout, self.memory_mb),
                                               kwargs=worker_options, daemon=True)
            # Forkserver/spawn serializes the payload and may cold-import
            # native libraries. Neither that work nor pipe receive/unpickling
            # belongs on the ASGI event loop.
            loop = asyncio.get_running_loop()
            startup = loop.run_in_executor(self.executor, job.process.start)
            remaining = self.timeout - (time.monotonic() - job.started)
            await asyncio.wait_for(asyncio.shield(startup), timeout=max(0, remaining))
            sender.close()
            job.payload = {}
            receive = loop.run_in_executor(self.executor, receiver.recv)
            while True:
                if receive.done():
                    try:
                        response = receive.result()
                    except EOFError:
                        response = {"error": "The chemistry worker exited without a result."}
                    job.result = response.get("result")
                    job.result_bytes = response.get('bytes', 0)
                    job.error = response.get("error")
                    job.status = "failed" if job.error else "complete"
                    break
                try:
                    with open('/proc/'+str(job.process.pid)+'/statm') as stats:
                        resident = int(stats.read().split()[1]) * os.sysconf('SC_PAGE_SIZE')
                    if self.memory_mb and resident > self.memory_mb * 1024 * 1024:
                        job.status = 'failed'
                        job.error = 'The chemistry worker exceeded its resident-memory budget. Request fewer structures or conformers.'
                        break
                except (OSError, ValueError, IndexError):
                    pass
                if time.monotonic() - job.started > self.timeout:
                    job.status = "timed_out"
                    job.error = "The chemistry calculation exceeded its time budget. No incomplete result is labeled complete. Try fewer stereoisomers or conformers."
                    break
                await asyncio.wait({receive}, timeout=min(.05, max(0, self.timeout - (time.monotonic() - job.started))))
        except TimeoutError:
            job.status = "timed_out"
            job.error = "The chemistry calculation exceeded its time budget. No incomplete result is labeled complete. Try fewer stereoisomers or conformers."
        except asyncio.CancelledError:
            job.status = "cancelled"
        except Exception as error:
            job.status = "failed"
            job.error = str(error)[:1000]
        finally:
            job.finished = time.monotonic()
            job.payload = {}
            cleanup = asyncio.create_task(self._finish_process(job, startup, receive, receiver, sender))
            try:
                # Repeated task cancellation must not orphan a starting child,
                # a receiver thread, or release capacity before cleanup ends.
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        continue
                cleanup.result()
            finally:
                if acquired:
                    self.semaphore.release()

    async def close(self):
        tasks = []
        for job in list(self.jobs.values()):
            if job.task and not job.task.done():
                self.cancel(job.id)
                tasks.append(job.task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()
        # All submitted calls have finished; shutdown only needs to join idle
        # I/O threads. Keep even those joins off the application's event loop.
        await asyncio.to_thread(self.executor.shutdown, wait=True)
