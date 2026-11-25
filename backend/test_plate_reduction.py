"""Cyclic carbonyl plate checks use the mapped parent record, not a compound name."""
import unittest
from rdkit import Chem
from backend.chemistry_service import dispatch


def routes(s):
    record = dispatch('parse', {'text': s})['molecules'][0]
    return dispatch('plate-carbonyl', {'molecule': record})


class PlateReductionTests(unittest.TestCase):
    def test_ring_aromatic_and_stereo(self):
        for parent, expected in [('O=C1CCCCC1', 'OC1CCCCC1'), ('CC(=O)c1ccccc1', 'CC(O)c1ccccc1'),
                                 ('CC(=O)c1ccc([C@H](C)O)cc1', 'CC(O)c1ccc([C@H](C)O)cc1')]:
            with self.subTest(parent=parent):
                result = routes(parent)
                self.assertTrue(result['ok'])
                self.assertEqual([v['productSmiles'] for v in result['alternatives']], [Chem.MolToSmiles(Chem.MolFromSmiles(expected))])

    def test_equivalent_and_distinct_sites(self):
        equiv = routes('O=C1CCC(=O)CC1')['alternatives']
        self.assertEqual(len(equiv), 1)
        self.assertIn(' or ', equiv[0]['sites'])
        self.assertEqual(len(routes('CC(=O)c1ccc(C=O)cc1')['alternatives']), 2)

    def test_scope(self):
        for s in ['O=C1C=CCCC1', 'O=C1C(=O)CCCC1', 'CC(=O)Oc1ccccc1', 'O=C(O)c1ccccc1', 'C1CCCC1', 'CC=O', 'O=C1CCCCC1.O', '[13CH3]C(=O)c1ccccc1']:
            with self.subTest(parent=s):
                self.assertFalse(routes(s)['ok'])
