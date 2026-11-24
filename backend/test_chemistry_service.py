"""Executable regression fixtures for the offline RDKit core.

Run: .venv/bin/python -m unittest discover -s backend -p test_chemistry_service.py
"""
import copy
import json
import math
import re
import unittest
from unittest.mock import patch

from rdkit import Chem
from rdkit.Chem import rdMolTransforms
from rdkit.Geometry import Point3D

try:
    from . import chemistry_service as service
except ImportError:
    import chemistry_service as service


def parsed(smiles):
    return service.dispatch("parse", {"text": smiles, "format": "smiles"})["molecules"][0]


def enumerated(smiles, **options):
    return service.dispatch("enumerate", {"text": smiles, **options})


def generated(smiles, **options):
    return service.dispatch("conformers", {"text": smiles, "count": 1, "seed": 9123, **options})


class ParsingTests(unittest.TestCase):
    def test_record_contract_and_counts(self):
        mol = parsed("CCO")
        self.assertEqual(mol["schema"], "bond-atlas/3")
        self.assertEqual(mol["formula"], "C2H6O")
        self.assertEqual(mol["atoms"], ["C", "C", "O"])
        self.assertEqual(mol["hydrogens"], [3, 2, 1])
        self.assertEqual(mol["charges"], [0, 0, 0])
        self.assertEqual(mol["metadata"]["counts"], {"C": 2, "O": 1, "H": 6})
        self.assertEqual(mol["metadata"]["dbe"], 0)
        self.assertEqual(mol["stability"]["label"], "Not stability-ranked")
        self.assertEqual(mol["id"], mol["stereoisomerId"])
        self.assertIn("V3000", mol["molblock"])
        for key in ("skeletal", "displayed"):
            self.assertIn("<svg", mol["depictions"][key])
            self.assertNotIn("<script", mol["depictions"][key])
            layout = mol["layouts"][key]
            self.assertEqual([a["atomId"] for a in layout["atoms"][:3]], mol["atomIds"])
            self.assertTrue(all(0 <= b["a"] < len(layout["atoms"]) and 0 <= b["b"] < len(layout["atoms"]) for b in layout["bonds"]))
        self.assertEqual(mol["name"], "Ethanol")
        json.dumps(mol, allow_nan=False)

    def test_skeletal_alkenes_use_cip_annotations_or_crossed_unknown_bonds(self):
        def paths(svg, index):
            data = re.findall(r"class='bond-" + str(index) + r" atom-\d+ atom-\d+' d='M ([-.\d]+),([-.\d]+) L ([-.\d]+),([-.\d]+)'", svg)
            return [(complex(float(x), float(y)), complex(float(u), float(v))) for x, y, u, v in data]

        def side(a, b, p):
            return ((b-a).conjugate() * (p-a)).imag

        for smiles, desc, alias in ((r'C/C=C\C', 'Z', 'cis'), ('C/C=C/C', 'E', 'trans'), ('CC=CC', None, None)):
            with self.subTest(smiles=smiles):
                mol = parsed(smiles)
                stereo, = mol['stereo']['bonds']
                self.assertEqual((stereo['descriptor'], stereo['cisTrans'], stereo['specified']), (desc, alias, bool(desc)))
                svg = mol['depictions']['skeletal']
                (a, b), (c, d) = paths(svg, 1)
                crossed = side(a,b,c)*side(a,b,d)<0 and side(c,d,a)*side(c,d,b)<0
                self.assertEqual(crossed, desc is None)
                self.assertEqual("class='note'" in svg, bool(desc))
                if desc:
                    self.assertNotIn("#7F7FFF", svg.upper())
                    (left, _), = paths(svg, 0)
                    (_, right), = paths(svg, 2)
                    self.assertEqual(side(a,b,left)*side(a,b,right)>0, desc == 'Z')
        substituted = parsed('F/C(Cl)=C(/Br)I')['stereo']['bonds'][0]
        self.assertEqual(substituted['descriptor'], 'E')
        self.assertIsNone(substituted['cisTrans'])
        self.assertEqual(parsed('CC(C)=CC')['stereo']['bonds'], [])

    def test_charges_isotopes_aromatic_salt_and_explicit_h_roundtrip(self):
        for smiles in ("[NH4+]", "[NH4+].[Cl-]", "c1ccncc1", "[13CH3][C@@H](O)C(=O)[O-].[Na+]", "[2H]O[H]", "c1cc[nH]c1"):
            with self.subTest(smiles=smiles):
                original = parsed(smiles)
                for fmt in ("json", "v3000", "v2000", "sdf-v3000", "sdf-v2000", "smiles"):
                    exported = service.dispatch("export", {"molecule": original, "outputFormat": fmt})
                    input_fmt = "mol" if fmt.startswith("v") else "sdf" if fmt.startswith("sdf") else fmt
                    restored = service.dispatch("parse", {"text": exported["text"], "format": input_fmt})["molecules"][0]
                    self.assertEqual(original["id"], restored["id"], fmt)
                    self.assertEqual(original["charge"], restored["charge"], fmt)
                    self.assertEqual(original["metadata"]["counts"], restored["metadata"]["counts"], fmt)
                if any(original["charges"]):
                    self.assertIsNone(original["metadata"]["dbe"])
        isotope = parsed("[2H]O[H]")
        self.assertEqual(isotope["atoms"], ["H", "O", "H"])
        self.assertEqual(isotope["isotopes"], [2, 0, 0])
        ammonium = parsed("[NH4+]")
        self.assertEqual(ammonium["formula"], "H4N")
        self.assertEqual(ammonium["charge"], 1)
        self.assertNotEqual(parsed("[13CH4]")["id"], parsed("C")["id"])
        self.assertNotEqual(parsed("[NH4+]")["connectivityId"], parsed("N")["connectivityId"])

    def test_stable_mapping_and_map_free_identity(self):
        mol = parsed("[CH3:17][C@@H:3]([OH:91])[C:4](=[O:5])[OH:6]")
        other_maps = parsed("[CH3:11][C@@H:21]([OH:31])[C:41](=[O:51])[OH:61]")
        self.assertEqual(mol["id"], other_maps["id"])
        self.assertEqual(mol["atomIds"], ["a17", "a3", "a91", "a4", "a5", "a6"])
        raw = copy.deepcopy(mol)
        rd = Chem.MolFromMolBlock(mol["molblock"], removeHs=False)
        raw["molblock"] = Chem.MolToMolBlock(Chem.RenumberAtoms(rd, list(reversed(range(rd.GetNumAtoms())))), forceV3000=True)
        restored = service.dispatch("parse", {"molecule": raw})["molecules"][0]
        self.assertEqual(restored["atomIds"], mol["atomIds"])
        self.assertEqual(restored["id"], mol["id"])
        self.assertEqual(restored["charges"], mol["charges"])
        self.assertEqual(restored["atoms"], mol["atoms"])

    def test_json_charge_arrays_are_never_ignored(self):
        mol = parsed("[NH4+]")
        for values in ([], ["1"], [True], [0], [1, 0], None):
            with self.subTest(values=values):
                bad = copy.deepcopy(mol)
                bad["charges"] = values
                with self.assertRaisesRegex(ValueError, "charge"):
                    service.dispatch("parse", {"molecule": bad})
        bad = copy.deepcopy(mol)
        bad["charge"] = 0
        with self.assertRaisesRegex(ValueError, "charge"):
            service.dispatch("parse", {"molecule": bad})
        graph = {"atoms": ["N"], "charges": [1], "hydrogens": [4], "bonds": []}
        restored = service.dispatch("parse", {"text": json.dumps(graph), "format": "json"})["molecules"][0]
        self.assertEqual(restored["charge"], 1)
        self.assertEqual(restored["formula"], "H4N")

    def test_json_does_not_silently_drop_features(self):
        mol = parsed("C[C@H](O)C(=O)O")
        for key in ("atoms", "bonds", "isotopes", "hydrogens"):
            bad = copy.deepcopy(mol)
            if key == "atoms":
                bad[key][0] = "N"
            elif key == "bonds":
                bad[key][0]["order"] = 2
            else:
                bad[key][0] += 1
            with self.subTest(key=key), self.assertRaises(ValueError):
                service.dispatch("parse", {"molecule": bad})
        del mol["molblock"]
        with self.assertRaisesRegex(ValueError, "molblock"):
            service.dispatch("parse", {"molecule": mol})

    def test_invalid_and_bounded_inputs(self):
        for payload in ({"text": "C("}, {"text": "C1CC"}, {"text": "[CH5]"}, {"text": "*"}, {"text": "CC extra title"}, {"text": "C", "format": "smarts"}, {"text": "C" * 257}, {"text": '{"atoms":["C"],"charges":[NaN]}', "format": "json"}):
            with self.subTest(payload=str(payload)[:40]), self.assertRaises(ValueError):
                service.dispatch("parse", payload)
        with self.assertRaises(ValueError):
            service.dispatch("parse", {"text": "[CH3:1][OH:1]"})
        with self.assertRaises(ValueError):
            service.dispatch("nonexistent", {})
        with self.assertRaises(ValueError):
            service.dispatch("parse", [])

    def test_sdf_multiple_and_invalid_records(self):
        one = service.dispatch("export", {"molecule": parsed("CCO"), "outputFormat": "sdf"})["text"]
        two = service.dispatch("parse", {"text": one + one, "format": "sdf"})
        self.assertEqual(len(two["molecules"]), 2)
        with self.assertRaises(ValueError):
            service.dispatch("parse", {"text": one + "not a molecule\n$$$$\n", "format": "sdf"})


