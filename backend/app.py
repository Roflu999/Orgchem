"""Same-origin web application; no directory listing and no public deployment side effects."""
import importlib.util
import asyncio
import json
from contextlib import suppress
from importlib.metadata import PackageNotFoundError, version
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import os
from pathlib import Path
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from . import opsin
from .jobs import JobManager
from .models import JobRequest, JobResponse

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {
    "chemistry.js", "systematic-name.js", "chemistry-worker.js", "geometry.js", "formats.js", "interchange-ui.js",
    "sketcher-model.js", "draft-recovery.js", "sketcher-ui.js", "scene.js", "orbitals.js", "projections.js",
    "isomer-types.js", "textbook-ui.js", "molecule-record.js", "chemistry-client.js",
    "stereo-ui.js", "stereo.css", "workbench.css", "quantum-grid.js", "structure-notes.js", "atom-inspection.js", "model-input.js", "model-stage.js", "model-desk.js",
    "comparison-mirrors.js", "model-comparisons.js", "comparison-locales.js", "comparison.css", "workspace-file.js",
    "reaction-sites.js", "reaction-extension.js", "reaction-guide.js", "reaction-learning-ui.js", "reaction-input.js",
    "plate-chemistry.js", "reaction-plates.js", "plate-viewer.js", "plate-viewer.css", "reaction-plates.css",
    "benzene-view.js", "reaction-rules.js", "reaction-diagram.js", "reaction-addition.js", "reaction-aromatic.js", "reaction-substitution.js", "reaction-oxidation.js", "reaction-motifs.js", "reaction-library.js", "reaction-ui.js",
    "atlas-i18n.js", "atlas-locales.js", "atlas-shell-locales.js", "atlas-preferences.js", "atlas-fonts.css", "viewer-lifecycle.js",
}
FONT_FILES = frozenset(item["name"] for item in json.loads((ROOT / "vendor/fonts/manifest.json").read_text())["files"]
                       if isinstance(item.get("name"), str) and Path(item["name"]).name == item["name"] and item["name"].endswith(".woff2"))
MAX_BODY = int(os.getenv("BOND_ATLAS_MAX_BODY", 1024 * 1024))


def settings():
    return {
        "workers": max(1, min(8, int(os.getenv("BOND_ATLAS_WORKERS", "2")))),
        "capacity": max(1, min(32, int(os.getenv("BOND_ATLAS_QUEUE", "8")))),
        "timeout": max(2, min(300, int(os.getenv("BOND_ATLAS_TIMEOUT", "45")))),
        "ttl": max(10, min(3600, int(os.getenv("BOND_ATLAS_JOB_TTL", "600")))),
        "memory_mb": max(512, int(os.getenv("BOND_ATLAS_MEMORY_MB", "2048"))),
    }


@asynccontextmanager
async def lifespan(application):
    # Probe once at startup, not once per capabilities request. A missing jar,
    # incompatible JVM, or broken CLI must not disable ordinary RDKit jobs.
    application.state.opsin_available = await opsin.available()
    application.state.jobs = JobManager(**settings())
    async def reap():
        while True:
            await asyncio.sleep(min(30, application.state.jobs.ttl))
            application.state.jobs.cleanup()
    reaper = asyncio.create_task(reap())
    try:
        yield
    finally:
        reaper.cancel()
        with suppress(asyncio.CancelledError):
            await reaper
        await application.state.jobs.close()


app = FastAPI(title="Orgchem Visualizer chemistry", version="3.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)
requests_by_ip = defaultdict(deque)


@app.middleware("http")
async def request_guard(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH"}:
        length = request.headers.get("content-length")
        if length and (not length.isdigit() or int(length) > MAX_BODY):
            return JSONResponse({"detail": "Request exceeds the configured input size budget."}, status_code=413)
        parts, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BODY:
                return JSONResponse({"detail": "Request exceeds the configured input size budget."}, status_code=413)
            parts.append(chunk)
        request._body = b"".join(parts)
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
            return JSONResponse({"detail": "Cross-origin chemistry requests are not enabled."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline'; font-src 'self'; "
        "img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; "
        "base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "chemistryAvailable": importlib.util.find_spec("rdkit") is not None}


@app.get("/api/v1/capabilities")
async def capabilities():
    available = importlib.util.find_spec("rdkit") is not None
    try:
        rdkit_version = version("rdkit")
    except PackageNotFoundError:
        rdkit_version = None
    return {"schema": "bond-atlas/3", "available": available, "rdkitVersion": rdkit_version,
            "stereoisomers": available, "conformers": available, "stereoPreservingFormats": available,
            "opsinAvailable": available and app.state.opsin_available,
            "privacy": "Structures are processed on this website's server, kept temporarily in memory, and not sent to third-party services unless you explicitly request and consent to a PubChem name lookup.",
            "limits": {"atoms": 256, "stereoisomers": 64, "conformers": 50, "inputBytes": MAX_BODY,
                       "nameChars": opsin.MAX_NAME_CHARS, **settings()}}


@app.post("/api/v1/jobs", status_code=202, response_model=JobResponse)
async def create_job(body: JobRequest, request: Request):
    if importlib.util.find_spec("rdkit") is None:
        raise HTTPException(503, "Install the pinned RDKit requirements to enable server chemistry.")
    now = time.monotonic()
    ip = request.client.host if request.client else "local"
    # Only request counts, never molecule payloads, are retained in this rate bucket.
    if len(requests_by_ip) > 2048:
        for key, bucket in list(requests_by_ip.items()):
            if not bucket or bucket[-1] < now - 60:
                requests_by_ip.pop(key, None)
    bucket = requests_by_ip[ip]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= 90:
        raise HTTPException(429, "Too many chemistry requests. Wait a minute before starting more calculations.")
    bucket.append(now)
    try:
        return app.state.jobs.submit(body.operation, body.payload).public()
    except OverflowError as error:
        raise HTTPException(429, str(error)) from error


@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def read_job(job_id: str):
    job = app.state.jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Calculation not found or expired.")
    return job.public()


@app.delete("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def cancel_job(job_id: str):
    job = app.state.jobs.cancel(job_id)
    if not job:
        raise HTTPException(404, "Calculation not found or expired.")
    return job.public()


def document():
    page = (ROOT / "bond-atlas.html").read_text(encoding="utf-8")
    start = page.index('<div class="shell">')
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>'
            + page[:start] + '</head><body>' + page[start:] + '</body></html>')


@app.get("/", response_class=HTMLResponse)
@app.get("/bond-atlas.html", response_class=HTMLResponse)
@app.get("/orgchem-visualizer.html", response_class=HTMLResponse)
async def index():
    return HTMLResponse(document(), headers={"Cache-Control": "no-cache"})


@app.get('/vendor/3dmol-2.4.2/3Dmol-min.js')
async def renderer_asset():
    return FileResponse(ROOT/'vendor'/'3dmol-2.4.2'/'3Dmol-min.js', media_type='text/javascript',headers={'Cache-Control':'public, max-age=31536000, immutable'})


@app.get('/fonts/{name}')
async def font_asset(name: str):
    if name not in FONT_FILES:
        raise HTTPException(404, 'Font asset not found.')
    return FileResponse(ROOT / 'vendor' / 'fonts' / name, media_type='font/woff2',
                        headers={'Cache-Control': 'public, max-age=31536000, immutable'})


@app.get("/{asset}")
async def static_asset(asset: str):
    if asset not in PUBLIC_FILES or not (ROOT / asset).is_file():
        raise HTTPException(404, "Asset not found.")
    return FileResponse(ROOT / asset)
