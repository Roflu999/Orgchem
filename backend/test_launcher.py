"""Portable launcher control-path tests. No packages, network, browser or real server needed."""
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

# Also works with unittest discovery using backend as the start directory.
SPEC = importlib.util.spec_from_file_location("bond_atlas_run_local", Path(__file__).resolve().parents[1] / "run_local.py")
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="launcher test ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.requirements = self.root / "requirements.txt"
        self.requirements.write_text("# runtime only\nrdkit==2026.9.2\nfastapi==0.136.3\n", encoding="utf-8")
        (self.root / "serve.py").write_text("", encoding="utf-8")
        self.environment = self.root / "local environment"
        self.output = io.StringIO()
        self.enterContext(redirect_stdout(self.output))
        self.enterContext(redirect_stderr(self.output))

    def make_environment(self, managed=False, digest=None):
        self.environment.mkdir(exist_ok=True)
        (self.environment / "pyvenv.cfg").write_text("include-system-site-packages = false\n", encoding="utf-8")
        python = launcher.venv_python(self.environment)
        python.parent.mkdir()
        python.write_text("", encoding="utf-8")
        if managed:
            (self.environment / launcher.MARKER).write_text(json.dumps({"schema": 1, "requirements_sha256": digest}), encoding="utf-8")
        return python

    def fake_run(self, command, **kwargs):
        self.assertIsInstance(command, list)
        self.assertNotIn("shell", kwargs)
        if command[1:3] == ["-m", "venv"]:
            self.assertEqual(command[-1], str(self.environment))
            self.make_environment()
        return Mock(returncode=0)

    def test_first_run_creates_isolated_env_installs_runtime_and_records_hash(self):
        with patch.object(launcher.subprocess, "run", side_effect=self.fake_run) as run:
            python = launcher.prepare_environment(self.root, self.environment)
        self.assertEqual(python, launcher.venv_python(self.environment))
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0], [launcher.sys.executable, "-m", "venv", str(self.environment)])
        installs = [command for command in commands if "pip" in command]
        self.assertEqual(len(installs), 1)
        self.assertEqual(installs[0][0:4], [str(python), "-m", "pip", "install"])
        self.assertEqual(installs[0][-2:], ["-r", str(self.requirements)])
        self.assertNotIn("requirements-dev.txt", str(commands))
        self.assertNotIn("playwright", str(commands))
        state = json.loads((self.environment / launcher.MARKER).read_text(encoding="utf-8"))
        self.assertEqual(state["requirements_sha256"], hashlib.sha256(self.requirements.read_bytes()).hexdigest())
        self.assertIn("First run", self.output.getvalue())
        self.assertIn("network", self.output.getvalue())

    def test_ready_managed_environment_never_runs_installer(self):
        digest = hashlib.sha256(self.requirements.read_bytes()).hexdigest()
        self.make_environment(managed=True, digest=digest)
        with patch.object(launcher.subprocess, "run", side_effect=self.fake_run) as run:
            launcher.prepare_environment(self.root, self.environment)
        self.assertEqual(len(run.call_args_list), 2)
        self.assertTrue(all("-I" in call.args[0] for call in run.call_args_list))

    def test_ready_user_environment_is_not_adopted_or_changed(self):
        self.make_environment()
        with patch.object(launcher.subprocess, "run", side_effect=self.fake_run) as run:
            launcher.prepare_environment(self.root, self.environment)
        self.assertEqual(run.call_count, 2)
        self.assertFalse((self.environment / launcher.MARKER).exists())

    def test_existing_non_environment_is_never_overwritten(self):
        self.environment.mkdir()
        sentinel = self.environment / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")
        with patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "left untouched"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        run.assert_not_called()
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_wrong_environment_python_is_not_recreated_or_installed(self):
        self.make_environment()
        with patch.object(launcher.subprocess, "run", return_value=Mock(returncode=10)) as run:
            with self.assertRaisesRegex(launcher.LauncherError, "does not use Python 3.13"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        self.assertEqual(run.call_count, 1)

    def test_non_virtual_interpreter_never_receives_pip(self):
        self.make_environment()
        with patch.object(launcher.subprocess, "run", return_value=Mock(returncode=11)) as run:
            with self.assertRaisesRegex(launcher.LauncherError, "no global pip"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        self.assertEqual(run.call_count, 1)

    def test_missing_user_packages_require_explicit_install(self):
        self.make_environment()
        with patch.object(launcher, "probe", side_effect=[0, 12]), patch.object(launcher, "install_runtime") as install:
            with self.assertRaisesRegex(launcher.LauncherError, "--install"):
                launcher.prepare_environment(self.root, self.environment)
        install.assert_not_called()

    def test_explicit_install_can_sync_user_created_venv(self):
        python = self.make_environment()
        with patch.object(launcher, "probe", return_value=0), patch.object(launcher, "install_runtime") as install:
            launcher.prepare_environment(self.root, self.environment, install=True)
        install.assert_called_once_with(python, self.root)
        self.assertFalse((self.environment / launcher.MARKER).exists())

    def test_pending_managed_install_retries_without_recreating_environment(self):
        python = self.make_environment(managed=True)
        with patch.object(launcher, "probe", return_value=0), patch.object(launcher, "install_runtime") as install:
            launcher.prepare_environment(self.root, self.environment)
        install.assert_called_once_with(python, self.root)
        self.assertIsNotNone(json.loads((self.environment / launcher.MARKER).read_text(encoding="utf-8"))["requirements_sha256"])

    def test_interrupted_marker_update_leaves_pending_install_retryable(self):
        self.make_environment(managed=True)
        original_files = set(self.environment.iterdir())
        marker = self.environment / launcher.MARKER
        original_marker = marker.read_bytes()

        def short_write(state, handle):
            handle.write('{')
            raise OSError('short write')

        with patch.object(launcher, 'probe', return_value=0), patch.object(launcher, 'install_runtime'):
            with patch.object(launcher.json, 'dump', side_effect=short_write), self.assertRaises(OSError):
                launcher.prepare_environment(self.root, self.environment)
            self.assertEqual(marker.read_bytes(), original_marker)
            self.assertEqual(set(self.environment.iterdir()), original_files)
            launcher.prepare_environment(self.root, self.environment)
        self.assertEqual(json.loads(marker.read_text(encoding='utf-8'))['requirements_sha256'],
                         hashlib.sha256(self.requirements.read_bytes()).hexdigest())

    def test_changed_requirements_need_explicit_update(self):
        self.make_environment(managed=True, digest="0" * 64)
        with patch.object(launcher, "probe", return_value=0), patch.object(launcher, "install_runtime") as install:
            with self.assertRaisesRegex(launcher.LauncherError, "requirements changed"):
                launcher.prepare_environment(self.root, self.environment)
        install.assert_not_called()

    def test_changed_requirements_update_only_when_requested(self):
        self.make_environment(managed=True, digest="0" * 64)
        with patch.object(launcher, "probe", return_value=0), patch.object(launcher, "install_runtime") as install:
            launcher.prepare_environment(self.root, self.environment, install=True)
        install.assert_called_once()

    def test_unrecognized_marker_is_not_overwritten(self):
        self.make_environment()
        marker = self.environment / launcher.MARKER
        marker.write_text('{"something": "user-owned"}', encoding="utf-8")
        with patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "not overwritten"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        run.assert_not_called()
        self.assertEqual(marker.read_text(encoding="utf-8"), '{"something": "user-owned"}')

    def test_symlink_environment_is_not_modified(self):
        target = self.root / "user environment"
        target.mkdir()
        try:
            self.environment.symlink_to(target, target_is_directory=True)
        except OSError:
            self.skipTest("Creating symlinks is not permitted on this platform")
        with patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "symlink"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        run.assert_not_called()
        self.assertEqual(list(target.iterdir()), [])

    def test_symlink_marker_is_not_overwritten(self):
        self.make_environment()
        target = self.root / "user data.json"
        original = json.dumps({"schema": 1, "requirements_sha256": None})
        target.write_text(original, encoding="utf-8")
        try:
            (self.environment / launcher.MARKER).symlink_to(target)
        except OSError:
            self.skipTest("Creating symlinks is not permitted on this platform")
        with patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "symlink"):
                launcher.prepare_environment(self.root, self.environment, install=True)
        run.assert_not_called()
        self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_concurrent_directory_creator_is_never_passed_to_venv(self):
        real_mkdir = Path.mkdir
        def concurrent_mkdir(path, *args, **kwargs):
            real_mkdir(path)
            (path / "user-file").write_text("preserve", encoding="utf-8")
            raise FileExistsError
        with patch.object(Path, "mkdir", concurrent_mkdir), patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "creation failed"):
                launcher.prepare_environment(self.root, self.environment)
        run.assert_not_called()
        self.assertEqual((self.environment / "user-file").read_text(encoding="utf-8"), "preserve")

    def test_creation_failure_keeps_partial_directory_and_hides_output(self):
        def fail(command, **kwargs):
            self.assertTrue(self.environment.is_dir())
            (self.environment / "keep").write_text("partial", encoding="utf-8")
            raise subprocess.CalledProcessError(1, command, stderr="private-index-password")
        with patch.object(launcher.subprocess, "run", side_effect=fail):
            with self.assertRaisesRegex(launcher.LauncherError, "creation failed") as error:
                launcher.prepare_environment(self.root, self.environment)
        self.assertTrue((self.environment / "keep").exists())
        self.assertNotIn("private-index-password", str(error.exception) + self.output.getvalue())

    def test_pip_failure_preserves_pending_marker_for_retry(self):
        def fail_install(command, **kwargs):
            if "pip" in command:
                self.assertEqual(kwargs["stdout"], subprocess.DEVNULL)
                self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
                raise subprocess.CalledProcessError(1, command, stderr="secret-index-token")
            return self.fake_run(command, **kwargs)
        with patch.object(launcher.subprocess, "run", side_effect=fail_install):
            with self.assertRaisesRegex(launcher.LauncherError, "Retry with --install") as error:
                launcher.prepare_environment(self.root, self.environment)
        self.assertIsNone(json.loads((self.environment / launcher.MARKER).read_text(encoding="utf-8"))["requirements_sha256"])
        self.assertNotIn("secret-index-token", str(error.exception) + self.output.getvalue())

    def test_native_import_failure_does_not_change_system_settings(self):
        self.make_environment()
        with patch.object(launcher, "probe", side_effect=[0, 13]), patch.object(launcher, "install_runtime") as install:
            with self.assertRaisesRegex(launcher.LauncherError, "native library"):
                launcher.prepare_environment(self.root, self.environment)
        install.assert_not_called()

    def test_probe_timeout_has_private_safe_diagnostic(self):
        with patch.object(launcher.subprocess, "run", side_effect=subprocess.TimeoutExpired("private command", 60)):
            with self.assertRaisesRegex(launcher.LauncherError, "nothing was deleted") as error:
                launcher.probe(Path("python"))
        self.assertNotIn("private command", str(error.exception))

    def test_non_pinned_requirements_rejected_before_subprocess(self):
        self.requirements.write_text("-r requirements-dev.txt\n", encoding="utf-8")
        with patch.object(launcher.subprocess, "run") as run:
            with self.assertRaisesRegex(launcher.LauncherError, "exact package==version"):
                launcher.prepare_environment(self.root, self.environment)
        run.assert_not_called()
        self.assertFalse(self.environment.exists())

    def test_unsupported_bootstrap_python_fails_without_changes(self):
        with patch.object(launcher.sys, "version_info", (3, 12, 0)), patch.object(launcher, "prepare_environment") as prepare:
            self.assertEqual(launcher.main([]), 1)
        prepare.assert_not_called()
        self.assertIn("Python 3.13", self.output.getvalue())

    def test_invalid_ports_fail_before_setup(self):
        for value in ("0", "65536", "not-a-port", "8000;anything"):
            with self.subTest(value=value), patch.object(launcher, "prepare_environment") as prepare:
                with self.assertRaises(SystemExit) as error:
                    launcher.main(["--port", value])
                self.assertEqual(error.exception.code, 2)
                prepare.assert_not_called()

    def test_setup_only_does_not_start_server(self):
        with patch.object(launcher, "ROOT", self.root), patch.object(launcher.sys, "version_info", (3, 13, 0)), patch.object(launcher, "prepare_environment", return_value=Path("python")) as prepare, patch.object(launcher, "run_server") as server:
            self.assertEqual(launcher.main(["--venv", "custom env", "--install", "--setup-only"]), 0)
        prepare.assert_called_once_with(self.root, self.root / "custom env", True)
        server.assert_not_called()

    def test_default_server_and_port_forwarding(self):
        for options, expected_port in (([], 8000), (["--port", "8341"], 8341)):
            with self.subTest(options=options), patch.object(launcher, "ROOT", self.root), patch.object(launcher.sys, "version_info", (3, 13, 0)), patch.object(launcher, "prepare_environment", return_value=Path("python")), patch.object(launcher, "run_server", return_value=0) as server:
                self.assertEqual(launcher.main(options), 0)
                server.assert_called_once_with(Path("python"), self.root, expected_port)

    def test_launch_uses_safe_arguments_loopback_and_project_directory(self):
        child = Mock()
        child.wait.return_value = 0
        python = self.root / "env with spaces" / "python"
        with patch.object(launcher.subprocess, "Popen", return_value=child) as popen:
            self.assertEqual(launcher.run_server(python, self.root, 8341), 0)
        popen.assert_called_once_with([str(python), str(self.root / "serve.py"), "--host", "127.0.0.1", "--port", "8341"], cwd=str(self.root))

    def test_server_failure_explains_port_retry_without_stopping_any_process(self):
        child = Mock()
        child.wait.return_value = 1
        with patch.object(launcher.subprocess, "Popen", return_value=child):
            self.assertEqual(launcher.run_server(Path("python"), self.root, 8000), 1)
        child.terminate.assert_not_called()
        self.assertIn("--port 8001", self.output.getvalue())

    def test_keyboard_interrupt_allows_own_child_to_stop_gracefully(self):
        child = Mock()
        child.wait.side_effect = [KeyboardInterrupt, 0]
        child.poll.return_value = None
        with patch.object(launcher.subprocess, "Popen", return_value=child):
            self.assertEqual(launcher.run_server(Path("python"), self.root, 8000), 130)
        child.wait.assert_called_with(timeout=3)
        child.terminate.assert_not_called()
        child.kill.assert_not_called()

    def test_parent_only_interrupt_terminates_only_own_child_after_grace(self):
        child = Mock()
        child.wait.side_effect = [KeyboardInterrupt, subprocess.TimeoutExpired("server", 3), 0]
        child.poll.return_value = None
        with patch.object(launcher.subprocess, "Popen", return_value=child):
            self.assertEqual(launcher.run_server(Path("python"), self.root, 8000), 130)
        child.terminate.assert_called_once()
        child.kill.assert_not_called()

    def test_unresponsive_own_child_is_reaped(self):
        child = Mock()
        child.wait.side_effect = [KeyboardInterrupt, subprocess.TimeoutExpired("server", 3), subprocess.TimeoutExpired("server", 10), 0]
        child.poll.return_value = None
        with patch.object(launcher.subprocess, "Popen", return_value=child):
            self.assertEqual(launcher.run_server(Path("python"), self.root, 8000), 130)
        child.terminate.assert_called_once()
        child.kill.assert_called_once()
        self.assertEqual(child.wait.call_count, 4)


if __name__ == "__main__":
    unittest.main()