class StructureInsightTests(unittest.TestCase):
    @staticmethod
    def matches(record):
        return {g["key"]: g["matches"] for g in record["structureInsights"]["functionalGroups"]}

    def test_unlisted_isomers_have_different_evidence_and_descriptors(self):
        alcohol, ether = parsed("CC(C)(O)CC"), parsed("CCOCCC")
        self.assertEqual(alcohol["formula"], ether["formula"])
        for record, key, evidence, donors in ((alcohol, "alcohol", ["a2", "a4"], 1),
                                               (ether, "ether", ["a2", "a3", "a4"], 0)):
            self.assertFalse(record["knownName"])
            self.assertEqual(self.matches(record), {key: [evidence]})
            insights = record["structureInsights"]
            self.assertEqual((insights["hBondDonors"], insights["hBondAcceptors"]), (donors, 1))
            self.assertIn(key, record["tags"])

    def test_positive_motifs_and_neighboring_nonmatches(self):
        cases = {
            "O=CC(=O)C": {"aldehyde", "ketone"}, "CCN(C)C": {"amine"},
            "CC(=O)O": {"carboxylic-acid"}, "O=COC": {"ester"}, "NC=O": {"amide"},
            "C=CC#CC#N": {"alkene", "alkyne", "nitrile"}, "SC1CC1": {"thiol"},
            "Oc1cccc(Br)c1": {"phenol", "halogenated-carbon"}, "COOC": {"peroxide"},
            "CC(=O)OC(=O)C": set(), "NS(=O)(=O)C": set(), "CC(=O)[O-]": set(),
            "[NH4+].[Cl-]": set(), "O=c1cccc[nH]1": set(),
        }
        for text, keys in cases.items():
            with self.subTest(text=text):
                record = parsed(text)
                self.assertEqual(set(self.matches(record)), keys)
                self.assertEqual(set(record["tags"]) & {k for k, _, _ in service._MOTIFS}, keys)
        self.assertNotIn("halogenoalkane", parsed("Brc1ccccc1")["tags"])
        self.assertIn("secondary-halogenoalkane", parsed("CC(Cl)C")["tags"])

    def test_cycle_rank_independent_of_perceived_faces_and_fragments(self):
        for text, expected in (("C1CC1.C1CCC1.Cl", 2), ("c1ccc2ccccc2c1", 2),
                               ("C12C3C4C1C5C2C3C45", 5), ("[H]C#C[H]", 0), ("[Na+].[Cl-]", 0)):
            with self.subTest(text=text):
                self.assertEqual(parsed(text)["structureInsights"]["independentRingCount"], expected)

    def test_symmetric_matches_maps_custom_ids_and_recomputation(self):
        # Reverse the input traversal, retaining the identifiers on glycerol.
        forward = parsed("[OH:9][CH2:6][CH:3]([OH:1])[CH2:8][OH:7]")
        reverse = parsed("[OH:7][CH2:8][CH:3]([OH:1])[CH2:6][OH:9]")
        self.assertEqual(forward["structureInsights"], reverse["structureInsights"])
        self.assertEqual(self.matches(reverse), {"alcohol": [["a1", "a3"], ["a6", "a9"], ["a7", "a8"]]})
        reverse["atomIds"] = ["endOH", "endC", "center", "midOH", "startC", "startOH"]
        reverse["structureInsights"] = {"independentRingCount": 100, "functionalGroups": []}
        restored = service.parse({"molecule": reverse})["molecules"][0]
        self.assertEqual(self.matches(restored), {"alcohol": [["center", "midOH"], ["endC", "endOH"], ["startC", "startOH"]]})
        self.assertEqual(restored["structureInsights"]["independentRingCount"], 0)
        for pair in (("F[C@H](Cl)CO", "F[C@@H](Cl)CO"), ("C1=CC=CC=C1O", "c1ccccc1O")):
            self.assertEqual(parsed(pair[0])["structureInsights"], parsed(pair[1])["structureInsights"])

    def test_descriptor_hydrogen_representation_and_scope(self):
        for text in ("CC(=O)O", "CC(=O)O[H]", "CC(=O)O[2H]"):
            with self.subTest(text=text):
                info = parsed(text)["structureInsights"]
                self.assertEqual((info["hBondDonors"], info["hBondAcceptors"]), (1, 1))
                self.assertEqual(info["functionalGroups"][0]["matches"], [["a2", "a3", "a4"]])
        for text in ("CO.CO", "[NH3+]CC(=O)[O-]", "C[Mg]Br", "[CH2]C", "O", "C[NH3+]"):
            with self.subTest(text=text):
                info = parsed(text)["structureInsights"]
                self.assertIsNone(info["hBondDonors"])
                self.assertIsNone(info["hBondAcceptors"])
        info = parsed("CC")["structureInsights"]
        self.assertEqual((info["hBondDonors"], info["hBondAcceptors"]), (0, 0))


