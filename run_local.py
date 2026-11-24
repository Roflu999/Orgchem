"""Bootstrap an isolated runtime and run the local app; Python 3.13 standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
PYTHON_VERSION = (3, 13)
MARKER = ".bond-atlas-launcher.json"


class LauncherError(Exception):
    """A recoverable setup problem, safe to display without environment contents."""


def port_number(value):
    try:
        port = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("port must be an integer from 1 to 65535") from None
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be an integer from 1 to 65535")
    return port


def venv_python(directory):
    return directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def runtime_requirements(path):
    """Read only exact runtime pins, never execute requirements or log their contents."""
    raw = path.read_bytes()
    try:
        lines = raw.decode("utf-8").splitlines()
    except UnicodeError:
        raise LauncherError("requirements.txt must be a UTF-8 file containing exact runtime pins.") from None
    pins = []
    for line in lines:
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+!-]+)", line)
        if not match:
            raise LauncherError("requirements.txt must contain exact package==version pins. Use the manual setup route for other requirement formats.")
        pins.append(match.groups())
    if not pins:
        raise LauncherError("requirements.txt has no runtime pins; restore it before setup.")
    return pins, hashlib.sha256(raw).hexdigest()


# Fixed exit codes keep package/installer diagnostics, URLs and environment values private.
PROBE = """
import importlib.metadata, json, sys
if sys.version_info[:2] != (3, 13):
    sys.exit(10)
if sys.prefix == sys.base_prefix:
    sys.exit(11)
if len(sys.argv) > 1:
    try:
        for name, expected in json.loads(sys.argv[1]):
            if importlib.metadata.version(name) != expected:
                sys.exit(12)
    except importlib.metadata.PackageNotFoundError:
        sys.exit(12)
    try:
        import fastapi, uvicorn, rdkit.Chem, numpy, PIL, starlette, pydantic
    except Exception:
        sys.exit(13)
