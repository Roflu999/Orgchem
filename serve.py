"""Run the same-origin chemistry website locally (or in an explicitly configured container)."""
import argparse


def main():
    parser = argparse.ArgumentParser(description="Run Orgchem Visualizer with the RDKit chemistry service.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1", help="Use 0.0.0.0 explicitly for a container/public binding.")
    args = parser.parse_args()
    try:
        import uvicorn
    except ImportError as error:
        raise SystemExit("Install requirements.txt in a virtual environment, then run .venv/bin/python serve.py") from error
    print(f"Orgchem Visualizer: http://{args.host}:{args.port}", flush=True)
    uvicorn.run("backend.app:app", host=args.host, port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