class DraftTests(unittest.TestCase):
    @staticmethod
    def draft(record):
        coords = record["layouts"]["skeletal"]["atoms"]
        return {"atoms": [{"e": e, "id": record["atomIds"][i], "charge": record["charges"][i], "isotope": record["isotopes"][i], "x": coords[i]["x"], "y": coords[i]["y"]} for i, e in enumerate(record["atoms"])],
                "bonds": [{"a": b["a"], "b": b["b"], "order": b["order"], "id": b["id"]} for b in record["bonds"]]}

    def test_position_only_preserves_stereo_charge_isotope_and_aromaticity(self):
        for text in ("C[C@H](O)C(=O)O", "C/C=C/C", "[13CH3][C@H](O)C(=O)[O-].[Na+]", "c1ccccc1"):
            with self.subTest(text=text):
                original = parsed(text)
                draft = self.draft(original)
                for atom in draft["atoms"]:
                    atom["x"] = -2 * atom["x"] + 5
                    atom["y"] = 1.3 * atom["y"] - 1
                edited = service.dispatch("parse", {"draft": draft, "sourceRecord": original})["molecules"][0]
                self.assertEqual(edited["id"], original["id"])
                self.assertEqual(edited["atomIds"], original["atomIds"])
                self.assertEqual(edited["stereo"], original["stereo"])
                self.assertEqual(edited["charges"], original["charges"])
                self.assertEqual(edited["isotopes"], original["isotopes"])
                for expected, actual in zip(draft["atoms"], edited["layouts"]["skeletal"]["atoms"]):
                    self.assertAlmostEqual(expected["x"], actual["x"])
                    self.assertAlmostEqual(expected["y"], actual["y"])
                restored = service.dispatch("parse", {"molecule": edited})["molecules"][0]
                self.assertEqual(restored["id"], original["id"])

    def test_dragging_a_substituent_across_double_bond_does_not_assign_or_invert(self):
        for smiles in ('C/C=C/C', 'CC=CC'):
            original = parsed(smiles)
            draft = self.draft(original)
            p, a, b = draft['atoms'][:3]
            # Reflect the first methyl across the alkene axis (a visual E/Z swap).
            dx, dy = b['x'] - a['x'], b['y'] - a['y']
            t = ((p['x'] - a['x']) * dx + (p['y'] - a['y']) * dy) / (dx * dx + dy * dy)
            p['x'], p['y'] = 2 * (a['x'] + t * dx) - p['x'], 2 * (a['y'] + t * dy) - p['y']
            moved = service.dispatch('parse', {'draft': draft, 'sourceRecord': original})['molecules'][0]
            self.assertEqual(moved['depictions']['skeletal'], original['depictions']['skeletal'])
            self.assertEqual(moved['stereo'], original['stereo'])
            self.assertEqual(moved['layouts']['skeletal']['atoms'][0]['x'], p['x'])
            self.assertEqual(service.dispatch('parse', {'molecule': moved})['molecules'][0]['id'], original['id'])

    def test_position_only_keeps_independent_3d_states(self):
        original = generated("C[C@H](O)C(=O)O")["molecule"]
        draft = self.draft(original)
        draft["atoms"][0]["x"] += 1.5
        edited = service.dispatch("parse", {"draft": draft, "sourceRecord": original})["molecules"][0]
        self.assertEqual(edited["conformers"][0]["atoms"], original["conformers"][0]["atoms"])
        self.assertEqual(edited["id"], original["id"])

    def test_neighborhood_chemical_edit_invalidates_stereo_and_stale_geometry(self):
        original = generated("C[C@H](O)C(=O)O")["molecule"]
        draft = self.draft(original)
        draft["atoms"][2]["charge"] = -1
        edited = service.dispatch("parse", {"draft": draft, "sourceRecord": original})["molecules"][0]
        self.assertEqual(edited["charge"], -1)
        self.assertFalse(edited["stereo"]["centers"][0]["specified"])
        self.assertEqual(edited["conformers"], [])
        self.assertTrue(any("Stereo assignments invalidated" in x for x in edited["warnings"]))
        self.assertEqual(edited["atomIds"], original["atomIds"])

    def test_add_remove_atoms_and_toolkit_hydrogen_counts(self):
        original = parsed("CCO")
        draft = self.draft(original)
        draft["atoms"].append({"e": "C", "id": "build-carbon", "x": 3, "y": 0, "charge": 0, "isotope": 0})
        draft["bonds"].append({"a": 2, "b": 3, "order": 1})
        edited = service.dispatch("parse", {"draft": draft, "sourceRecord": original})["molecules"][0]
        self.assertEqual(edited["formula"], "C3H8O")
        self.assertEqual(edited["atomIds"][-1], "build-carbon")
        self.assertEqual(edited["hydrogens"], [3, 2, 0, 3])
        self.assertEqual(service.dispatch("parse", {"molecule": edited})["molecules"][0]["atomIds"], edited["atomIds"])
        draft = self.draft(original)
        draft["atoms"] = draft["atoms"][:2]
        draft["bonds"] = draft["bonds"][:1]
        removed = service.dispatch("parse", {"draft": draft, "sourceRecord": original})["molecules"][0]
        self.assertEqual(removed["formula"], "C2H6")
        self.assertEqual(removed["atomIds"], original["atomIds"][:2])

    def test_standalone_draft_and_invalid_valence(self):
        draft = {"atoms": [{"e": "N", "id": "n1", "charge": 1, "isotope": 15, "x": 0, "y": 0}], "bonds": []}
        mol = service.dispatch("parse", {"draft": draft})["molecules"][0]
        self.assertEqual(mol["formula"], "H4[15N]")
        self.assertEqual(mol["charge"], 1)
        self.assertEqual(mol["isotopes"], [15])
        draft = {"atoms": [{"e": "C", "id": f"c{i}", "x": i, "y": 0} for i in range(6)], "bonds": [{"a": 0, "b": i, "order": 1} for i in range(1, 6)]}
        with self.assertRaises(ValueError):
            service.dispatch("parse", {"draft": draft})


