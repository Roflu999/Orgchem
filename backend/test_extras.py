import json
import unittest
from unittest.mock import patch
from backend.chemistry_service import dispatch
from backend.names import lookup


class ExtrasTests(unittest.TestCase):
    def test_ionic_and_aromatic_lone_pairs(self):
        for smiles, expected in [('[OH-]',[3]),('[NH4+]',[0]),('[CH3-]',[1]),('[CH3+]',[0]),('O',[2])]:
            molecule=dispatch('parse',{'text':smiles})['molecules'][0]
            self.assertEqual(molecule['lonePairCounts'],expected)
        pyrrole=dispatch('parse',{'text':'c1cc[nH]c1'})['molecules'][0]
        self.assertEqual(pyrrole['lonePairCounts'][pyrrole['atoms'].index('N')],1)

    def test_mirror_id_supports_synchronous_stereo_sorting(self):
        result=dispatch('enumerate',{'text':'CC(O)C(=O)O'})['molecules']
        self.assertEqual(result[0]['mirrorStereoisomerId'],result[1]['stereoisomerId'])
        self.assertEqual(result[1]['mirrorStereoisomerId'],result[0]['stereoisomerId'])
        unknown=dispatch('parse',{'text':'CC(O)C(=O)O'})['molecules'][0]
        self.assertIsNone(unknown['mirrorStereoisomerId'])

    def test_unspecified_stereo_cannot_be_mixed_as_conformers(self):
        with self.assertRaisesRegex(ValueError,'stereoisomers'):
            dispatch('conformers',{'text':'CC(O)C(=O)O','numConfs':2})
        with self.assertRaisesRegex(ValueError,'stereoisomers'):
            dispatch('conformers',{'text':'CC=CC','numConfs':2})

    def test_selected_conformer_and_smiles_lists_roundtrip(self):
        records=dispatch('parse',{'text':'C/C=C/C\ttrans\nC/C=C\\C\tcis','format':'smiles'})['molecules']
        self.assertEqual(len(records),2)
        self.assertNotEqual(records[0]['stereoisomerId'],records[1]['stereoisomerId'])
        g=dispatch('conformers',{'text':'C[C@H](O)C(=O)O','numConfs':3,'seed':42})['molecule']
        g['selectedConformerId']=g['conformers'][-1]['id']
        exported=dispatch('export',{'molecule':g,'outputFormat':'json'})
        restored=dispatch('parse',{'text':exported['text'],'format':'json'})['molecules'][0]
        self.assertEqual(restored['selectedConformerId'],g['selectedConformerId'])

    def test_database_lookup_requires_consent_and_exact_stereo(self):
        molecule=dispatch('parse',{'text':'C[C@H](O)C(=O)O'})['molecules'][0]
        with patch('backend.names.urlopen') as external:
            with self.assertRaises(ValueError):lookup({'molecule':molecule})
            external.assert_not_called()
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return json.dumps({'PropertyTable':{'Properties':[{'IUPACName':'matched name','IsomericSMILES':molecule['notation'],'CID':1}]}}).encode()
        with patch('backend.names.urlopen',return_value=Response()):
            result=lookup({'molecule':molecule,'consent':True})
            self.assertTrue(result['matched'])
            self.assertEqual(result['stereoisomerId'],molecule['stereoisomerId'])
        class Wrong(Response):
            def read(self,*args):return json.dumps({'PropertyTable':{'Properties':[{'IUPACName':'wrong state','IsomericSMILES':'CC(O)C(=O)O','CID':2}]}}).encode()
        with patch('backend.names.urlopen',return_value=Wrong()):
            with self.assertRaises(ValueError):lookup({'molecule':molecule,'consent':True})


if __name__=='__main__':unittest.main()
