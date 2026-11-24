"""Local OPSIN CLI adapter. A name is data on stdin, never an argument or path."""
import asyncio
import os
from pathlib import Path
import shutil
import sys

VENV = Path(__file__).resolve().parents[1] / '.venv'
MAX_NAME_CHARS = 256
MAX_SMILES_BYTES = 20000  # Matches the RDKit SMILES import budget.
MAX_SECONDS = 12
UNAVAILABLE = 'Local OPSIN name parsing is unavailable. Import a structure as SMILES instead.'


def runtime():
    jar = Path(os.environ.get('BOND_ATLAS_OPSIN_JAR', VENV / 'opsin' / 'opsin.jar'))
    if not jar.is_file() or not os.access(jar, os.R_OK):
        return None
    exe = 'java.exe' if os.name == 'nt' else 'java'
    if 'BOND_ATLAS_JAVA' in os.environ:
        java = shutil.which(os.environ['BOND_ATLAS_JAVA'])
    else:
        site = (VENV / 'Lib' if os.name == 'nt' else VENV / 'lib' / f'python{sys.version_info.major}.{sys.version_info.minor}') / 'site-packages'
        java = shutil.which(str(site / 'jdk4py' / 'java-runtime' / 'bin' / exe)) or shutil.which(exe)
    return (java, str(jar.resolve())) if java else None


def validate_name(text):
    if (not isinstance(text, str) or not 1 <= len(text) <= MAX_NAME_CHARS
            or not text.isprintable() or not text.strip()):
        raise ValueError(f'Provide one nonempty compound name on a single line (at most {MAX_NAME_CHARS} characters).')
    return text.strip()


async def _reap(process):
    if process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
    # A full pipe can keep wait() pending after a kill. Discard in bounded chunks.
    while await process.stdout.read(8192):
        pass
    await process.wait()


async def resolve(text, timeout=MAX_SECONDS):
    name = validate_name(text)
    paths = runtime()
    if not paths:
        raise ValueError(UNAVAILABLE)
    java, jar = paths
    # Ignore ambient JVM/agent/argument injection. No CLI diagnostics (which
    # may contain the submitted name) are logged or exposed to clients.
    env = {key: value for key, value in os.environ.items()
           if key.upper() not in {'_JAVA_OPTIONS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH'}}
    async with asyncio.timeout(min(timeout, MAX_SECONDS)):
        try:
            process = await asyncio.create_subprocess_exec(
                java, '-Xms16m', '-Xmx128m', '-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1',
                '-XX:MaxMetaspaceSize=64m', '-XX:MaxDirectMemorySize=16m', '-XX:ReservedCodeCacheSize=32m',
                '-XX:-UsePerfData', '-Dfile.encoding=UTF-8', '-Djava.awt.headless=true',
                '-jar', jar, '-osmi', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, env=env, limit=MAX_SMILES_BYTES + 2)
        except (OSError, NotImplementedError) as error:
            raise ValueError(UNAVAILABLE) from error
        try:
            process.stdin.write((name + '\n').encode('utf-8'))
            process.stdin.close()
            # readexactly bounds the entire output even if the CLI never emits EOF.
            try:
                await process.stdout.readexactly(MAX_SMILES_BYTES + 3)
            except asyncio.IncompleteReadError as end:
                data = end.partial.removesuffix(b'\n').removesuffix(b'\r')
            else:
                raise ValueError('OPSIN output exceeds the structure budget.')
            status = await process.wait()
            if status or not data:
                raise ValueError('OPSIN could not resolve this name to a supported structure.')
            if len(data) > MAX_SMILES_BYTES or any(not 33 <= byte <= 126 for byte in data):
                raise ValueError('OPSIN did not return one supported SMILES structure.')
            return data.decode('ascii')
        finally:
            # The server owns this process directly. Cancellation must reap the JVM
            # before its parallel-job slot can be reused, even on Windows.
            cleanup = asyncio.create_task(_reap(process))
            try:
                await asyncio.shield(cleanup)
            except asyncio.CancelledError:
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        continue
                cleanup.result()
                raise


async def available():
    try:
        return await resolve('methane') == 'C'
    except (ValueError, OSError, TimeoutError):
        return False