"""


def probe(python, pins=None):
    command = [str(python), "-I", "-c", PROBE]
    if pins is not None:
        command.append(json.dumps(pins))
    try:
        return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              timeout=60, check=False).returncode
    except (OSError, subprocess.TimeoutExpired):
        raise LauncherError("Cannot run the selected virtual-environment Python. Inspect the environment or choose a new --venv path; nothing was deleted.") from None


def install_runtime(python, root):
    print("Installing pinned runtime dependencies from requirements.txt into the selected virtual environment.", flush=True)
    print("This step needs a package index/network (or an explicitly configured local pip cache/index). No dev or browser packages are installed.", flush=True)
    print("Installer output is hidden because pip configuration/diagnostics can contain private URLs. This may take several minutes.", flush=True)
    try:
        subprocess.run([str(python), "-m", "pip", "install", "--no-input", "--disable-pip-version-check",
                        "-r", str(root / "requirements.txt")], cwd=str(root),
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except (OSError, subprocess.CalledProcessError):
        raise LauncherError("Runtime installation failed. Check network/proxy/package-index access, available disk space, and Python 3.13 wheel availability for this OS/CPU. No system packages were changed. Retry with --install, or follow LOCAL_SETUP.md for manual pip diagnostics.") from None


def prepare_environment(root, directory, install=False):
    pins, digest = runtime_requirements(root / "requirements.txt")
    if directory.is_symlink():
        raise LauncherError("The selected environment directory is a symlink. Use its real path explicitly; the launcher will not modify a symlinked environment.")
    created = not directory.exists()
    marker = directory / MARKER
    state = None
    if marker.is_symlink():
        raise LauncherError("The launcher marker is a symlink. Inspect it or choose a fresh --venv path; it was not overwritten.")
    if created:
        print("First run: creating an isolated virtual environment. Runtime dependency installation follows; no global pip installs.", flush=True)
        try:
            # Reserve the new path atomically so a concurrent creator cannot be overwritten.
            directory.mkdir(parents=True)
            subprocess.run([sys.executable, "-m", "venv", str(directory)], cwd=str(root),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except (OSError, subprocess.CalledProcessError):
            raise LauncherError("Virtual-environment creation failed. Install/enable Python 3.13's venv/ensurepip support yourself if needed. Any partial directory is left untouched: inspect it and choose a fresh --venv path before retrying.") from None
        state = {"schema": 1, "requirements_sha256": None}
        # Never replace an existing marker, even if another launcher ran concurrently.
        with marker.open("x", encoding="utf-8") as handle:
            json.dump(state, handle)
    elif marker.exists():
        try:
            state = json.loads(marker.read_text(encoding="utf-8"))
            if (not isinstance(state, dict) or set(state) != {"schema", "requirements_sha256"}
                    or state["schema"] != 1
                    or (state["requirements_sha256"] is not None
                        and not re.fullmatch(r"[0-9a-f]{64}", str(state["requirements_sha256"])))):
                raise ValueError
        except (ValueError, OSError):
            raise LauncherError("The launcher marker is unreadable or unrecognized. Inspect it or select a fresh --venv path; it was not overwritten.") from None
    python = venv_python(directory)
    if not (directory / "pyvenv.cfg").is_file() or not python.is_file():
        raise LauncherError("The selected directory is not a complete virtual environment. It was left untouched. Inspect it and choose a new --venv path, or use the manual setup route.")
    identity = probe(python)
    if identity == 10:
        raise LauncherError("The selected environment does not use Python 3.13. Choose a new --venv path; existing environments are never recreated or upgraded automatically.")
    if identity != 0:
        raise LauncherError("The selected interpreter is not a working isolated Python 3.13 virtual environment. Choose a new --venv path; no global pip install was attempted.")
    pending = state is not None and state["requirements_sha256"] is None
    if install or created or pending:
        install_runtime(python, root)
    elif state is not None and state["requirements_sha256"] != digest:
        raise LauncherError("Runtime requirements changed. Stop the app and rerun with --install to explicitly update this environment, or choose a fresh --venv path.")
    status = probe(python, pins)
    if status == 12:
        raise LauncherError("Pinned runtime packages are missing or differ from requirements.txt. Existing packages were not changed. Rerun with --install to explicitly synchronize them, or use the manual setup route.")
    if status != 0:
        raise LauncherError("Runtime imports failed. A required native library may be unavailable or this platform may not have compatible wheels. See LOCAL_SETUP.md; no system-library or security settings were changed.")
    if state is not None and state["requirements_sha256"] != digest:
        marker.write_text(json.dumps({"schema": 1, "requirements_sha256": digest}) + "\n", encoding="utf-8")
    return python


def run_server(python, root, port):
    print(f"Starting http://127.0.0.1:{port} (local machine only). Stop with Ctrl+C.", flush=True)
    process = subprocess.Popen([str(python), str(root / "serve.py"), "--host", "127.0.0.1",
                                "--port", str(port)], cwd=str(root))
    try:
        code = process.wait()
    except KeyboardInterrupt:
        # Only the child this invocation created is ever signalled.
        if process.poll() is None:
            try:
                # Terminal Ctrl+C normally reaches both processes. Give the server time
                # to clean up its own chemistry workers before forcing termination.
                process.wait(timeout=3)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                process.terminate()
                try:
                    process.wait(timeout=10)
                except (subprocess.TimeoutExpired, KeyboardInterrupt):
                    process.kill()
                    process.wait()
        print("Local server stopped.", flush=True)
        return 130
    if code:
        print("Local server exited unsuccessfully. If the port is occupied, retry with --port 8001. No other processes were stopped.", file=sys.stderr)
    return code


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the local app. The first invocation creates .venv and installs pinned runtime packages; later runs need no installer/network.")
    parser.add_argument("--port", type=port_number, default=8000, help="Loopback port (default: 8000).")
    parser.add_argument("--venv", default=".venv", help="Environment path, relative to the project unless absolute (default: .venv).")
    parser.add_argument("--install", action="store_true", help="Explicitly install/synchronize runtime pins, including in an existing user-created venv.")
    parser.add_argument("--setup-only", action="store_true", help="Prepare/check the environment without starting the app.")
    args = parser.parse_args(argv)
    if sys.version_info[:2] != PYTHON_VERSION:
        print("Use Python 3.13 to run this launcher. Other Python versions are not validated against the pinned runtime; no files were changed.", file=sys.stderr)
        return 1
    try:
        if not (ROOT / "serve.py").is_file():
            raise LauncherError("serve.py is missing. Run the launcher from a complete project checkout.")
        directory = Path(args.venv).expanduser()
        if not directory.is_absolute():
            directory = ROOT / directory
        python = prepare_environment(ROOT, directory, args.install)
        if args.setup_only:
            print("Runtime ready. Run this launcher without --setup-only to start the app.", flush=True)
            return 0
        return run_server(python, ROOT, args.port)
    except KeyboardInterrupt:
        print("Setup interrupted. Any partial environment was preserved. Retry with --install or inspect it and choose a fresh --venv path.", file=sys.stderr)
        return 130
    except (LauncherError, OSError) as error:
        # OSError text can include machine-specific/private paths, so do not echo it.
        message = str(error) if isinstance(error, LauncherError) else "A local file or process operation failed. Check permissions and available disk space; no existing environment was deleted."
        print(f"Local setup: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