class EnumerationTests(unittest.TestCase):
    def test_standard_counts_and_meso_deduplication(self):
        for smiles, count in (("CCO", 1), ("CC(O)C(=O)O", 2), ("CC=CC", 2), ("CC(O)C(O)C", 3)):
            with self.subTest(smiles=smiles):
                result = enumerated(smiles)
                self.assertEqual(result["count"], count)
                self.assertTrue(result["complete"])
                self.assertFalse(result["capped"])
                self.assertEqual(result["unsupported"], [])
                self.assertEqual(len({x["id"] for x in result["molecules"]}), count)
                self.assertEqual(len({x["connectivityId"] for x in result["molecules"]}), 1)
                self.assertEqual(len({tuple(x["atomIds"]) for x in result["molecules"]}), 1)

    def test_specified_and_partial_stereo_preserved(self):
        self.assertEqual(enumerated("C[C@H](O)C(=O)O")["count"], 1)
        partial = parsed("C[C@H](O)C(O)C")
        result = service.dispatch("enumerate", {"molecule": partial})
        self.assertEqual(result["count"], 2)
        fixed = next(x for x in partial["stereo"]["centers"] if x["specified"])
        for mol in result["molecules"]:
            center = next(x for x in mol["stereo"]["centers"] if x["atomId"] == fixed["atomId"])
            self.assertEqual(center["cip"], fixed["cip"])
            self.assertTrue(center["specified"])
        self.assertEqual(enumerated("C[C@H](O)C(=O)O", enumerateAll=True)["count"], 2)

    def test_ez_stereo_is_retained(self):
        self.assertEqual(enumerated("C/C=C/C")["count"], 1)
        states = enumerated("CC=CC")["molecules"]
        self.assertEqual({x["stereo"]["bonds"][0]["descriptor"] for x in states}, {"E", "Z"})
        self.assertEqual(service.dispatch("relationship", {"left": states[0], "right": states[1]})["relationship"], "diastereomers")

    def test_distinct_complete_cap_and_unsupported_states(self):
        result = enumerated("CC(F)C(Cl)C(Br)C(I)N", maxIsomers=2)
        self.assertEqual(result["count"], 2)
        self.assertTrue(result["capped"])
        self.assertFalse(result["complete"])
        unsupported = enumerated("[Pt@SP1](Cl)(Br)(I)F")
        self.assertFalse(unsupported["complete"])
        self.assertFalse(unsupported["capped"])
        self.assertTrue(unsupported["unsupported"])
        self.assertEqual(unsupported["molecules"], [])  # MOL cannot encode square-planar stereo.
        self.assertTrue(unsupported["warnings"])
        with self.assertRaisesRegex(ValueError, "faithfully preserve"):
            parsed("[Pt@SP1](Cl)(Br)(I)F")
        enhanced = parsed("C[C@H](F)[C@H](Cl)Br |&1:1,3|")
        restored = service.dispatch("parse", {"molecule": enhanced})["molecules"][0]
        self.assertEqual(enhanced["id"], restored["id"])
        with self.assertRaises(ValueError):
            enumerated("CCO", maxIsomers=65)

    def test_true_inversion_and_relationships(self):
        mol = parsed("C[C@H](O)C(=O)O")
        atom_id = mol["stereo"]["centers"][0]["atomId"]
        inverse = service.dispatch("parse", {"molecule": mol, "invertAtomId": atom_id})["molecules"][0]
        back = service.dispatch("enumerate", {"molecule": inverse, "invertAtomId": atom_id})["molecules"][0]
        self.assertNotEqual(mol["id"], inverse["id"])
        self.assertEqual(mol["id"], back["id"])
        self.assertEqual(mol["connectivityId"], inverse["connectivityId"])
        for a, b, expected in ((mol, inverse, "enantiomers"), (mol, back, "identical"), ("CCO", "COC", "different connectivity"), ("CC(O)C(=O)O", mol, "unspecified"), ("CCO", "OCC", "identical")):
            with self.subTest(expected=expected):
                self.assertEqual(service.dispatch("relationship", {"first": a, "second": b})["relationship"], expected)
        with self.assertRaises(ValueError):
            service.dispatch("parse", {"molecule": mol, "invertAtomId": mol["atomIds"][0]})

    def test_meso_mirror_is_identical(self):
        records = enumerated("CC(O)C(O)C")["molecules"]
        relationships = [service.dispatch("relationship", {"left": a, "right": b})["relationship"] for i, a in enumerate(records) for b in records[i + 1:]]
        self.assertEqual(relationships.count("enantiomers"), 1)
        self.assertEqual(relationships.count("diastereomers"), 2)


class ConformerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lactic = generated("C[C@H](O)C(=O)O", count=2)
        cls.butane = generated("CCCC")

    def test_mapped_hydrogens_finite_energies_and_stereo(self):
        result = self.lactic
        self.assertEqual(result["generated"], 2, result.get("failures"))
        self.assertEqual(result["failed"], 0)
        mol = result["molecule"]
        self.assertEqual(mol["id"], parsed("C[C@H](O)C(=O)O")["id"])
        for state in mol["conformers"]:
            n = len(mol["atoms"])
            self.assertEqual([a["e"] for a in state["atoms"][:n]], mol["atoms"])
            self.assertEqual([a["atomId"] for a in state["atoms"][:n]], mol["atomIds"])
            self.assertEqual(len({a["atomId"] for a in state["atoms"]}), len(state["atoms"]))
            self.assertTrue(all(a["e"] == "H" for a in state["atoms"][n:]))
            self.assertTrue(all(math.isfinite(a[k]) for a in state["atoms"] for k in ("x", "y", "z")))
            self.assertIn(state["method"], ("MMFF94", "UFF"))
            self.assertTrue(math.isfinite(state["energy"]))
            self.assertEqual(state["energyUnit"], "kcal/mol")
            self.assertTrue(state["stereoVerification"]["verified"])
            self.assertEqual(state["stereoVerification"]["centersChecked"], 1)
            self.assertGreaterEqual(state["relativeEnergy"], 0)
        self.assertEqual(min(s["relativeEnergy"] for s in mol["conformers"]), 0)
        self.assertNotEqual(mol["conformers"][0]["id"], mol["conformers"][1]["id"])

    def test_deterministic_seed(self):
        second = generated("CCCC")["molecule"]["conformers"][0]
        first = self.butane["molecule"]["conformers"][0]
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["atoms"], second["atoms"])

    def test_preserve_supplied_conformer_and_json_coordinates(self):
        original = self.lactic["molecule"]
        with patch.object(service.AllChem, "EmbedMolecule", side_effect=AssertionError("Must preserve supplied coordinates")):
            result = service.dispatch("conformers", {"molecule": original, "numConfs": 1, "preserveSupplied3D": True})
        self.assertEqual(result["molecule"]["conformers"][0]["atoms"], original["conformers"][0]["atoms"])
        exported = service.dispatch("export", {"molecule": original, "outputFormat": "json"})
        restored = service.dispatch("parse", {"text": exported["text"], "format": "json"})["molecules"][0]
        self.assertEqual(original["id"], restored["id"])
        self.assertEqual(original["conformers"][0]["id"], restored["conformers"][0]["id"])
        self.assertEqual(original["conformers"][0]["atoms"], restored["conformers"][0]["atoms"])
        molfile = service.dispatch("export", {"molecule": original, "outputFormat": "v3000"})
        parsed_mol = service.dispatch("parse", {"text": molfile["text"], "format": "mol"})["molecules"][0]
        preserved = service.dispatch("conformers", {"molecule": parsed_mol, "count": 1})
        self.assertEqual(preserved["molecule"]["conformers"][0]["source"], "supplied3D")

    def test_force_field_fallbacks_are_explicit(self):
        with patch.object(service.AllChem, "MMFFHasAllMoleculeParams", return_value=False):
            result = generated("CCO")
        state = result["molecule"]["conformers"][0]
        self.assertEqual(state["method"], "UFF")
        self.assertTrue(math.isfinite(state["energy"]))
        with patch.object(service.AllChem, "MMFFHasAllMoleculeParams", return_value=False), patch.object(service.AllChem, "UFFHasAllMoleculeParams", return_value=False):
            result = generated("CCO")
        state = result["molecule"]["conformers"][0]
        self.assertEqual(state["method"], "unoptimized")
        self.assertIsNone(state["energy"])
        self.assertIsNone(state["relativeEnergy"])
        self.assertFalse(state["converged"])
        self.assertTrue(result["warnings"])

    def test_specified_ez_and_actual_unparameterized_element(self):
        for smiles in ("C/C=C/C", "C/C=C\\\\C"):
            result = generated(smiles)
            self.assertEqual(result["generated"], 1, result["failures"])
            state = result["molecule"]["conformers"][0]
            self.assertEqual(state["stereoVerification"]["bondsChecked"], 1)
            self.assertTrue(state["stereoVerification"]["verified"])
        result = generated("[U]")
        self.assertEqual(result["generated"], 1, result["failures"])
        self.assertEqual(result["molecule"]["conformers"][0]["method"], "unoptimized")
        self.assertIsNone(result["molecule"]["conformers"][0]["energy"])

    def test_invert_imported_3d_discards_opposite_coordinates(self):
        original = self.lactic["molecule"]
        molfile = service.dispatch("export", {"molecule": original, "outputFormat": "v3000"})
        imported = service.dispatch("parse", {"text": molfile["text"], "format": "mol"})["molecules"][0]
        atom_id = imported["stereo"]["centers"][0]["atomId"]
        inverse = service.dispatch("parse", {"molecule": imported, "invertAtomId": atom_id})["molecules"][0]
        self.assertEqual(service.dispatch("relationship", {"first": original, "second": inverse})["relationship"], "enantiomers")
        self.assertEqual(inverse["conformers"], [])

    def test_disconnected_is_not_an_optimized_assembly(self):
        result = generated("CCO.O")
        self.assertEqual(result["generated"], 1, result["failures"])
        state = result["molecule"]["conformers"][0]
        self.assertEqual(state["method"], "unoptimized-disconnected")
        self.assertIsNone(state["energy"])
        self.assertFalse(state["converged"])
        self.assertTrue(result["warnings"])

    def test_failures_are_retained_not_counted_as_successes(self):
        with patch.object(service.AllChem, "EmbedMolecule", return_value=-1):
            result = generated("CCO", count=2)
        self.assertEqual(result["generated"], 0)
        self.assertEqual(result["failed"], 2)
        self.assertEqual(len(result["failures"]), 2)
        self.assertEqual(result["molecule"]["conformers"], [])
        self.assertTrue(result["warnings"])
        with self.assertRaises(ValueError):
            generated("CCO", count=51)
        with self.assertRaises(ValueError):
            generated("[Pt@SP1](Cl)(Br)(I)F")

    def test_3d_stereo_is_independently_verified(self):
        bad = copy.deepcopy(self.lactic["molecule"])
        for atom in bad["conformers"][0]["atoms"]:
            atom["x"] *= -1
        with self.assertRaisesRegex(ValueError, "stereochemistry mismatch"):
            service.dispatch("parse", {"molecule": bad})
        bad = copy.deepcopy(self.butane["molecule"])
        for atom in bad["conformers"][0]["atoms"]:
            atom["x"] = atom["y"] = atom["z"] = 0
        with self.assertRaisesRegex(ValueError, "Degenerate"):
            service.dispatch("projection", {"molecule": bad, "type": "newman"})

    def test_relative_energies_never_cross_methods(self):
        states = [{"energy": 100.0, "method": "MMFF94"}, {"energy": 105.0, "method": "MMFF94"}, {"energy": -50.0, "method": "UFF"}, {"energy": None, "method": "supplied"}]
        service._relative_energies(states)
        self.assertEqual([x["relativeEnergy"] for x in states], [0, 5, 0, None])

    def test_coordinate_exports_are_honest_and_stereopreserving(self):
        mol = self.lactic["molecule"]
        xyz = service.dispatch("export", {"molecule": mol, "outputFormat": "xyz"})
        self.assertIn("Coordinate-only", xyz["text"])
        self.assertEqual(int(xyz["text"].splitlines()[0]), len(mol["conformers"][0]["atoms"]))
        for fmt in ("v2000", "v3000", "sdf-v2000", "sdf-v3000"):
            exported = service.dispatch("export", {"molecule": mol, "outputFormat": fmt})
            restored = service.dispatch("parse", {"text": exported["text"], "format": "sdf" if fmt.startswith("sdf") else "mol"})["molecules"][0]
            self.assertEqual(mol["id"], restored["id"])
            self.assertEqual(restored["atomIds"][:len(mol["atomIds"])], mol["atomIds"])
        with self.assertRaisesRegex(ValueError, "coordinate|3D"):
            service.dispatch("export", {"molecule": parsed("CCO"), "outputFormat": "xyz"})
        sdf = service.dispatch("export", {"molecule": mol, "outputFormat": "sdf", "allConformers": True})
        self.assertEqual(sdf["text"].count("$$$$"), 2)

    def test_constrained_torsion_returns_new_state(self):
        original = self.butane["molecule"]
        old_atoms = copy.deepcopy(original["conformers"][0]["atoms"])
        result = service.dispatch("torsion", {"molecule": original, "atomIds": original["atomIds"][:4], "degrees": 62.0})["molecule"]
        self.assertEqual(result["id"], original["id"])
        self.assertEqual(len(result["conformers"]), 2)
        self.assertEqual(original["conformers"][0]["atoms"], old_atoms)
        new = result["conformers"][-1]
        self.assertNotEqual(new["id"], original["conformers"][0]["id"])
        self.assertEqual(new["source"], "constrained-torsion")
        self.assertLess(abs(new["torsion"]["angle"] - 62.0), 2)
        self.assertTrue(new["stereoVerification"]["verified"])
        with self.assertRaises(ValueError):
            service.dispatch("torsion", {"molecule": original, "atomIds": ["a1", "a2", "a3", "a99"], "angle": 20})
        ring = generated("C1CCCCC1")["molecule"]
        with self.assertRaisesRegex(ValueError, "rotatable"):
            service.dispatch("torsion", {"molecule": ring, "atomIds": ring["atomIds"][:4], "angle": 20})


