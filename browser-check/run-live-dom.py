"""Run the live DOM suite with a fresh, loopback-only server and job queue."""
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    # Pass a bound loopback socket to uvicorn rather than guessing an unused port.
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
        server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:app',
                                   '--fd', str(sock.fileno()), '--log-level', 'warning'],
                                  cwd=ROOT, pass_fds=(sock.fileno(),))
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and server.poll() is None:
            try:
                with urlopen(f'http://127.0.0.1:{port}/api/v1/health', timeout=1):
                    break
            except (OSError, URLError):
                time.sleep(.1)
        else:
            raise RuntimeError('Local chemistry server did not start')
        subprocess.run(['node', 'browser-check/live-dom.mjs', str(port)], cwd=ROOT, check=True, timeout=300)
        subprocess.run(['node', 'browser-check/plate-viewer.mjs', str(port)], cwd=ROOT, check=True, timeout=180)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
