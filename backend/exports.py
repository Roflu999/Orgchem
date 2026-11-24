"""Bounded multi-record export using the authoritative single-record serializers."""
import csv
import io
import json
from .chemistry_service import dispatch


def export_many(payload):
    records = payload.get("molecules")
    if not isinstance(records, list) or not 1 <= len(records) <= 64:
        raise ValueError("Export between 1 and 64 molecular records.")
    fmt = payload.get("outputFormat", "json")
    if len(records) > 1 and fmt in {"mol", "xyz", "mol-v2000", "mol-v3000"}:
        raise ValueError("Use SDF, JSON or SMILES for multiple stereoisomers.")
    if fmt == "csv":
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["name", "formula", "charge", "isomeric_smiles", "stereoisomer_id", "conformer_id", "method", "energy", "energy_unit"])
        for raw in records:
            molecule = dispatch("parse", {"molecule": raw})["molecules"][0]
            states = molecule["conformers"] or [{}]
            for state in states:
                row = [molecule["name"], molecule["formula"], molecule["charge"], molecule["notation"], molecule["stereoisomerId"], state.get("id", ""), state.get("method", ""), state.get("energy", ""), state.get("energyUnit", "")]
                writer.writerow(["'" + str(v) if isinstance(v, str) and v.startswith(("=", "+", "-", "@")) else v for v in row])
        return {"text": stream.getvalue(), "filename": "molecular-records.csv", "mime": "text/csv;charset=utf-8"}
    outputs = [dispatch("export", {**payload, "molecules": None, "molecule": m, "conformerId": m.get("selectedConformerId")}) for m in records]
    if fmt == "json":
        text = json.dumps({"schema": "bond-atlas/3", "molecules": [json.loads(o["text"]) for o in outputs]}, ensure_ascii=False, indent=2, allow_nan=False)
    else:
        text = "".join(o["text"] for o in outputs)
    first = outputs[0]
    return {"text": text, "filename": first["filename"] if len(records) == 1 else "molecular-records." + first["filename"].rsplit(".", 1)[-1], "mime": first["mime"]}
