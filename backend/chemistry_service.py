"""Bounded, offline RDKit chemistry operations for Orgchem Visualizer.

The v3 molblock, not a legacy valence approximation, is authoritative. Atom maps
are transport identities; canonical chemical identities deliberately exclude them.
All public results are JSON-serializable. Invalid/lossy input raises ValueError.
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import math
import re
from collections import Counter

try:
    from rdkit import Chem, rdBase
    from rdkit.Chem import AllChem, Descriptors, rdDepictor, rdMolDescriptors, rdMolTransforms
    from rdkit.Chem.Draw import rdMolDraw2D
    from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers, StereoEnumerationOptions
    from rdkit.Geometry import Point3D
except ImportError as exc:  # The API can report a clear installation error.
    raise ImportError("RDKit is required by the chemistry service") from exc

MAX_ATOMS = 256
MAX_ISOMERS = 64
MAX_CONFORMERS = 50
MAX_TEXT = 2_000_000
DEFAULT_SEED = 61453
_CT = Chem.ChiralType
_TETRA = {_CT.CHI_TETRAHEDRAL_CW, _CT.CHI_TETRAHEDRAL_CCW}
_KNOWN = {
    "O": "Water", "CCO": "Ethanol", "CO": "Methanol", "C": "Methane",
    "CC": "Ethane", "CCC": "Propane", "CCCC": "Butane", "CC(C)C": "2-Methylpropane",
    "CC(=O)O": "Acetic acid", "CC(O)C(=O)O": "Lactic acid",
    "c1ccccc1": "Benzene", "CC=CC": "But-2-ene", "CC(O)C(C)O": "Butane-2,3-diol",
    "[NH4+]": "Ammonium", "[Na+].[Cl-]": "Sodium chloride",
}
_TAGS = {
    "alcohol": "[CX4][OX2H]", "carboxylic-acid": "[CX3](=O)[OX2H1]",
    "ester": "[CX3](=O)[OX2][#6]", "amide": "[CX3](=O)[NX3]",
    "amine": "[NX3;!$(N-C=O)]", "alkene": "[CX3]=[CX3]", "alkyne": "[CX2]#[CX2]",
    "ether": "[OD2]([#6])[#6]", "ketone": "[#6][CX3](=O)[#6]",
    "aldehyde": "[CX3H1](=O)", "nitrile": "[CX2]#[NX1]",
    "halogenoalkane": "[CX4][F,Cl,Br,I]", "peroxide": "[OX2][OX2]",
}
_TAG_QUERIES = {name: Chem.MolFromSmarts(smarts) for name, smarts in _TAGS.items()}


def _bounded(value, default, upper, name, lower=1):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value:
        raise ValueError(f"{name} must be an integer")
    value = int(value)
    if not lower <= value <= upper:
        raise ValueError(f"{name} must be between {lower} and {upper}")
    return value


def _finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def _assign(mol):
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    if hasattr(Chem, "AssignCIPLabels"):
        Chem.AssignCIPLabels(mol)


def _check_mol(mol):
    if mol is None or mol.GetNumAtoms() == 0:
        raise ValueError("The structure could not be parsed, or contains no atoms")
    if mol.GetNumAtoms() > MAX_ATOMS:
        raise ValueError(f"At most {MAX_ATOMS} base atoms are supported")
    if mol.HasQuery():
        raise ValueError("Query atoms/bonds are not supported as concrete molecules")
    for atom in mol.GetAtoms():
        if atom.GetAtomicNum() == 0:
            raise ValueError("Wildcard atoms are not supported as concrete molecules")
        if not -16 <= atom.GetFormalCharge() <= 16 or not 0 <= atom.GetIsotope() <= 400:
            raise ValueError("Formal charges outside ±16 or isotope labels above 400 are not supported")
    # S-groups and polymer/Markush features cannot be represented by this record.
    if hasattr(Chem, "GetMolSubstanceGroups") and Chem.GetMolSubstanceGroups(mol):
        raise ValueError("MOL substance/polymer groups are not supported")
    try:
        Chem.SanitizeMol(mol)
        _assign(mol)
    except Exception as exc:
        raise ValueError(f"Invalid molecular valence or stereochemistry: {exc}") from exc
    return mol


def _set_ids(mol, ids=None):
    maps = [a.GetAtomMapNum() for a in mol.GetAtoms()]
    nonzero = [x for x in maps if x]
    if len(nonzero) != len(set(nonzero)):
        raise ValueError("Atom-map numbers must be unique")
    if ids is not None:
        if not isinstance(ids, list) or len(ids) != mol.GetNumAtoms() or any(not isinstance(x, str) or not x or len(x) > 100 for x in ids) or len(set(ids)) != len(ids):
            raise ValueError("atomIds must be unique nonempty strings, one per base atom")
    used = set(nonzero)
    next_map = 1
    for i, atom in enumerate(mol.GetAtoms()):
        if not atom.GetAtomMapNum():
            while next_map in used:
                next_map += 1
            atom.SetAtomMapNum(next_map)
            used.add(next_map)
        identity = ids[i] if ids is not None else (atom.GetProp("_AtlasId") if atom.HasProp("_AtlasId") else f"a{atom.GetAtomMapNum()}")
        atom.SetProp("_AtlasId", identity)
    if len({_aid(a) for a in mol.GetAtoms()}) != mol.GetNumAtoms():
        raise ValueError("Atom identities must be unique")
    return mol


def _aid(atom):
    return atom.GetProp("_AtlasId") if atom.HasProp("_AtlasId") else f"a{atom.GetAtomMapNum()}"


def _with_hs(mol, add_coords=False):
    out = Chem.AddHs(mol, addCoords=add_coords)
    used = {a.GetAtomMapNum() for a in out.GetAtoms() if a.GetAtomMapNum()}
    next_map = max(used, default=0) + 1
    ids = {_aid(a) for a in mol.GetAtoms()}
    for atom in list(out.GetAtoms())[mol.GetNumAtoms():]:
        while f"a{next_map}" in ids:
            next_map += 1
        identity = f"a{next_map}"
        ids.add(identity)
        atom.SetProp("_AtlasId", identity)
        atom.SetAtomMapNum(next_map)
        next_map += 1
    return out


def _canonical(mol, stereo=True):
    bare = Chem.Mol(mol)
    for atom in bare.GetAtoms():
        atom.SetAtomMapNum(0)
    # Ordinary explicit H and implicit H have the same chemical identity.
    bare = Chem.RemoveHs(bare)
    if not stereo:
        Chem.RemoveStereochemistry(bare)
    if stereo and bare.GetStereoGroups():
        if not hasattr(Chem, "CXSmilesFields") or not hasattr(Chem.CXSmilesFields, "CX_ENHANCEDSTEREO"):
            raise ValueError("This RDKit build cannot preserve enhanced stereo identities")
        return Chem.MolToCXSmiles(bare, Chem.SmilesWriteParams(), Chem.CXSmilesFields.CX_ENHANCEDSTEREO)
    return Chem.MolToSmiles(bare, canonical=True, isomericSmiles=True)


def _hash(prefix, text):
    return prefix + hashlib.sha256(text.encode()).hexdigest()[:24]


def _bond_id(bond):
    return "b-" + "-".join(sorted((_aid(bond.GetBeginAtom()), _aid(bond.GetEndAtom()))))


def _bonds(mol):
    kek = Chem.Mol(mol)
    try:
        Chem.Kekulize(kek, clearAromaticFlags=False)
    except Exception as exc:
        raise ValueError("Aromatic structure cannot be represented in a Kekule form") from exc
    result = []
    for bond in mol.GetBonds():
        val = kek.GetBondWithIdx(bond.GetIdx()).GetBondTypeAsDouble()
        if val not in (1.0, 2.0, 3.0):
            raise ValueError(f"Unsupported bond type: {bond.GetBondType()}")
        result.append({"a": bond.GetBeginAtomIdx(), "b": bond.GetEndAtomIdx(), "order": int(val), "id": _bond_id(bond), "aromatic": bond.GetIsAromatic()})
    return result


def _stereo(mol):
    _assign(mol)
    centers = []
    for idx, cip in Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False):
        atom = mol.GetAtomWithIdx(idx)
        centers.append({"atom": idx, "atomId": _aid(atom), "cip": cip if cip in ("R", "S") else None, "specified": atom.GetChiralTag() in _TETRA})
    double = []
    unsupported = []
    if hasattr(Chem, "FindPotentialStereo"):
        for info in Chem.FindPotentialStereo(mol):
            kind = str(info.type)
            if kind == "Bond_Double":
                bond = mol.GetBondWithIdx(info.centeredOn)
                code = str(bond.GetStereo())
                desc = "E" if code in ("STEREOE", "STEREOTRANS") else "Z" if code in ("STEREOZ", "STEREOCIS") else None
                double.append({"bondId": _bond_id(bond), "a": bond.GetBeginAtomIdx(), "b": bond.GetEndAtomIdx(), "descriptor": desc, "specified": desc is not None})
            elif kind != "Atom_Tetrahedral":
                unsupported.append(f"{kind} at index {info.centeredOn}")
    for atom in mol.GetAtoms():
        if atom.GetChiralTag() not in _TETRA | {_CT.CHI_UNSPECIFIED}:
            unsupported.append(f"Non-tetrahedral stereochemistry at {_aid(atom)}")
    for bond in mol.GetBonds():
        if "ATROP" in str(bond.GetStereo()):
            unsupported.append(f"Atropisomerism at {_bond_id(bond)}")
    if mol.GetStereoGroups():
        unsupported.append("Enhanced relative/OR/AND stereo groups are retained but not enumerated")
    for idx, cip in Chem.FindMolChiralCenters(mol, includeUnassigned=False, useLegacyImplementation=False):
        if cip not in ("R", "S"):
            unsupported.append(f"Pseudoasymmetric/unsupported CIP descriptor {cip} at {_aid(mol.GetAtomWithIdx(idx))}")
    return {"centers": centers, "bonds": double, "unsupported": sorted(set(unsupported))}


def _integer_array(raw, key, n, low, high, required=False):
    values = raw.get(key)
    if values is None:
        if required:
            raise ValueError(f"JSON {key} must contain one integer per atom")
        return None
    if not isinstance(values, list) or len(values) != n or any(type(x) is not int or not low <= x <= high for x in values):
        raise ValueError(f"JSON {key} must contain one integer per atom ({low}..{high})")
    return values


def _record_input(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get("atoms"), list):
        raise ValueError("JSON molecule must contain an atoms array")
    atoms = raw["atoms"]
    n = len(atoms)
    if not 1 <= n <= MAX_ATOMS or any(not isinstance(e, str) for e in atoms):
        raise ValueError(f"JSON atoms must contain 1..{MAX_ATOMS} element symbols")
    charges = _integer_array(raw, "charges", n, -16, 16, required=True)
    isotopes = _integer_array(raw, "isotopes", n, 0, 400)
    hydrogens = _integer_array(raw, "hydrogens", n, 0, 16)
    ids = raw.get("atomIds")
    if raw.get("schema") not in (None, "bond-atlas/3"):
        raise ValueError("Unsupported molecule JSON schema; use bond-atlas/3")
    block = raw.get("molblock")
    if block is not None:
        if not isinstance(block, str) or len(block) > MAX_TEXT:
            raise ValueError("Invalid JSON molblock")
        mol = Chem.MolFromMolBlock(block, sanitize=True, removeHs=False, strictParsing=True)
        _check_mol(mol)
        if mol.GetNumAtoms() != n:
            raise ValueError("JSON atoms and molblock atom count disagree")
        # A mapped MOL may have been reordered without changing its identities.
        if ids and all(isinstance(x, str) and re.fullmatch(r"a[1-9][0-9]*", x) for x in ids):
            by_map = {a.GetAtomMapNum(): a.GetIdx() for a in mol.GetAtoms()}
            wanted = [int(x[1:]) for x in ids]
            if len(by_map) == n and set(wanted) == set(by_map):
                mol = Chem.RenumberAtoms(mol, [by_map[x] for x in wanted])
        if [a.GetSymbol() for a in mol.GetAtoms()] != atoms:
            raise ValueError("JSON element array disagrees with authoritative molblock")
        if [a.GetFormalCharge() for a in mol.GetAtoms()] != charges:
            raise ValueError("JSON charges disagree with authoritative molblock")
        if isotopes is not None and [a.GetIsotope() for a in mol.GetAtoms()] != isotopes:
            raise ValueError("JSON isotopes disagree with authoritative molblock")
        if hydrogens is not None and [a.GetTotalNumHs() for a in mol.GetAtoms()] != hydrogens:
            raise ValueError("JSON hydrogen counts disagree with authoritative molblock")
        supplied_bonds = raw.get("bonds")
        if supplied_bonds is not None:
            _validate_bonds(supplied_bonds, n)
            actual = {(min(b["a"], b["b"]), max(b["a"], b["b"])): (b["order"], b["aromatic"]) for b in _bonds(mol)}
            given = {(min(b["a"], b["b"]), max(b["a"], b["b"])): (b["order"], bool(b.get("aromatic", False))) for b in supplied_bonds}
            # Different Kekule forms describe the same aromatic bonds.
            if set(actual) != set(given) or any(actual[k][1] != given[k][1] or (not actual[k][1] and actual[k][0] != given[k][0]) for k in actual):
                raise ValueError("JSON bonds disagree with authoritative molblock")
    else:
        if raw.get("schema") == "bond-atlas/3" or raw.get("stereo"):
            raise ValueError("Stereochemistry-bearing v3 JSON requires its authoritative mapped molblock")
        bonds = raw.get("bonds")
        _validate_bonds(bonds, n)
        rw = Chem.RWMol()
        try:
            for i, symbol in enumerate(atoms):
                atom = Chem.Atom(symbol)
                atom.SetFormalCharge(charges[i])
                if isotopes:
                    atom.SetIsotope(isotopes[i])
                if hydrogens is not None:
                    atom.SetNoImplicit(True)
                    atom.SetNumExplicitHs(hydrogens[i])
                rw.AddAtom(atom)
            for bond in bonds:
                kind = Chem.BondType.AROMATIC if bond.get("aromatic") else {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}[bond["order"]]
                rw.AddBond(bond["a"], bond["b"], kind)
                if bond.get("aromatic"):
                    rw.GetAtomWithIdx(bond["a"]).SetIsAromatic(True)
                    rw.GetAtomWithIdx(bond["b"]).SetIsAromatic(True)
            mol = _check_mol(rw.GetMol())
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Invalid molecular JSON graph: {exc}") from exc
    _set_ids(mol, ids)
    if "charge" in raw and (type(raw["charge"]) is not int or raw["charge"] != Chem.GetFormalCharge(mol)):
        raise ValueError("JSON total charge disagrees with per-atom formal charges")
    return mol


def _validate_bonds(bonds, n):
    if not isinstance(bonds, list) or len(bonds) > n * 8:
        raise ValueError("JSON bonds must be a bounded array")
    seen = set()
    for bond in bonds:
        if not isinstance(bond, dict) or type(bond.get("a")) is not int or type(bond.get("b")) is not int or type(bond.get("order")) is not int or bond["order"] not in (1, 2, 3):
            raise ValueError("JSON bonds require integer a/b indices and order 1, 2 or 3")
        a, b = bond["a"], bond["b"]
        if not 0 <= a < n or not 0 <= b < n or a == b or tuple(sorted((a, b))) in seen:
            raise ValueError("JSON contains an invalid or duplicate bond")
        if "aromatic" in bond and not isinstance(bond["aromatic"], bool):
            raise ValueError("JSON aromatic flags must be booleans")
        seen.add(tuple(sorted((a, b))))


def _draft_input(payload):
    """Apply sketch edits by identity, never via a neutral legacy graph."""
    draft = payload.get("draft")
    if not isinstance(draft, dict) or not isinstance(draft.get("atoms"), list) or not 1 <= len(draft["atoms"]) <= MAX_ATOMS:
        raise ValueError("draft requires a bounded atoms array")
    source = payload.get("sourceRecord", draft.get("sourceRecord"))
    old = _record_input(source) if source is not None else None
    old_atoms = {_aid(a): a for a in old.GetAtoms()} if old is not None else {}
    atoms, ids, positions = [], [], {}
    for i, item in enumerate(draft["atoms"]):
        if not isinstance(item, dict):
            raise ValueError("draft atoms must be objects")
        identity = item.get("id", item.get("atomId", f"a{i+1}"))
        if not isinstance(identity, str) or not identity or len(identity) > 100 or identity in ids:
            raise ValueError("draft atom IDs must be unique nonempty strings")
        previous = old_atoms.get(identity)
        element = item.get("e", item.get("element", previous.GetSymbol() if previous is not None else None))
        if not isinstance(element, str):
            raise ValueError("draft atoms require element symbols")
        charge = item.get("charge", previous.GetFormalCharge() if previous is not None else 0)
        isotope = item.get("isotope", previous.GetIsotope() if previous is not None else 0)
        if type(charge) is not int or not -16 <= charge <= 16 or type(isotope) is not int or not 0 <= isotope <= 400:
            raise ValueError("draft formal charges/isotopes must be supported integers")
        x, y = _finite(item.get("x", 0), "draft x"), _finite(item.get("y", 0), "draft y")
        positions[identity] = (x, y)
        atoms.append((identity, element, charge, isotope))
        ids.append(identity)
    bonds = draft.get("bonds")
    _validate_bonds(bonds, len(atoms))
    old_bonds = {frozenset((_aid(old.GetAtomWithIdx(b["a"])), _aid(old.GetAtomWithIdx(b["b"])))): b["order"] for b in _bonds(old)} if old is not None else {}
    new_bonds = {frozenset((ids[b["a"]], ids[b["b"]])): b["order"] for b in bonds}
    changed = set(old_atoms) ^ set(ids)
    for identity, element, charge, isotope in atoms:
        previous = old_atoms.get(identity)
        if previous is None or (element, charge, isotope) != (previous.GetSymbol(), previous.GetFormalCharge(), previous.GetIsotope()):
            changed.add(identity)
    for key in set(old_bonds) | set(new_bonds):
        if old_bonds.get(key) != new_bonds.get(key):
            changed.update(key)
    chemical_change = bool(changed)
    if old is not None:
        working = Chem.Mol(old)
        if chemical_change:
            Chem.Kekulize(working, clearAromaticFlags=True)
        rw = Chem.RWMol(working)
        for index in reversed(range(rw.GetNumAtoms())):
            if _aid(rw.GetAtomWithIdx(index)) not in ids:
                rw.RemoveAtom(index)
    else:
        rw = Chem.RWMol()
    by_id = {_aid(a): a.GetIdx() for a in rw.GetAtoms()}
    next_map = max((a.GetAtomMapNum() for a in rw.GetAtoms()), default=0) + 1
    for identity, element, charge, isotope in atoms:
        try:
            if identity in by_id:
                atom = rw.GetAtomWithIdx(by_id[identity])
                atom.SetAtomicNum(Chem.GetPeriodicTable().GetAtomicNumber(element))
            else:
                atom = Chem.Atom(element)
                atom.SetProp("_AtlasId", identity)
                atom.SetAtomMapNum(next_map)
                next_map += 1
                by_id[identity] = rw.AddAtom(atom)
                atom = rw.GetAtomWithIdx(by_id[identity])
            atom.SetFormalCharge(charge)
            atom.SetIsotope(isotope)
            if identity in changed and atom.GetAtomicNum() != 1:
                atom.SetNumExplicitHs(0)
                atom.SetNoImplicit(False)
        except Exception as exc:
            raise ValueError(f"Unsupported draft element or atom: {element}") from exc
    # Preserve untouched bond objects (and their stereo atom references).
    for bond in list(rw.GetBonds()):
        key = frozenset((_aid(bond.GetBeginAtom()), _aid(bond.GetEndAtom())))
        if key not in new_bonds or old_bonds.get(key) != new_bonds[key]:
            rw.RemoveBond(bond.GetBeginAtomIdx(), bond.GetEndAtomIdx())
    kinds = {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}
    for entry in bonds:
        a, b = by_id[ids[entry["a"]]], by_id[ids[entry["b"]]]
        if rw.GetBondBetweenAtoms(a, b) is None:
            rw.AddBond(a, b, kinds[entry["order"]])
    affected = set(changed)
    for key in set(old_bonds) | set(new_bonds):
        if key & changed:
            affected.update(key)
    invalidated = []
    for atom in rw.GetAtoms():
        if _aid(atom) in affected and atom.GetChiralTag() != _CT.CHI_UNSPECIFIED:
            invalidated.append(_aid(atom))
            atom.SetChiralTag(_CT.CHI_UNSPECIFIED)
    clear_directions = set(affected)
    for bond in rw.GetBonds():
        ends = {_aid(bond.GetBeginAtom()), _aid(bond.GetEndAtom())}
        if ends & affected and bond.GetStereo() != Chem.BondStereo.STEREONONE:
            invalidated.append(_bond_id(bond))
            bond.SetStereo(Chem.BondStereo.STEREONONE)
            clear_directions.update(ends)
    if chemical_change:
        for bond in rw.GetBonds():
            if {_aid(bond.GetBeginAtom()), _aid(bond.GetEndAtom())} & clear_directions:
                bond.SetBondDir(Chem.BondDir.NONE)
    mol = rw.GetMol()
    mol = Chem.RenumberAtoms(mol, [by_id[x] for x in ids])
    mol.RemoveAllConformers()
    conf = Chem.Conformer(len(ids))
    conf.Set3D(False)
    for index, identity in enumerate(ids):
        conf.SetAtomPosition(index, Point3D(*positions[identity], 0))
    mol.AddConformer(conf, assignId=True)
    mol.UpdatePropertyCache(strict=False)
    _check_mol(mol)
    _set_ids(mol, ids)
    warnings = []
    raw = source if old is not None and not chemical_change and ids == [_aid(a) for a in old.GetAtoms()] else None
    if invalidated:
        warnings.append("Stereo assignments invalidated near chemical edits: " + ", ".join(sorted(set(invalidated))))
    if old is not None and raw is None and source.get("conformers"):
        warnings.append("Previous 3D conformers discarded after molecular graph/atom-order edits")
    if warnings:
        mol.SetProp("_AtlasWarnings", json.dumps(warnings))
    return mol, raw


def _inputs(payload):
    if payload.get("draft") is not None:
        return [_draft_input(payload)]
    if payload.get("molecule") is not None:
        raw = payload["molecule"]
        return [(_record_input(raw), raw)]
    text = payload.get("text")
    fmt = str(payload.get("format", "smiles")).lower()
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ValueError("Provide nonempty structure text (at most 2 MB) or a v3 molecule")
    if fmt == "json":
        try:
            data = json.loads(text, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(f"Invalid JSON number {x}")))
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"Invalid molecule JSON: {exc}") from exc
        records = data.get("molecules", [data]) if isinstance(data, dict) else data
        if not isinstance(records, list) or not 1 <= len(records) <= MAX_ISOMERS:
            raise ValueError("JSON must contain between 1 and 64 molecules")
        return [(_record_input(raw), raw) for raw in records]
    if fmt == "smiles":
        params = Chem.SmilesParserParams()
        params.removeHs = False
        params.parseName = False
        lines = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith('//')]
        if not lines or len(lines) > MAX_ISOMERS:
            raise ValueError('Import between 1 and 64 SMILES records.')
        records = []
        for index, line in enumerate(lines):
            if len(line) > 20000:
                raise ValueError('A SMILES record exceeds its text budget.')
            list_names = bool(payload.get('allowNames')) or len(lines) > 1
            smiles = line if '|' in line or not list_names else line.split()[0]
            try:
                mol = Chem.MolFromSmiles(smiles, params)
                records.append((_set_ids(_check_mol(mol)), None))
            except ValueError as error:
                raise ValueError(f'Invalid SMILES record {index + 1}: {error}') from error
        return records
    if fmt in ("mol", "molfile", "v2000", "v3000"):
        mol = Chem.MolFromMolBlock(text, sanitize=True, removeHs=False, strictParsing=True)
        return [(_set_ids(_check_mol(mol)), None)]
    if fmt == "sdf":
        if text.count("$$$$") > MAX_ISOMERS:
            raise ValueError("At most 64 SDF records are supported")
        supplier = Chem.ForwardSDMolSupplier(io.BytesIO(text.encode()), sanitize=True, removeHs=False, strictParsing=True)
        result = []
        for index, mol in enumerate(supplier):
            if index >= MAX_ISOMERS:
                raise ValueError("At most 64 SDF records are supported")
            try:
                result.append((_set_ids(_check_mol(mol)), None))
            except ValueError as exc:
                raise ValueError(f"Invalid SDF record {index + 1}: {exc}") from exc
        if not result:
            raise ValueError("SDF contains no molecules")
        return result
    raise ValueError("Supported input formats are smiles, mol, sdf and json")


def _one(payload):
    items = _inputs(payload)
    if len(items) != 1:
        raise ValueError("This operation requires exactly one molecule")
    mol, raw = items[0]
    target = payload.get("invertAtomId")
    if target is not None:
        idx = _atom_index(mol, target)
        atom = mol.GetAtomWithIdx(idx)
        if atom.GetChiralTag() not in _TETRA:
            raise ValueError("Inversion requires a specified tetrahedral stereocenter")
        atom.InvertChirality()
        _assign(mol)
        mol.RemoveAllConformers()
        raw = None  # Old coordinates would describe the opposite stereoisomer.
    return mol, raw


def _atom_index(mol, identity):
    if isinstance(identity, str):
        for atom in mol.GetAtoms():
            if _aid(atom) == identity:
                return atom.GetIdx()
    elif type(identity) is int and 0 <= identity < mol.GetNumAtoms():
        return identity
    raise ValueError(f"Unknown mapped atom: {identity!r}")


def _counts(mol):
    return Counter(a.GetSymbol() for a in Chem.AddHs(mol).GetAtoms())


def _formula(counts):
    order = (["C", "H"] if counts.get("C") else []) + sorted(e for e in counts if not counts.get("C") or e not in ("C", "H"))
    return "".join(e + (str(counts[e]) if counts[e] != 1 else "") for e in order if counts[e])


def _depiction(mol, displayed):
    supplied_2d = bool(mol.GetNumConformers() and not mol.GetConformer().Is3D())
    drawing = _with_hs(mol, add_coords=supplied_2d) if displayed else Chem.Mol(mol)
    if not supplied_2d:
        drawing.RemoveAllConformers()
        rdDepictor.Compute2DCoords(drawing, canonOrient=True)
    # Maps are internal identities, not labels. Preserve identities as atom props.
    for atom in drawing.GetAtoms():
        atom.SetAtomMapNum(0)
    drawer = rdMolDraw2D.MolDraw2DSVG(520, 360)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.drawOptions().useBWAtomPalette()
    drawer.drawOptions().clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, drawing)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()
    conf = drawing.GetConformer()
    atoms = []
    base_n = mol.GetNumAtoms()
    for atom in drawing.GetAtoms():
        i = atom.GetIdx()
        pos = conf.GetAtomPosition(i)
        parent = i if i < base_n else atom.GetNeighbors()[0].GetIdx()
        atoms.append({"e": atom.GetSymbol(), "x": float(pos.x), "y": float(pos.y), "atomId": _aid(atom), "heavyIndex": parent, "h": int(atom.GetTotalNumHs())})
    return svg, {"atoms": atoms, "bonds": _bonds(drawing)}


def _molblock(mol, v3000=True):
    try:
        if not v3000 and any(a.GetAtomMapNum() > 999 for a in mol.GetAtoms()):
            raise ValueError("V2000 cannot preserve atom-map numbers above 999; use V3000")
        block = Chem.MolToMolBlock(mol, includeStereo=True, forceV3000=v3000)
        restored = Chem.MolFromMolBlock(block, sanitize=True, removeHs=False, strictParsing=True)
        if restored is None or _canonical(restored) != _canonical(mol):
            raise ValueError("MOL cannot faithfully preserve these molecular/stereo features in this RDKit build")
        if [a.GetAtomMapNum() for a in restored.GetAtoms()] != [a.GetAtomMapNum() for a in mol.GetAtoms()]:
            raise ValueError("MOL cannot faithfully preserve the supplied atom mapping")
        return block
    except Exception as exc:
        raise ValueError(f"Cannot export molecular features to MOL: {exc}") from exc


def _record(mol, conformers=None, warnings=None):
    _set_ids(mol)
    stereo = _stereo(mol)
    notation = _canonical(mol)
    conn_notation = _canonical(mol, stereo=False)
    sid = _hash("stereo-", notation)
    counts = _counts(mol)
    charge = Chem.GetFormalCharge(mol)
    dbe = None
    if charge == 0 and not any(a.GetNumRadicalElectrons() for a in mol.GetAtoms()) and set(counts) <= {"C", "H", "N", "O", "S", "F", "Cl", "Br", "I"}:
        dbe = (2 * counts.get("C", 0) + 2 + counts.get("N", 0) - counts.get("H", 0) - sum(counts.get(x, 0) for x in ("F", "Cl", "Br", "I"))) / 2
        if len(Chem.GetMolFrags(mol)) != 1:
            dbe = None
    known = _KNOWN.get(conn_notation)
    if known is None:  # Canonicalization of disconnected fragments can change order.
        known = next((name for smiles, name in _KNOWN.items() if _canonical(Chem.MolFromSmiles(smiles), False) == conn_notation), None)
    skeletal_svg, skeletal = _depiction(mol, False)
    displayed_svg, displayed = _depiction(mol, True)
    tags = [name for name, query in _TAG_QUERIES.items() if mol.HasSubstructMatch(query)]
    for atom in mol.GetAtoms():
        if atom.GetAtomicNum() != 6 or atom.GetHybridization() != Chem.HybridizationType.SP3:
            continue
        neighbors = list(atom.GetNeighbors())
        carbons = sum(n.GetAtomicNum() == 6 for n in neighbors)
        level = 'primary' if carbons <= 1 else 'secondary' if carbons == 2 else 'tertiary'
        if 'alcohol' in tags and any(n.GetAtomicNum() == 8 and n.GetFormalCharge() == 0 and n.GetTotalNumHs(includeNeighbors=True) > 0 for n in neighbors):
            tags.append(level + '-alcohol')
        if 'halogenoalkane' in tags and any(n.GetAtomicNum() in (9, 17, 35, 53) for n in neighbors):
            tags.append(level + '-halogenoalkane')
    if all(a.GetAtomicNum() in (1, 6) for a in mol.GetAtoms()) and all(b.GetBondType() == Chem.BondType.SINGLE for b in mol.GetBonds()):
        tags.append('alkane')
    tags = list(dict.fromkeys(tags))
    if any(a.GetIsAromatic() for a in mol.GetAtoms()):
        tags.append("aromatic")
    if mol.GetRingInfo().NumRings():
        tags.append("cyclic")
    notes = list(warnings or [])
    if mol.HasProp("_AtlasWarnings"):
        notes.extend(json.loads(mol.GetProp("_AtlasWarnings")))
    if stereo["unsupported"]:
        notes.append("Some stereo features are retained but not supported for enumeration/projection")
    if len(Chem.GetMolFrags(mol)) > 1:
        notes.append("Disconnected structure: interfragment assembly is not thermodynamically ranked")
    return {
        "provenance": {"toolkit": "RDKit", "version": rdBase.rdkitVersion, "identity": "mapped chemical state; canonical identity excludes transport atom maps"},
        "schema": "bond-atlas/3", "id": sid, "connectivityId": _hash("conn-", conn_notation), "stereoisomerId": sid, "mirrorStereoisomerId": _mirror_identity(mol, stereo),
        "name": known or notation, "knownName": known is not None, "notation": notation,
        "formula": _display_formula(mol), "charge": charge,
        "atoms": [a.GetSymbol() for a in mol.GetAtoms()], "atomIds": [_aid(a) for a in mol.GetAtoms()],
        "charges": [a.GetFormalCharge() for a in mol.GetAtoms()], "isotopes": [a.GetIsotope() for a in mol.GetAtoms()],
        "radicals": [a.GetNumRadicalElectrons() for a in mol.GetAtoms()], "lonePairCounts": _lone_pair_counts(mol),
        "hydrogens": [a.GetTotalNumHs() for a in mol.GetAtoms()], "bonds": _bonds(mol),
        "metadata": {"counts": dict(counts), "mass": float(Descriptors.MolWt(mol)), "heavy": mol.GetNumHeavyAtoms(), "dbe": dbe},
        "tags": tags, "stability": {"score": 0, "label": "Not stability-ranked", "reasons": [], "method": "RDKit connectivity/stereochemistry; no thermodynamic stability model"},
        "stereo": stereo, "molblock": _molblock(mol), "depictionId": _hash('depiction-', skeletal_svg + displayed_svg), "depictions": {"skeletal": skeletal_svg, "displayed": displayed_svg},
        "layouts": {"skeletal": skeletal, "displayed": displayed}, "conformers": list(conformers or []), "warnings": list(dict.fromkeys(notes)),
    }


def _display_formula(mol):
    formula = rdMolDescriptors.CalcMolFormula(mol, separateIsotopes=True, abbreviateHIsotopes=False)
    charge = Chem.GetFormalCharge(mol)
    if charge:
        suffix = ('+' if charge > 0 else '-') + (str(abs(charge)) if abs(charge) > 1 else '')
        if formula.endswith(suffix):
            formula = formula[:-len(suffix)]
    return formula


def _mirror_identity(mol, stereo):
    if stereo['unsupported'] or any(not item['specified'] for item in stereo['centers'] + stereo['bonds']):
        return None
    mirror = Chem.Mol(mol)
    for atom in mirror.GetAtoms():
        if atom.GetChiralTag() in _TETRA:
            atom.InvertChirality()
    _assign(mirror)
    return _hash('stereo-', _canonical(mirror))


def _lone_pair_counts(mol):
    copy = Chem.Mol(mol)
    try:
        Chem.Kekulize(copy, clearAromaticFlags=True)
    except Exception:
        return [None] * mol.GetNumAtoms()
    supported = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 34, 35, 53}
    result = []
    table = Chem.GetPeriodicTable()
    for atom in copy.GetAtoms():
        if atom.GetAtomicNum() not in supported:
            result.append(None)
            continue
        electrons = table.GetNOuterElecs(atom.GetAtomicNum()) - atom.GetFormalCharge() - atom.GetTotalValence() - atom.GetNumRadicalElectrons()
        result.append(int(electrons // 2) if 0 <= electrons <= 8 and electrons % 2 == 0 else None)
    return result


def _expected_stereo(mol):
    st = _stereo(mol)
    return ({c["atom"]: c["cip"] for c in st["centers"] if c["specified"] and c["cip"]},
            {tuple(sorted((b["a"], b["b"]))): b["descriptor"] for b in st["bonds"] if b["specified"]})


def _verify_3d(mol, conf_id=-1):
    if not mol.GetNumConformers() or not mol.GetConformer(conf_id).Is3D():
        raise ValueError("A three-dimensional conformer is required for stereo verification")
    conf = mol.GetConformer(conf_id)
    for i in range(mol.GetNumAtoms()):
        if not all(math.isfinite(v) for v in conf.GetAtomPosition(i)):
            raise ValueError("Nonfinite 3D coordinates")
    for bond in mol.GetBonds():
        a, b = conf.GetAtomPosition(bond.GetBeginAtomIdx()), conf.GetAtomPosition(bond.GetEndAtomIdx())
        if (a - b).Length() < 1e-5:
            raise ValueError("Degenerate 3D geometry: bonded atoms coincide")
    expected_atoms, expected_bonds = _expected_stereo(mol)
    if _stereo(mol)["unsupported"]:
        raise ValueError("Independent 3D verification does not support this stereochemistry")
    probe = Chem.Mol(mol)
    Chem.RemoveStereochemistry(probe)
    if not hasattr(Chem, "AssignStereochemistryFrom3D"):
        raise ValueError("This RDKit build cannot verify stereochemistry from coordinates")
    Chem.AssignStereochemistryFrom3D(probe, confId=conf_id, replaceExistingTags=True)
    _assign(probe)
    actual_atoms, actual_bonds = _expected_stereo(probe)
    for idx, cip in expected_atoms.items():
        if actual_atoms.get(idx) != cip:
            raise ValueError(f"3D stereochemistry mismatch at {_aid(mol.GetAtomWithIdx(idx))}: expected {cip}, found {actual_atoms.get(idx)}")
    for pair, descriptor in expected_bonds.items():
        if actual_bonds.get(pair) != descriptor:
            raise ValueError(f"3D double-bond stereochemistry mismatch at atoms {pair}")
    return {"verified": True, "centersChecked": len(expected_atoms), "bondsChecked": len(expected_bonds), "method": "Independent RDKit stereochemistry assignment from 3D coordinates"}


def _forcefield(mol):
    if len(Chem.GetMolFrags(mol)) != 1:
        return None, "unoptimized-disconnected"
    try:
        if AllChem.MMFFHasAllMoleculeParams(mol):
            props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
            ff = AllChem.MMFFGetMoleculeForceField(mol, props)
            if ff is not None:
                return ff, "MMFF94"
    except Exception:
        pass
    try:
        if AllChem.UFFHasAllMoleculeParams(mol):
            ff = AllChem.UFFGetMoleculeForceField(mol)
            if ff is not None:
                return ff, "UFF"
    except Exception:
        pass
    return None, "unoptimized"


def _optimize(mol, max_iters, torsion=None):
    ff, method = _forcefield(mol)
    if ff is None:
        return {"energy": None, "method": method, "converged": False}
    try:
        if torsion is not None:
            i, j, k, l, angle = torsion
            add = getattr(ff, "MMFFAddTorsionConstraint" if method == "MMFF94" else "UFFAddTorsionConstraint", None)
            if add is None:
                return {"energy": None, "method": "unoptimized", "converged": False, "optimizationWarning": "This RDKit build lacks torsion constraints"}
            add(i, j, k, l, False, angle - 0.1, angle + 0.1, 1000.0)
        ff.Initialize()
        result = ff.Minimize(maxIts=max_iters)
        energy = float(ff.CalcEnergy())
        if not math.isfinite(energy):
            raise ValueError("Force field returned a nonfinite energy")
        return {"energy": energy, "method": method, "converged": result == 0}
    except Exception as exc:
        return {"energy": None, "method": "unoptimized", "converged": False, "optimizationWarning": f"Force-field optimization unavailable: {exc}"}


def _state(mol, base_n, opt, source, seed, index):
    conf = mol.GetConformer()
    atoms = []
    for atom in mol.GetAtoms():
        i = atom.GetIdx()
        p = conf.GetAtomPosition(i)
        xyz = [float(p.x), float(p.y), float(p.z)]
        if not all(math.isfinite(x) for x in xyz):
            raise ValueError("Nonfinite 3D coordinates")
        atoms.append({"e": atom.GetSymbol(), "x": xyz[0], "y": xyz[1], "z": xyz[2], "atomId": _aid(atom), "heavyIndex": i if i < base_n else atom.GetNeighbors()[0].GetIdx()})
    identity = _canonical(mol) + json.dumps([[a["atomId"], a["x"], a["y"], a["z"]] for a in atoms], separators=(",", ":")) + f"/{index}/{seed}"
    state = {"id": _hash("conf-", identity), "atoms": atoms,
             "bonds": [{"a": b["a"], "b": b["b"], "order": b["order"]} for b in _bonds(mol)],
             "energy": opt["energy"], "relativeEnergy": None, "energyUnit": "kcal/mol" if opt["energy"] is not None else None, "energyUnits": "kcal/mol" if opt["energy"] is not None else None,
             "method": opt["method"], "converged": opt["converged"], "source": source, "seed": seed,
             "stereoVerification": _verify_3d(mol)}
    if opt.get("optimizationWarning"):
        state["warnings"] = [opt["optimizationWarning"]]
    return state


def _relative_energies(states):
    minima = {}
    for state in states:
        e = state["energy"]
        if e is not None:
            minima[state["method"]] = min(e, minima.get(state["method"], e))
    for state in states:
        e = state["energy"]
        state["relativeEnergy"] = max(0.0, e - minima[state["method"]]) if e is not None else None


def _state_mol(base, state):
    if not isinstance(state, dict) or not isinstance(state.get("atoms"), list):
        raise ValueError("Invalid conformer record")
    full = _with_hs(base)
    entries = state["atoms"]
    if len(entries) != full.GetNumAtoms():
        raise ValueError("Conformer must include every base atom followed by added hydrogens")
    conf = Chem.Conformer(full.GetNumAtoms())
    conf.Set3D(True)
    for i, (atom, entry) in enumerate(zip(full.GetAtoms(), entries)):
        if not isinstance(entry, dict) or entry.get("atomId") != _aid(atom) or entry.get("e") != atom.GetSymbol():
            raise ValueError("Conformer atom order/identity disagrees with mapped base atoms")
        conf.SetAtomPosition(i, Point3D(*[_finite(entry.get(k), f"coordinate {k}") for k in ("x", "y", "z")]))
    full.RemoveAllConformers()
    full.AddConformer(conf, assignId=True)
    _verify_3d(full)
    return full


def _torsion_indices(full, ids):
    if not isinstance(ids, list) or len(ids) != 4:
        raise ValueError("A torsion edit requires four mapped atomIds")
    indices = [_atom_index(full, item) for item in ids]
    if len(set(indices)) != 4:
        raise ValueError("A torsion requires four distinct atoms")
    i, j, k, l = indices
    if not all(full.GetBondBetweenAtoms(a, b) is not None for a, b in ((i, j), (j, k), (k, l))):
        raise ValueError("Torsion atoms must form a bonded four-atom path")
    bond = full.GetBondBetweenAtoms(j, k)
    if bond.GetBondType() != Chem.BondType.SINGLE or bond.GetIsAromatic() or bond.IsInRing() or bond.GetIsConjugated():
        raise ValueError("Torsion edits require an acyclic, nonconjugated rotatable single bond")
    if any(full.GetAtomWithIdx(x).GetAtomicNum() == 1 or sum(n.GetAtomicNum() > 1 for n in full.GetAtomWithIdx(x).GetNeighbors()) < 2 for x in (j, k)):
        raise ValueError("The central bond is terminal, not a rotatable heavy-atom bond")
    return indices


def _validated_torsion(full, state, parent_ids):
    info = state["torsion"]
    if not isinstance(info, dict) or state.get("source") != "constrained-torsion":
        raise ValueError("Invalid constrained-torsion provenance")
    ids = info.get("atomIds")
    if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
        raise ValueError("Torsion provenance requires mapped atomIds")
    indices = _torsion_indices(full, ids)
    requested = _finite(info.get("requestedAngle"), "requested torsion angle")
    requested = (requested + 180) % 360 - 180
    claimed = _finite(info.get("angle"), "measured torsion angle")
    actual = _finite(float(rdMolTransforms.GetDihedralDeg(full.GetConformer(), *indices)), "coordinate torsion angle")
    if abs((actual - claimed + 180) % 360 - 180) > 1e-4:
        raise ValueError("Torsion provenance angle disagrees with its coordinates")
    if abs((actual - requested + 180) % 360 - 180) > 2.0:
        raise ValueError("Torsion provenance does not satisfy its requested angle")
    result = {"atomIds": [_aid(full.GetAtomWithIdx(i)) for i in indices], "requestedAngle": requested, "angle": actual}
    if "parentConformerId" in info:
        parent = info["parentConformerId"]
        if not isinstance(parent, str) or parent not in parent_ids:
            raise ValueError("Torsion parentConformerId must identify an earlier validated conformer")
        result["parentConformerId"] = parent
    return result


def _existing_states(mol, raw):
    if raw is None or not raw.get("conformers"):
        return []
    states = raw["conformers"]
    if not isinstance(states, list) or len(states) > MAX_CONFORMERS:
        raise ValueError("At most 50 conformers are supported")
    stereo = _stereo(mol)
    if len(states) > 1 and any(not item['specified'] for item in stereo['centers'] + stereo['bonds']):
        raise ValueError('A conformer ensemble requires specified stereochemistry so that different stereoisomers are not silently mixed.')
    clean = []
    for i, state in enumerate(states):
        full = _state_mol(mol, state)
        energy = state.get("energy")
        if energy is not None:
            energy = _finite(energy, "conformer energy")
        method = state.get("method", "unoptimized")
        if method not in ("MMFF94", "UFF", "unoptimized", "unoptimized-disconnected", "supplied"):
            raise ValueError("Unknown conformer energy method")
        if energy is not None and (method not in ("MMFF94", "UFF") or len(Chem.GetMolFrags(mol)) != 1):
            raise ValueError("Conformer energies require a connected structure and a declared force-field method")
        validated = _state(full, mol.GetNumAtoms(), {"energy": energy, "method": method, "converged": bool(state.get("converged"))}, str(state.get("source", "imported")), state.get("seed"), i)
        if "torsion" in state:
            validated["torsion"] = _validated_torsion(full, state, {c["id"] for c in clean})
        clean.append(validated)
        # IDs are recomputed from geometry/index/seed. An imported stale ID must
        # never identify changed coordinates as an unchanged conformer.
    _relative_energies(clean)
    return clean


def _selected(mol, raw, payload):
    states = _existing_states(mol, raw)
    if states:
        key = payload.get("conformerId")
        if key is None:
            key = payload.get("conformerIndex")
        if key is None:
            key = raw.get("selectedConformerId") if raw else None
        if key is None:
            key = 0
        if isinstance(key, str):
            selected = next((x for x in states if x["id"] == key), None)
            if selected is None:
                raise ValueError("Unknown conformerId")
        else:
            index = _bounded(key, 0, len(states) - 1, "conformerIndex", lower=0)
            selected = states[index]
        return _state_mol(mol, selected), selected, states
    if mol.GetNumConformers() and mol.GetConformer().Is3D():
        full = _with_hs(mol, add_coords=True)
        state = _state(full, mol.GetNumAtoms(), {"energy": None, "method": "supplied", "converged": False}, "supplied3D", None, 0)
        return full, state, [state]
    raise ValueError("Generate or supply and select a 3D conformer first")


def parse(payload):
    if payload.get("invertAtomId") is not None:
        mol, raw = _one(payload)
        return {"molecules": [_record(mol)], "warnings": []}
    records = []
    for mol, raw in _inputs(payload):
        record = _record(mol, _existing_states(mol, raw))
        selected = raw.get('selectedConformerId') if raw else None
        if selected:
            if not any(c['id'] == selected for c in record['conformers']):
                raise ValueError('The selected conformer ID does not match its validated coordinates.')
            record['selectedConformerId'] = selected
        records.append(record)
    return {"molecules": records, "warnings": []}


def enumerate_stereoisomers(payload):
    mol, _ = _one(payload)
    cap = _bounded(payload.get("maxIsomers", payload.get("cap")), MAX_ISOMERS, MAX_ISOMERS, "maxIsomers")
    unsupported = _stereo(mol)["unsupported"]
    if unsupported:
        warnings = ["Unsupported stereo features: exhaustive enumeration is not claimed"]
        try:
            records = [_record(mol)]
        except ValueError as exc:
            # Some RDKit stereo types (e.g. square planar) can be read from
            # SMILES but not written to MOL. Do not emit a lossy v3 record.
            records = []
            warnings.append(str(exc))
        return {"molecules": records, "complete": False, "capped": False, "count": len(records), "unsupported": unsupported, "warnings": warnings}
    options = StereoEnumerationOptions(onlyUnassigned=not bool(payload.get("enumerateAll", False)), unique=True, tryEmbedding=False, maxIsomers=cap + 1)
    # Atom maps are transport labels, not chemical distinctions. Leaving them
    # present defeats symmetry/meso deduplication inside RDKit's unique option.
    unmapped = Chem.Mol(mol)
    for atom in unmapped.GetAtoms():
        atom.SetIntProp("_AtlasMap", atom.GetAtomMapNum())
        atom.SetAtomMapNum(0)
    try:
        isomers = list(EnumerateStereoisomers(unmapped, options=options))
    except Exception as exc:
        raise ValueError(f"Stereoisomer enumeration failed: {exc}") from exc
    capped = len(isomers) > cap
    for item in isomers:
        for atom in item.GetAtoms():
            atom.SetAtomMapNum(atom.GetIntProp("_AtlasMap"))
    records = [_record(_set_ids(Chem.Mol(item))) for item in isomers[:cap]]
    records.sort(key=lambda x: x["notation"])
    return {"molecules": records, "complete": not capped, "capped": capped, "count": len(records), "unsupported": [],
            "warnings": [f"Stereoisomer cap {cap} reached; results are not exhaustive"] if capped else []}


def conformers(payload):
    mol, raw = _one(payload)
    stereo = _stereo(mol)
    if stereo["unsupported"]:
        raise ValueError("Conformer generation cannot independently verify these unsupported stereo features")
    if any(not item['specified'] for item in stereo['centers'] + stereo['bonds']):
        raise ValueError('Generate possible stereoisomers and select a specified configuration before sampling conformers. An ensemble must not silently mix stereoisomers.')
    n = _bounded(payload.get("count", payload.get("numConfs", payload.get("numConformers"))), 10, MAX_CONFORMERS, "count")
    seed = _bounded(payload.get("seed"), DEFAULT_SEED, 2_147_483_646, "seed", lower=0)
    iterations = _bounded(payload.get("maxIterations"), 300, 1000, "maxIterations")
    states, failures, warnings = [], [], []
    preserve = bool(payload.get("preserveSupplied3D", payload.get("preserve3D", True)))
    if preserve:
        existing = _existing_states(mol, raw)
        if existing:
            # Preserve, do not silently optimize or replace, the selected geometry.
            work, selected, _ = _selected(mol, raw, payload)
            preserved = dict(selected)
            if "torsion" in preserved:
                # The old parent is not part of the retained one-state ensemble.
                preserved["torsion"] = {k: v for k, v in preserved["torsion"].items() if k != "parentConformerId"}
            # The legacy hash includes list position. Normalize only this moved
            # state to index zero, rather than changing existing v3 identities.
            states.extend(_existing_states(mol, {"conformers": [preserved]}))
        elif mol.GetNumConformers() and mol.GetConformer().Is3D():
            try:
                work = _with_hs(mol, add_coords=True)
                states.append(_state(work, mol.GetNumAtoms(), {"energy": None, "method": "supplied", "converged": False}, "supplied3D", None, 0))
            except ValueError as exc:
                failures.append({"attempt": 0, "stage": "supplied3D verification", "message": str(exc)})
    if not hasattr(AllChem, "ETKDGv3"):
        raise ValueError("This RDKit build does not provide ETKDGv3")
    # One independently seeded attempt per requested new state makes failures
    # visible instead of silently retrying until only successes remain.
    for index in range(len(states), n):
        work = _with_hs(mol)
        work.RemoveAllConformers()
        attempt_seed = (seed + index) % 2_147_483_647
        params = AllChem.ETKDGv3()
        params.randomSeed = attempt_seed
        params.numThreads = 1
        params.enforceChirality = True
        if hasattr(params, "maxIterations"):
            params.maxIterations = 1000
        if hasattr(params, "timeout"):
            params.timeout = 15
        try:
            status = AllChem.EmbedMolecule(work, params)
            if status != 0:
                raise ValueError(f"ETKDGv3 embedding returned status {status}")
            _verify_3d(work)
            opt = _optimize(work, iterations)
            states.append(_state(work, mol.GetNumAtoms(), opt, "ETKDGv3", attempt_seed, index))
        except Exception as exc:
            failures.append({"attempt": index + 1, "seed": attempt_seed, "stage": "embedding/optimization/stereo verification", "message": str(exc)})
    _relative_energies(states)
    if len(Chem.GetMolFrags(mol)) > 1:
        warnings.append("Disconnected fragments have no optimized assembly or comparable assembly energy")
    if any(x["method"].startswith("unoptimized") for x in states):
        warnings.append("Some geometries are unoptimized; no force-field energy is claimed for them")
    st = _stereo(mol)
    if any(not x["specified"] for x in st["centers"] + st["bonds"]):
        warnings.append("Unspecified stereochemistry remains unspecified; a 3D state is not a stereoisomer enumeration")
    if failures:
        warnings.append(f"{len(failures)} conformer attempts failed; details are retained")
    record = _record(mol, states, warnings)
    if states:
        record["selectedConformerId"] = states[0]["id"]
    return {"molecule": record, "requested": n, "generated": len(states), "failed": len(failures), "failures": failures, "warnings": warnings}


def torsion(payload):
    mol, raw = _one(payload)
    full, selected, states = _selected(mol, raw, payload)
    if len(states) >= MAX_CONFORMERS:
        raise ValueError("Remove a conformer before adding another (50-state limit)")
    ids = payload.get("atomIds", payload.get("dihedralAtoms", payload.get("atoms")))
    indices = _torsion_indices(full, ids)
    i, j, k, l = indices
    angle = _finite(payload.get("angle", payload.get("degrees")), "torsion angle")
    angle = (angle + 180) % 360 - 180
    rdMolTransforms.SetDihedralDeg(full.GetConformer(), i, j, k, l, angle)
    iterations = _bounded(payload.get("maxIterations"), 400, 1000, "maxIterations")
    opt = _optimize(full, iterations, (i, j, k, l, angle))
    actual = float(rdMolTransforms.GetDihedralDeg(full.GetConformer(), i, j, k, l))
    if abs((actual - angle + 180) % 360 - 180) > 2.0:
        raise ValueError("Requested torsion constraint could not be maintained")
    state = _state(full, mol.GetNumAtoms(), opt, "constrained-torsion", selected.get("seed"), len(states))
    state["torsion"] = {"atomIds": [_aid(full.GetAtomWithIdx(x)) for x in indices], "requestedAngle": angle, "angle": actual, "parentConformerId": selected["id"]}
    states.append(state)
    # A constrained force field includes restraint energy; do not compare it to
    # unconstrained states. Re-evaluate the physical energy without restraints.
    ff, method = _forcefield(full)
    if ff is not None and state["energy"] is not None:
        value = float(ff.CalcEnergy())
        if not math.isfinite(value):
            raise ValueError("Nonfinite unconstrained torsion-state energy")
        state["energy"] = value
    _relative_energies(states)
    record = _record(mol, states)
    record["selectedConformerId"] = state["id"]
    return {"molecule": record}


def _branch_label(mol, root, blocked):
    seen = set(blocked)
    queue = [root]
    counts = Counter()
    charge = 0
    for idx in queue:
        if idx in seen:
            continue
        seen.add(idx)
        atom = mol.GetAtomWithIdx(idx)
        symbol = f'[{atom.GetIsotope()}{atom.GetSymbol()}]' if atom.GetIsotope() else atom.GetSymbol()
        counts[symbol] += 1
        charge += atom.GetFormalCharge()
        queue.extend(n.GetIdx() for n in atom.GetNeighbors() if n.GetIdx() not in seen)
    suffix = ("+" if charge == 1 else "−" if charge == -1 else f"({charge:+d})" if charge else "")
    parent = mol.GetAtomWithIdx(root)
    symbol = parent.GetSymbol()
    if not parent.GetIsotope() and symbol != 'H' and set(counts) <= {symbol, 'H'} and counts[symbol] == 1:
        h = counts.get('H', 0)
        return symbol + ('H' + (str(h) if h > 1 else '') if h else '') + suffix
    carbonyl = symbol == 'C' and any(b.GetBondType() == Chem.BondType.DOUBLE and b.GetOtherAtom(parent).GetAtomicNum() == 8 for b in parent.GetBonds())
    if carbonyl and counts == Counter({'C':1,'H':1,'O':2}) and any(n.GetAtomicNum() == 8 and n.GetTotalNumHs(includeNeighbors=True) for n in parent.GetNeighbors()):
        return 'COOH' + suffix
    if carbonyl and counts == Counter({'C':1,'H':1,'O':1}):
        return 'CHO' + suffix
    return _formula(counts) + suffix


def _fischer_eligible(mol):
    full = _with_hs(mol)
    result = []
    for center in _stereo(mol)["centers"]:
        atom = full.GetAtomWithIdx(center["atom"])
        if center["specified"] and atom.GetAtomicNum() == 6 and atom.GetDegree() == 4 and not atom.IsInRing() and all(b.GetBondType() == Chem.BondType.SINGLE and not b.IsInRing() for b in atom.GetBonds()):
            result.append(atom.GetIdx())
    return full, result


def _fischer_arms(full, idx, top=None, bottom=None):
    atom = full.GetAtomWithIdx(idx)
    neighbors = sorted((n.GetIdx() for n in atom.GetNeighbors()), key=lambda x: _aid(full.GetAtomWithIdx(x)))
    carbons = [n for n in neighbors if full.GetAtomWithIdx(n).GetAtomicNum() == 6]
    def backbone_priority(n):
        candidate = full.GetAtomWithIdx(n)
        oxidation = sum(b.GetBondTypeAsDouble() * b.GetOtherAtom(candidate).GetAtomicNum() for b in candidate.GetBonds() if b.GetOtherAtom(candidate).GetAtomicNum() > 6)
        return oxidation, sum(x.GetAtomicNum() == 6 for x in candidate.GetNeighbors())
    carbons.sort(key=backbone_priority, reverse=True)
    if top is None:
        top = carbons[0] if len(carbons) >= 2 else neighbors[0]
    if bottom is None:
        bottom = next((x for x in carbons if x != top), next(x for x in neighbors if x != top))
    if top not in neighbors or bottom not in neighbors or top == bottom:
        raise ValueError("Fischer backbone atoms must be distinct neighbors of the center")
    sides = [x for x in neighbors if x not in (top, bottom)]
    slots = {"top": top, "bottom": bottom, "left": sides[0], "right": sides[1]}
    vectors = {"top": (0, 1, -1), "bottom": (0, -1, -1), "left": (-1, 0, 1), "right": (1, 0, 1)}
    # Derive parity from RDKit's actual neighbor ordering, not from CIP labels
    # or arbitrary adjacency. The projected center must reproduce its chiral tag.
    def tag_for(arrangement):
        probe = Chem.Mol(full)
        probe.RemoveAllConformers()
        conf = Chem.Conformer(probe.GetNumAtoms())
        conf.Set3D(True)
        for i in range(probe.GetNumAtoms()):
            conf.SetAtomPosition(i, Point3D(0, 0, 0))
        for slot, n in arrangement.items():
            conf.SetAtomPosition(n, Point3D(*vectors[slot]))
        probe.AddConformer(conf, assignId=True)
        Chem.AssignAtomChiralTagsFromStructure(probe, confId=0, replaceExistingTags=True)
        return probe.GetAtomWithIdx(idx).GetChiralTag()
    if tag_for(slots) != atom.GetChiralTag():
        slots["left"], slots["right"] = slots["right"], slots["left"]
    if tag_for(slots) != atom.GetChiralTag():
        raise ValueError("Fischer parity could not be verified")
    return [{"slot": slot, "atom": n, "atomId": _aid(full.GetAtomWithIdx(n)), "label": _branch_label(full, n, [idx]), "toward": slot in ("left", "right")} for slot, n in slots.items()]


def _carbon_chain(mol, centers):
    if len(centers) < 2:
        return None
    graph = {a.GetIdx(): [n.GetIdx() for n in a.GetNeighbors() if n.GetAtomicNum() == 6 and not n.IsInRing()] for a in mol.GetAtoms() if a.GetAtomicNum() == 6 and not a.IsInRing()}
    leaves = sorted(x for x, ns in graph.items() if len(ns) == 1)
    # A simple chain only: branched backbones need explicit user selection.
    if len(leaves) != 2 or any(len(ns) > 2 for ns in graph.values()):
        return None
    path, previous, current = [], None, leaves[0]
    while current is not None and len(path) <= MAX_ATOMS:
        path.append(current)
        nexts = [x for x in graph[current] if x != previous]
        previous, current = current, nexts[0] if nexts else None
    if len(path) > 32 or len(path) != len(graph) or set(centers) != set(path[1:-1]):
        return None
    if any(mol.GetBondBetweenAtoms(a, b).GetBondType() != Chem.BondType.SINGLE for a, b in zip(path, path[1:])):
        return None
    return path


def _projection_fischer(mol, payload):
    full, eligible = _fischer_eligible(mol)
    ids = [_aid(mol.GetAtomWithIdx(x)) for x in eligible]
    note = "Parity-verified Fischer projection: horizontal bonds point toward you; vertical bonds point away."
    if not eligible:
        return {"type": "fischer", "eligible": False, "eligibleAtomIds": [], "note": "A specified acyclic tetrahedral carbon stereocenter is required; unspecified stereochemistry is not invented."}
    chain_ids = payload.get("chainAtomIds")
    chain = None
    if chain_ids is not None:
        if not isinstance(chain_ids, list) or not 3 <= len(chain_ids) <= 32:
            raise ValueError("Fischer chainAtomIds must contain 3..32 mapped carbon atoms")
        chain = [_atom_index(mol, x) for x in chain_ids]
        if len(set(chain)) != len(chain) or any(mol.GetAtomWithIdx(x).GetAtomicNum() != 6 or mol.GetAtomWithIdx(x).IsInRing() for x in chain) or any(mol.GetBondBetweenAtoms(a, b) is None for a, b in zip(chain, chain[1:])):
            raise ValueError("Fischer backbone must be a simple bonded acyclic carbon chain")
        if any(x not in eligible for x in chain[1:-1]) or any(mol.GetBondBetweenAtoms(a, b).GetBondType() != Chem.BondType.SINGLE for a, b in zip(chain, chain[1:])):
            raise ValueError("This Fischer chain view requires single backbone bonds and specified tetrahedral internal stereocenters")
    elif payload.get("atomId", payload.get("center")) is None and payload.get("mode") != "local":
        chain = _carbon_chain(mol, eligible)
    if chain:
        rows = []
        for pos, idx in enumerate(chain[1:-1], 1):
            if idx not in eligible:
                continue
            atom = full.GetAtomWithIdx(idx)
            rows.append({"center": idx, "centerAtomId": _aid(atom), "cip": atom.GetProp("_CIPCode") if atom.HasProp("_CIPCode") else None,
                         "arms": _fischer_arms(full, idx, chain[pos - 1], chain[pos + 1])})
        if not rows:
            raise ValueError("The selected Fischer chain has no supported stereocenters")
        return {"type": "fischer", "eligible": True, "eligibleAtomIds": ids, "mode": "chain", "chainAtomIds": [_aid(mol.GetAtomWithIdx(x)) for x in chain], "centers": rows, "note": note + " Rows share the selected continuous carbon backbone."}
    target = payload.get("atomId", payload.get("center", ids[0]))
    idx = _atom_index(mol, target)
    if idx not in eligible:
        raise ValueError("Selected atom is not an eligible specified Fischer stereocenter")
    top = _atom_index(full, payload["topAtomId"]) if payload.get("topAtomId") is not None else None
    bottom = _atom_index(full, payload["bottomAtomId"]) if payload.get("bottomAtomId") is not None else None
    atom = full.GetAtomWithIdx(idx)
    return {"type": "fischer", "eligible": True, "eligibleAtomIds": ids, "mode": "local", "center": idx, "centerAtomId": _aid(atom),
            "cip": atom.GetProp("_CIPCode") if atom.HasProp("_CIPCode") else None, "arms": _fischer_arms(full, idx, top, bottom), "note": note}


def _vec(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    length = math.sqrt(_dot(a, a))
    if length < 1e-8:
        raise ValueError("Degenerate geometry cannot define a projection")
    return tuple(x / length for x in a)


def _projection_newman(mol, raw, payload):
    full, selected, _ = _selected(mol, raw, payload)
    candidates = [b for b in full.GetBonds() if b.GetBondType() == Chem.BondType.SINGLE and not b.IsInRing() and all(a.GetAtomicNum() == 6 and a.GetDegree() == 4 and all(x.GetBondType() == Chem.BondType.SINGLE for x in a.GetBonds()) for a in (b.GetBeginAtom(), b.GetEndAtom()))]
    eligible = [_bond_id(b) for b in candidates]
    if not candidates:
        return {"type": "newman", "eligible": False, "eligibleBondIds": [], "note": "Choose an acyclic single bond between two tetrahedral carbons."}
    key = payload.get("bondId", payload.get("bond"))
    if key is None:
        bond = candidates[0]
    elif type(key) is int:
        bond = next((b for b in candidates if b.GetIdx() == key), None)
    else:
        bond = next((b for b in candidates if _bond_id(b) == key), None)
    if bond is None:
        raise ValueError("Selected bond is not eligible for a Newman projection")
    front, back = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
    if payload.get("reverse"):
        front, back = back, front
    conf = full.GetConformer()
    positions = [tuple(conf.GetAtomPosition(i)) for i in range(full.GetNumAtoms())]
    axis = _unit(_vec(positions[back], positions[front]))
    front_ns = sorted((n.GetIdx() for n in full.GetAtomWithIdx(front).GetNeighbors() if n.GetIdx() != back), key=lambda i: _aid(full.GetAtomWithIdx(i)))
    back_ns = sorted((n.GetIdx() for n in full.GetAtomWithIdx(back).GetNeighbors() if n.GetIdx() != front), key=lambda i: _aid(full.GetAtomWithIdx(i)))
    ref = _vec(positions[front_ns[0]], positions[front])
    u = _unit(tuple(ref[i] - axis[i] * _dot(ref, axis) for i in range(3)))
    v = _cross(axis, u)
    def groups(center, other, neighbors):
        result = []
        for idx in neighbors:
            delta = _vec(positions[idx], positions[center])
            x, y = _dot(delta, u), _dot(delta, v)
            if math.hypot(x, y) < 1e-8:
                raise ValueError("Collinear substituent cannot define a Newman angle")
            result.append({"atom": idx, "atomId": _aid(full.GetAtomWithIdx(idx)), "label": _branch_label(full, idx, [center, other]),
                           "angle": math.degrees(math.atan2(y, x)), "x": x, "y": y, "position": list(positions[idx])})
        return result
    quartet = payload.get("dihedralAtomIds")
    if quartet is not None:
        if not isinstance(quartet, list) or len(quartet) != 4:
            raise ValueError("dihedralAtomIds must contain four mapped atoms")
        indices = [_atom_index(full, x) for x in quartet]
        if indices[1:3] != [front, back] or indices[0] not in front_ns or indices[3] not in back_ns:
            raise ValueError("Dihedral atom IDs must follow front-group/front/back/back-group")
    else:
        indices = [front_ns[0], front, back, back_ns[0]]
    angle = float(rdMolTransforms.GetDihedralDeg(conf, *indices))
    selected_ids = [_aid(full.GetAtomWithIdx(i)) for i in indices]
    eligible_bonds = [{"bondId": _bond_id(b), "a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx(), "atomIds": [_aid(b.GetBeginAtom()), _aid(b.GetEndAtom())]} for b in candidates]
    return {"type": "newman", "eligible": True, "eligibleBondIds": eligible, "eligibleBonds": eligible_bonds, "bond": bond.GetIdx(), "bondId": _bond_id(bond), "selectedBondId": _bond_id(bond),
            "conformerId": selected["id"], "front": front, "back": back, "frontAtomId": _aid(full.GetAtomWithIdx(front)), "backAtomId": _aid(full.GetAtomWithIdx(back)),
            "frontGroups": groups(front, back, front_ns), "backGroups": groups(back, front, back_ns),
            "dihedral": angle, "measuredDihedral": angle, "dihedralAtomIds": selected_ids, "atomIds": selected_ids, "torsionAtomIds": selected_ids,
            "note": "Actual selected 3D coordinates, viewed from front toward back. Angles share one perpendicular basis; dihedral is the mapped four-atom RDKit dihedral, not an illustrative staggered arrangement."}


def _projection_svg(data):
    """Generate only service-owned SVG; labels are always XML-escaped."""
    def text(x, y, value, anchor="middle"):
        return f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" dominant-baseline="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-size="15">{html.escape(str(value))}</text>'
    def line(x, y, x2, y2):
        return f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="currentColor" stroke-width="2"/>'
    parts = []
    if data["type"] == "newman":
        width, height, cx, cy = 400, 400, 200, 190
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="43" fill="none" stroke="currentColor" stroke-width="2"/>')
        for rear, key in ((True, "backGroups"), (False, "frontGroups")):
            for group in data[key]:
                radians = math.radians(group["angle"])
                x, y = math.cos(radians), -math.sin(radians)
                start = 43 if rear else 0
                parts.append(line(cx + start*x, cy + start*y, cx + 112*x, cy + 112*y))
                parts.append(text(cx + 140*x, cy + 140*y, group["label"]))
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="currentColor"/>')
        parts.append(text(200, 370, f'Dihedral {data["dihedral"]:.1f}°'))
    else:
        rows = data.get("centers", [data])
        width, height = 420, max(330, 100 + len(rows) * 140)
        for index, row in enumerate(rows):
            cx, cy = 210, 85 + index*140
            if index:
                parts.append(line(cx, cy - 140, cx, cy))
            for arm in row["arms"]:
                slot = arm["slot"]
                if slot == "top" and index:
                    continue
                if slot == "bottom" and index < len(rows)-1:
                    continue
                dx, dy = {"top": (0, -45), "bottom": (0, 45), "left": (-90, 0), "right": (90, 0)}[slot]
                parts.append(line(cx, cy, cx+dx, cy+dy))
                parts.append(text(cx+dx*1.48, cy+dy*1.48, arm["label"]))
            parts.append(text(cx+22, cy+23, row.get("cip") or ""))
    return f'<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 {width} {height}"><title>{html.escape(data["type"].capitalize())} projection</title>' + "".join(parts) + '</svg>'


def projection(payload):
    mol, raw = _one(payload)
    kind = str(payload.get("type", payload.get("projection", "fischer"))).lower()
    if kind == "fischer":
        data = _projection_fischer(mol, payload)
    elif kind == "newman":
        data = _projection_newman(mol, raw, payload)
    else:
        raise ValueError("Supported projection types are fischer and newman")
    if data.get("eligible"):
        data["svg"] = _projection_svg(data)
    return data


def export(payload):
    mol, raw = _one(payload)
    fmt = str(payload.get("outputFormat", payload.get("exportFormat", payload.get("format", "smiles") if payload.get("molecule") else "smiles"))).lower()
    basename = _formula(_counts(mol)) or "molecule"
    if fmt in ("smiles", "smi", "isomericsmiles"):
        return {"text": _canonical(mol) + "\n", "filename": basename + ".smi", "mime": "chemical/x-daylight-smiles"}
    if fmt == "json":
        record = _record(mol, _existing_states(mol, raw))
        if record["conformers"]:
            _, selected, _ = _selected(mol, raw, payload)
            record["selectedConformerId"] = selected["id"]
        return {"text": json.dumps(record, ensure_ascii=False, allow_nan=False, indent=2), "filename": basename + ".json", "mime": "application/json"}
    if fmt in ("xyz", "mol", "sdf", "v2000", "v3000", "mol-v2000", "mol-v3000", "sdf-v2000", "sdf-v3000"):
        states = _existing_states(mol, raw)
        coordinate_mol = mol
        if states or (mol.GetNumConformers() and mol.GetConformer().Is3D()):
            coordinate_mol, _, _ = _selected(mol, raw, payload)
        if fmt == "xyz":
            if not coordinate_mol.GetNumConformers() or not coordinate_mol.GetConformer().Is3D():
                raise ValueError("XYZ export requires a selected 3D conformer; XYZ is coordinate-only")
            conf = coordinate_mol.GetConformer()
            lines = [str(coordinate_mol.GetNumAtoms()), "Coordinate-only XYZ: bonds, formal charges and stereochemical annotations are NOT encoded"]
            for atom in coordinate_mol.GetAtoms():
                p = conf.GetAtomPosition(atom.GetIdx())
                lines.append(f"{atom.GetSymbol()} {p.x:.10f} {p.y:.10f} {p.z:.10f}")
            return {"text": "\n".join(lines) + "\n", "filename": basename + ".xyz", "mime": "chemical/x-xyz"}
        v3000 = "2000" not in fmt and str(payload.get("version", "V3000")).upper() != "V2000"
        if not v3000 and _stereo(mol)["unsupported"]:
            raise ValueError("These stereo features cannot be safely exported as V2000; use V3000")
        if fmt.startswith("sdf"):
            buf = io.StringIO()
            writer = Chem.SDWriter(buf)
            writer.SetForceV3000(v3000)
            if payload.get("allConformers") and states:
                for state in states:
                    item = _state_mol(mol, state)
                    item.SetProp("ConformerId", state["id"])
                    item.SetProp("EnergyMethod", state["method"])
                    _molblock(item, v3000)  # Refuse lossy version/stereo/map conversions.
                    writer.write(item)
            else:
                _molblock(coordinate_mol, v3000)
                writer.write(coordinate_mol)
            writer.flush()
            text = buf.getvalue()
            writer.close()
            return {"text": text, "filename": basename + ".sdf", "mime": "chemical/x-mdl-sdfile"}
        return {"text": _molblock(coordinate_mol, v3000), "filename": basename + ".mol", "mime": "chemical/x-mdl-molfile"}
    raise ValueError("Supported export formats are smiles, json, mol/sdf (V2000/V3000) and coordinate-only xyz")


def _relationship_input(value):
    if isinstance(value, str):
        return _one({"text": value})[0]
    if isinstance(value, dict):
        return _one({"molecule": value} if "atoms" in value else value)[0]
    raise ValueError("Relationship requires two molecule records, SMILES strings or input specifications")


def relationship(payload):
    pair = payload.get("molecules")
    if pair is not None:
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError("Relationship requires exactly two molecules")
        left, right = pair
    else:
        left = payload.get("left", payload.get("first", payload.get("a", payload.get("moleculeA"))))
        right = payload.get("right", payload.get("second", payload.get("b", payload.get("moleculeB"))))
    a, b = _relationship_input(left), _relationship_input(right)
    if _canonical(a, False) != _canonical(b, False):
        return {"relationship": "different connectivity"}
    sa, sb = _stereo(a), _stereo(b)
    if sa["unsupported"] or sb["unsupported"] or any(not x["specified"] for st in (sa, sb) for x in st["centers"] + st["bonds"]):
        return {"relationship": "unspecified"}
    if _canonical(a) == _canonical(b):
        return {"relationship": "identical"}
    mirror = Chem.Mol(a)
    for atom in mirror.GetAtoms():
        if atom.GetChiralTag() in _TETRA:
            atom.InvertChirality()
    _assign(mirror)
    result = "enantiomers" if _canonical(mirror) == _canonical(b) else "diastereomers"
    return {"relationship": result}


_OPERATIONS = {"parse": parse, "enumerate": enumerate_stereoisomers, "conformers": conformers,
               "projection": projection, "torsion": torsion, "export": export, "relationship": relationship}


def dispatch(operation: str, payload: dict):
    """Execute one bounded chemistry operation, returning JSON-serializable data."""
    if not isinstance(operation, str) or operation not in _OPERATIONS:
        raise ValueError("Unknown chemistry operation")
    if not isinstance(payload, dict):
        raise ValueError("Operation payload must be an object")
    try:
        # Parser/force-field diagnostics can contain raw structures; workers must
        # report structured errors, never print a user's molecule to stderr.
        with rdBase.BlockLogs():
            result = _OPERATIONS[operation](payload)
        # Catch accidental nonfinite/numpy/RDKit values at the service boundary.
        json.dumps(result, allow_nan=False)
        return result
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"{operation} failed: {exc}") from exc
