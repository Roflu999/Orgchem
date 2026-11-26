"""HTTP and process lifecycle integration tests; no external chemistry requests."""
import json
import time
import unittest
from unittest.mock import patch
from backend import opsin
from fastapi.testclient import TestClient
from backend.app import app, FONT_FILES


class APITests(unittest.TestCase):
    def setUp(self):
        self.context = TestClient(app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def job(self, operation, payload, expected_status='complete'):
        response = self.client.post('/api/v1/jobs', json={'operation':operation,'payload':payload})
        self.assertEqual(response.status_code,202,response.text)
        job = response.json()
        deadline = time.monotonic()+20
        while job['status'] in {'queued','running'} and time.monotonic()<deadline:
            time.sleep(.03)
            job = self.client.get('/api/v1/jobs/'+job['id']).json()
        self.assertEqual(job['status'],expected_status,job.get('error'))
        return job['result'] if expected_status == 'complete' else job['error']

    def test_same_origin_document_and_asset_allowlist(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code,200)
        self.assertIn('id="stereo-explorer"',response.text)
        self.assertIn('Content-Security-Policy',response.headers)
        for path in ['/chemistry-client.js','/molecule-record.js','/atom-inspection.js','/model-input.js','/model-stage.js','/model-desk.js','/benzene-view.js','/reaction-rules.js','/reaction-diagram.js','/reaction-addition.js','/reaction-aromatic.js','/reaction-substitution.js','/reaction-motifs.js','/reaction-library.js','/reaction-ui.js','/stereo.css','/workbench.css']:
            self.assertEqual(self.client.get(path).status_code,200)
        for asset in ('comparison-mirrors.js', 'model-comparisons.js', 'comparison-locales.js',
                      'comparison.css', 'workspace-file.js', 'reaction-sites.js', 'reaction-extension.js',
                      'reaction-guide.js', 'reaction-learning-ui.js', 'reaction-input.js', 'reaction-plates.js',
                      'plate-chemistry.js', 'plate-viewer.js', 'plate-viewer.css', 'reaction-plates.css',
                      'plate-history.js', 'plate-comparison.js', 'plate-comparison.css'):
            self.assertIn('"' + asset + '"', response.text)
            self.assertEqual(self.client.get('/' + asset).status_code, 200, asset)
        for path in ['/requirements.txt','/backend/chemistry_service.py','/.venv/pyvenv.cfg','/../README.md']:
            self.assertEqual(self.client.get(path).status_code,404)

    def test_localized_interface_assets_and_branding(self):
        for url in ('/','/orgchem-visualizer.html','/bond-atlas.html'):
            page=self.client.get(url)
            self.assertEqual(page.status_code,200)
            self.assertIn('<title>Orgchem Visualizer</title>',page.text)
            self.assertIn('id="language-select"',page.text)
            self.assertIn('id="main-content"',page.text)
        for name in ('atlas-i18n.js','atlas-locales.js','atlas-shell-locales.js','atlas-preferences.js','atlas-fonts.css','viewer-lifecycle.js'):
            self.assertEqual(self.client.get('/'+name).status_code,200,name)

    def test_only_manifest_language_fonts_are_public(self):
        self.assertTrue(FONT_FILES)
        response=self.client.get('/fonts/'+next(iter(FONT_FILES)))
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.content[:4],b'wOF2')
        self.assertIn('font/woff2',response.headers['content-type'])
        for name in ('manifest.json','arabic-OFL.txt','not-a-font.woff2','..%2F..%2Frequirements.txt'):
            self.assertEqual(self.client.get('/fonts/'+name).status_code,404,name)

    def test_health_and_capabilities(self):
        self.assertTrue(self.client.get('/api/v1/health').json()['chemistryAvailable'])
        data = self.client.get('/api/v1/capabilities').json()
        self.assertTrue(data['available'])
        self.assertIn('server',data['privacy'])
        self.assertEqual(data['limits']['stereoisomers'],64)
        self.assertIsInstance(data['opsinAvailable'], bool)
        self.assertEqual(data['limits']['nameChars'], opsin.MAX_NAME_CHARS)

    def test_opsin_smiles_passes_through_rdkit(self):
        with patch.object(opsin, 'resolve', return_value='C/C=C/[C@H](F)Cl') as resolve:
            record = self.job('parse', {'format': 'name', 'text': 'test compound'})['molecules'][0]
        resolve.assert_awaited_once()
        self.assertEqual((record['name'], record['nameSource']), ('test compound', 'OPSIN'))
        self.assertTrue(record['knownName'])
        expected = self.job('parse', {'format': 'smiles', 'text': 'C/C=C/[C@H](F)Cl'})['molecules'][0]
        self.assertEqual(record['stereoisomerId'], expected['stereoisomerId'])
        self.assertTrue(record['stereo']['centers'][0]['specified'])
        self.assertEqual(record['stereo']['bonds'][0]['descriptor'], 'E')

    def test_missing_opsin_does_not_disable_smiles(self):
        with patch.object(opsin, 'runtime', return_value=None):
            error = self.job('parse', {'format': 'name', 'text': 'ethanol'}, expected_status='failed')
            self.assertIn('unavailable', error)
            self.assertTrue(self.job('parse', {'format': 'smiles', 'text': 'CCO'})['molecules'])

    @unittest.skipUnless(opsin.runtime(), 'optional local OPSIN runtime not installed')
    def test_live_opsin_stereo(self):
        self.assertTrue(self.client.get('/api/v1/capabilities').json()['opsinAvailable'])
        for configuration in ('R', 'S'):
            record = self.job('parse', {'format': 'name', 'text': f'({configuration})-butan-2-ol'})['molecules'][0]
            self.assertEqual(record['stereo']['centers'][0]['cip'], configuration)
        for configuration in ('E', 'Z'):
            record = self.job('parse', {'format': 'name', 'text': f'({configuration})-but-2-ene'})['molecules'][0]
            self.assertEqual(record['stereo']['bonds'][0]['descriptor'], configuration)
        error = self.job('parse', {'format': 'name', 'text': 'not-a-compound-xyzzy'}, expected_status='failed')
        self.assertIn('OPSIN', error)
        self.assertNotIn('xyzzy', error)

    def test_live_stereo_conformer_and_export_job(self):
        result = self.job('enumerate',{'text':'CC(O)C(=O)O','format':'smiles'})
        self.assertEqual(result['count'],2)
        self.assertTrue(result['complete'])
        record = result['molecules'][0]
        generated = self.job('conformers',{'molecule':record,'numConfs':3,'seed':42})['molecule']
        self.assertTrue(generated['conformers'])
        self.assertEqual(record['stereoisomerId'],generated['stereoisomerId'])
        data = self.job('export',{'molecules':[generated],'outputFormat':'json'})
        parsed = self.job('parse',{'text':data['text'],'format':'json'})
        self.assertEqual(parsed['molecules'][0]['stereoisomerId'],record['stereoisomerId'])
        self.assertTrue(parsed['molecules'][0]['conformers'])

    def test_batch_smiles_export(self):
        result = self.job('enumerate',{'text':'CC=CC'})
        data = self.job('export',{'molecules':result['molecules'],'outputFormat':'smiles'})
        self.assertEqual(len(data['text'].strip().splitlines()),2)
        self.assertNotEqual(*data['text'].strip().splitlines())

    def test_invalid_and_oversized_requests(self):
        self.assertEqual(self.client.post('/api/v1/jobs',json={'operation':'shell','payload':{}}).status_code,422)
        self.assertEqual(self.client.post('/api/v1/jobs',content=b'x'*(1024*1024+1)).status_code,413)
        self.assertEqual(self.client.post('/api/v1/jobs',json={'operation':'parse','payload':{'text':'CCO'}},headers={'Origin':'https://unrelated.invalid'}).status_code,403)
        self.assertEqual(self.client.get('/api/v1/jobs/nonexistent').status_code,404)

    def test_cancellation_stops_process_and_releases_queue(self):
        response = self.client.post('/api/v1/jobs',json={'operation':'conformers','payload':{'text':'CCCCCCCCCCCCCCCC','numConfs':50}})
        key = response.json()['id']
        deadline = time.monotonic()+5
        while time.monotonic()<deadline:
            state=self.client.get('/api/v1/jobs/'+key).json()
            if state['status']=='running':break
            time.sleep(.01)
        cancelled=self.client.delete('/api/v1/jobs/'+key)
        self.assertEqual(cancelled.status_code,200)
        self.assertIn(cancelled.json()['status'],{'cancelled','complete'})
        for _ in range(100):
            if app.state.jobs.jobs[key].process is None:break
            time.sleep(.02)
        self.assertIsNone(app.state.jobs.jobs[key].process)
        self.assertEqual(self.job('parse',{'text':'[NH4+]'})['molecules'][0]['charge'],1)


if __name__=='__main__':
    unittest.main()