class ProjectionTests(unittest.TestCase):
    def test_fischer_parity_and_inversion(self):
        mol = parsed("C[C@H](O)C(=O)O")
        original = service.dispatch("projection", {"molecule": mol, "type": "fischer", "mode": "local"})
        self.assertTrue(original["eligible"])
        self.assertIn("<svg", original["svg"])
        self.assertEqual({a["slot"] for a in original["arms"]}, {"top", "bottom", "left", "right"})
        # Reconstruct the actual Fischer convention independently in RDKit.
        full = service._with_hs(service._record_input(mol))
        center = original["center"]
        conf = Chem.Conformer(full.GetNumAtoms())
        conf.Set3D(True)
        positions = {"top": (0, 1, -1), "bottom": (0, -1, -1), "left": (-1, 0, 1), "right": (1, 0, 1)}
        for arm in original["arms"]:
            idx = next(a.GetIdx() for a in full.GetAtoms() if service._aid(a) == arm["atomId"])
            conf.SetAtomPosition(idx, Point3D(*positions[arm["slot"]]))
            self.assertEqual(arm["toward"], arm["slot"] in ("left", "right"))
        full.RemoveAllConformers()
        full.AddConformer(conf, assignId=True)
        expected = full.GetAtomWithIdx(center).GetChiralTag()
        Chem.RemoveStereochemistry(full)
        Chem.AssignAtomChiralTagsFromStructure(full, confId=0, replaceExistingTags=True)
        self.assertEqual(full.GetAtomWithIdx(center).GetChiralTag(), expected)
        inverted = service.dispatch("parse", {"molecule": mol, "invertAtomId": original["centerAtomId"]})["molecules"][0]
        inverse = service.dispatch("projection", {"molecule": inverted, "type": "fischer", "mode": "local"})
        first = {x["slot"]: x["atomId"] for x in original["arms"]}
        second = {x["slot"]: x["atomId"] for x in inverse["arms"]}
        self.assertEqual(first["top"], second["top"])
        self.assertEqual(first["bottom"], second["bottom"])
        self.assertEqual(first["left"], second["right"])
        self.assertNotEqual(original["cip"], inverse["cip"])

    def test_multicenter_fischer_and_ineligible_unspecified(self):
        result = service.dispatch("projection", {"text": "C[C@H](O)[C@@H](O)C", "type": "fischer"})
        self.assertTrue(result["eligible"])
        self.assertEqual(result["mode"], "chain")
        self.assertEqual(len(result["centers"]), 2)
        self.assertEqual(len(result["chainAtomIds"]), 4)
        for smiles in ("CC(O)C(=O)O", "c1ccccc1", "CC=CC"):
            self.assertFalse(service.dispatch("projection", {"text": smiles, "type": "fischer"})["eligible"])

    def test_newman_uses_selected_coordinates_and_measured_dihedral(self):
        mol = generated("CCCC")["molecule"]
        result = service.dispatch("projection", {"molecule": mol, "type": "newman", "bondId": "b-a2-a3", "dihedralAtomIds": ["a1", "a2", "a3", "a4"]})
        self.assertTrue(result["eligible"])
        self.assertEqual(len(result["frontGroups"]), 3)
        self.assertEqual(len(result["backGroups"]), 3)
        self.assertEqual(result["atomIds"], ["a1", "a2", "a3", "a4"])
        self.assertEqual(result["selectedBondId"], "b-a2-a3")
        full = service._state_mol(service._record_input(mol), mol["conformers"][0])
        actual = rdMolTransforms.GetDihedralDeg(full.GetConformer(), 0, 1, 2, 3)
        self.assertAlmostEqual(result["dihedral"], actual, places=8)
        self.assertAlmostEqual(result["measuredDihedral"], actual, places=8)
        coords = {a["atomId"]: [a["x"], a["y"], a["z"]] for a in mol["conformers"][0]["atoms"]}
        for group in result["frontGroups"] + result["backGroups"]:
            self.assertEqual(group["position"], coords[group["atomId"]])
            self.assertAlmostEqual(group["angle"], math.degrees(math.atan2(group["y"], group["x"])))
        moved = service.dispatch("torsion", {"molecule": mol, "atomIds": result["atomIds"], "angle": 55})["molecule"]
        changed = service.dispatch("projection", {"molecule": moved, "type": "newman", "bondId": "b-a2-a3", "dihedralAtomIds": result["atomIds"], "conformerId": moved["conformers"][-1]["id"]})
        self.assertLess(abs(changed["measuredDihedral"] - 55), 2)
        self.assertIn("<svg", changed["svg"])
        self.assertNotEqual(result["conformerId"], changed["conformerId"])
        with self.assertRaisesRegex(ValueError, "3D"):
            service.dispatch("projection", {"text": "CCCC", "type": "newman"})


if __name__ == "__main__":
    unittest.main()
