"""Explicit, opt-in database naming. Never called during parse/enumeration."""
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from .chemistry_service import dispatch


def lookup(payload):
    if payload.get('consent') is not True:
        raise ValueError('Name lookup sends the selected isomeric SMILES to PubChem. Explicit consent is required.')
    record = dispatch('parse', {'molecule':payload.get('molecule')})['molecules'][0]
    request = Request(
        'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/IUPACName,IsomericSMILES/JSON',
        data=urlencode({'smiles':record['notation']}).encode(),
        headers={'User-Agent':'ChemistryVisualizationClient/1.0','Content-Type':'application/x-www-form-urlencoded'},
        method='POST',
    )
    try:
        with urlopen(request, timeout=8) as response:
            body = response.read(1_000_001)
        if len(body)>1_000_000:
            raise ValueError('The database response exceeded its size budget.')
        data = json.loads(body)
    except Exception as error:
        raise ValueError('PubChem name lookup is unavailable or found no record. The molecular formula and stereo identifiers are still available.') from error
    for item in data.get('PropertyTable',{}).get('Properties',[]):
        smiles=item.get('SMILES') or item.get('IsomericSMILES')
        if not smiles or not isinstance(item.get('IUPACName'),str):
            continue
        try:
            candidate=dispatch('parse',{'text':smiles,'format':'smiles'})['molecules'][0]
        except ValueError:
            continue
        if candidate['stereoisomerId']==record['stereoisomerId']:
            return {'name':item['IUPACName'][:500],'source':'PubChem','cid':item.get('CID'),'matched':True,'stereoisomerId':record['stereoisomerId']}
    raise ValueError('No database name with exactly matching charge, isotope and stereochemical identity was found. No approximate name was substituted.')
