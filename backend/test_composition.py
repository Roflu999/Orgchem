"""Regression tests for composing mapped chemistry operations and native records."""
import copy
import hashlib
import json
import unittest

from backend.chemistry_service import dispatch


QUARTET = ["a1", "a2", "a3", "a4"]


def native_roundtrip(record):
    text = dispatch("export", {"molecule": record, "outputFormat": "json"})["text"]
    return dispatch("parse", {"text": text, "format": "json"})["molecules"][0]


def position_draft(record):
    coords = record["layouts"]["skeletal"]["atoms"]
    return {
        "atoms": [{"e": e, "id": record["atomIds"][i],
                   "charge": record["charges"][i], "isotope": record["isotopes"][i],
                   "x": -coords[i]["x"] + 3, "y": coords[i]["y"] * 1.2}
                  for i, e in enumerate(record["atoms"])],
        "bonds": [{"a": b["a"], "b": b["b"], "order": b["order"], "id": b["id"]}
                  for b in record["bonds"]],
    }


class CompositionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.butane = dispatch("conformers", {"text": "CCCC", "numConfs": 2, "seed": 42})["molecule"]
        cls.moved = dispatch("torsion", {
            "molecule": cls.butane, "conformerId": cls.butane["conformers"][-1]["id"],
            "atomIds": QUARTET, "degrees": 62,
        })["molecule"]
        cls.moved["selectedConformerId"] = cls.moved["conformers"][-1]["id"]
        charged = dispatch("conformers", {
            "text": "[13CH3][C@H](O)CC(=O)[O-]", "numConfs": 2, "seed": 42,
        })["molecule"]
        cls.charged_quartet = ["a1", "a2", "a4", "a5"]
        cls.charged = dispatch("torsion", {
            "molecule": charged, "conformerId": charged["conformers"][-1]["id"],
            "atomIds": cls.charged_quartet, "degrees": 62,
        })["molecule"]
        cls.charged["selectedConformerId"] = cls.charged["conformers"][-1]["id"]

    def test_selection_precedence_in_projection(self):
        states = self.moved["conformers"]
        cases = [({}, 2), ({"conformerIndex": 0}, 0),
                 ({"conformerId": None}, 2), ({"conformerId": None, "conformerIndex": 1}, 1),
                 ({"conformerId": states[1]["id"], "conformerIndex": 0}, 1)]
        for options, index in cases:
            with self.subTest(options=options):
                projected = dispatch("projection", {
                    "molecule": self.moved, "type": "newman", "bondId": "b-a2-a3",
                    "dihedralAtomIds": QUARTET, **options,
                })
                self.assertEqual(projected["conformerId"], states[index]["id"])
                if index == 2:
                    self.assertAlmostEqual(projected["dihedral"], states[index]["torsion"]["angle"])
        unselected = copy.deepcopy(self.moved)
        unselected.pop("selectedConformerId")
        projected = dispatch("projection", {"molecule": unselected, "type": "newman"})
        self.assertEqual(projected["conformerId"], states[0]["id"])

    def test_coordinate_exports_use_record_selection_and_explicit_overrides(self):
        for fmt in ("xyz", "mol", "sdf"):
            with self.subTest(fmt=fmt):
                common = {"molecule": self.moved, "outputFormat": fmt}
                implicit = dispatch("export", common)["text"]
                explicit = dispatch("export", {**common, "conformerId": self.moved["selectedConformerId"]})["text"]
                first = dispatch("export", {**common, "conformerIndex": 0})["text"]
                self.assertEqual(implicit, explicit)
                self.assertNotEqual(implicit, first)

    def test_json_export_uses_same_selection_precedence(self):
        states = self.moved["conformers"]
        for options, index in (({}, 2), ({"conformerIndex": 0}, 0),
                               ({"conformerId": states[1]["id"], "conformerIndex": 0}, 1)):
            with self.subTest(options=options):
                exported = dispatch("export", {"molecule": self.moved, "outputFormat": "json", **options})
                self.assertEqual(json.loads(exported["text"])["selectedConformerId"], states[index]["id"])
        with self.assertRaises(ValueError):
            dispatch("export", {"molecule": self.moved, "outputFormat": "json", "conformerId": "unknown"})

    def test_later_torsion_uses_selected_parent_and_keeps_earlier_provenance(self):
        later = dispatch("torsion", {"molecule": self.moved, "atomIds": QUARTET, "degrees": 110})["molecule"]
        self.assertEqual(later["conformers"][-1]["torsion"]["parentConformerId"], self.moved["selectedConformerId"])
        self.assertEqual(later["conformers"][-2]["torsion"], self.moved["conformers"][-1]["torsion"])
        self.assertEqual(later["selectedConformerId"], later["conformers"][-1]["id"])
        projected = dispatch("projection", {"molecule": later, "type": "newman", "bondId": "b-a2-a3", "dihedralAtomIds": QUARTET})
        self.assertEqual(projected["conformerId"], later["conformers"][-1]["id"])
        self.assertAlmostEqual(projected["dihedral"], later["conformers"][-1]["torsion"]["angle"])
        restored = native_roundtrip(later)
        self.assertEqual(restored["conformers"], later["conformers"])
        self.assertEqual(restored["selectedConformerId"], later["selectedConformerId"])

    def test_preserved_nonfirst_state_is_normalized_before_returning(self):
        original = copy.deepcopy(self.moved)
        selected = self.moved["conformers"][-1]
        for options in ({}, {"conformerId": selected["id"]}):
            with self.subTest(options=options):
                preserved = dispatch("conformers", {"molecule": self.moved, "numConfs": 1, **options})["molecule"]
                self.assertEqual(len(preserved["conformers"]), 1)
                state = preserved["conformers"][0]
                self.assertEqual(state["atoms"], selected["atoms"])
                self.assertEqual(preserved["selectedConformerId"], state["id"])
                self.assertEqual(state["torsion"]["angle"], selected["torsion"]["angle"])
                # The discarded parent is not retained as a dangling local reference.
                self.assertNotIn("parentConformerId", state["torsion"])
                reparsed = dispatch("parse", {"molecule": preserved})["molecules"][0]
                self.assertEqual(reparsed["conformers"], preserved["conformers"])
                self.assertEqual(native_roundtrip(preserved)["selectedConformerId"], state["id"])
                later = dispatch("torsion", {"molecule": preserved, "atomIds": QUARTET, "degrees": 110})["molecule"]
                self.assertEqual(later["conformers"][-1]["torsion"]["parentConformerId"], state["id"])
                self.assertEqual(native_roundtrip(later)["conformers"], later["conformers"])
        self.assertEqual(self.moved, original)

    def test_existing_v3_hash_scheme_and_ids_are_unchanged(self):
        reparsed = dispatch("parse", {"molecule": self.moved})["molecules"][0]
        for i, state in enumerate(self.moved["conformers"]):
            identity = self.moved["notation"] + json.dumps(
                [[a["atomId"], a["x"], a["y"], a["z"]] for a in state["atoms"]],
                separators=(",", ":"),
            ) + f"/{i}/{state['seed']}"
            expected = "conf-" + hashlib.sha256(identity.encode()).hexdigest()[:24]
            self.assertEqual(state["id"], expected)
            self.assertEqual(reparsed["conformers"][i]["id"], expected)
        changed = copy.deepcopy(self.moved)
        for atom in changed["conformers"][-1]["atoms"]:
            atom["x"] += 1
        with self.assertRaisesRegex(ValueError, "selected conformer ID"):
            dispatch("parse", {"molecule": changed})

    def test_charged_isotopic_torsion_json_draft_and_later_torsion_chain(self):
        restored = native_roundtrip(self.charged)
        edited = dispatch("parse", {"sourceRecord": restored, "draft": position_draft(restored)})["molecules"][0]
        for key in ("stereoisomerId", "charges", "charge", "isotopes", "stereo", "atomIds", "conformers", "selectedConformerId"):
            with self.subTest(key=key):
                self.assertEqual(edited[key], self.charged[key])
        later = dispatch("torsion", {"molecule": edited, "atomIds": self.charged_quartet, "degrees": -110})["molecule"]
        self.assertEqual(later["conformers"][-1]["torsion"]["parentConformerId"], edited["selectedConformerId"])
        final = native_roundtrip(later)
        self.assertEqual(final["conformers"], later["conformers"])
        self.assertEqual(final["isotopes"][0], 13)
        self.assertEqual(final["charge"], -1)
        self.assertEqual(final["stereo"], self.charged["stereo"])
        self.assertEqual(final["selectedConformerId"], final["conformers"][-1]["id"])

    def test_chemical_draft_after_torsion_discards_geometry_and_selection(self):
        draft = position_draft(self.charged)
        draft["atoms"][2]["charge"] = -1
        edited = dispatch("parse", {"sourceRecord": self.charged, "draft": draft})["molecules"][0]
        self.assertEqual(edited["charge"], -2)
        self.assertEqual(edited["isotopes"], self.charged["isotopes"])
        self.assertEqual(edited["atomIds"], self.charged["atomIds"])
        self.assertEqual(edited["conformers"], [])
        self.assertNotIn("selectedConformerId", edited)
        self.assertFalse(edited["stereo"]["centers"][0]["specified"])
        self.assertEqual(native_roundtrip(edited)["conformers"], [])

    def test_imported_torsion_metadata_is_validated_not_blindly_copied(self):
        bad_values = [
            ("atomIds", ["a1", "a2", "a3"]),
            ("atomIds", ["a1", "a2", "a3", "a99"]),
            ("atomIds", ["a1", "a2", "a2", "a4"]),
            ("atomIds", ["a1", "a3", "a2", "a4"]),
            ("atomIds", [0, 1, 2, 3]),
            ("requestedAngle", True), ("requestedAngle", float("nan")),
            ("requestedAngle", -20),
            ("angle", float("inf")), ("angle", False), ("angle", 10),
            ("parentConformerId", "conf-missing"), ("parentConformerId", None),
            ("parentConformerId", self.moved["conformers"][-1]["id"]),
        ]
        for key, value in bad_values:
            with self.subTest(key=key, value=value):
                bad = copy.deepcopy(self.moved)
                bad["conformers"][-1]["torsion"][key] = value
                with self.assertRaises(ValueError):
                    dispatch("parse", {"molecule": bad})
        for value in (None, [], "not torsion metadata"):
            with self.subTest(torsion=value):
                bad = copy.deepcopy(self.moved)
                bad["conformers"][-1]["torsion"] = value
                with self.assertRaises(ValueError):
                    dispatch("parse", {"molecule": bad})


if __name__ == "__main__":
    unittest.main()
