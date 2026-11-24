"""Install the checksum-pinned OPSIN SMILES CLI in this project's .venv."""
import hashlib
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

# Official Maven Central coordinates and SHA-256; native InChI output is not used.
ARTIFACTS = '''uk/ac/cam/ch/opsin/opsin-cli/2.10.0/opsin-cli-2.10.0.jar b4d885fc23b708b722e0563597b3774e5dab32187d5d35afa9a49fec71ce9b45
uk/ac/cam/ch/opsin/opsin-core/2.10.0/opsin-core-2.10.0.jar bdd5e328294dfab581ff1841813fc15a222fd5370d62419a70b1d69bd40bea7e
uk/ac/cam/ch/opsin/opsin-inchi/2.10.0/opsin-inchi-2.10.0.jar 2d54f7954c8859da4e75ac860e656ed1295cbdab03fb215fada06d62e24177d8
commons-cli/commons-cli/1.11.0/commons-cli-1.11.0.jar 8f7f8605d68e15bf32db61ec94eac6fdafc51b1bdbe1e0e0802b57d23f387792
commons-io/commons-io/2.22.0/commons-io-2.22.0.jar 2b9a7b1f726fb86216dbd2c8321eabe0221dbd5b1be81c18e1cb53811b104758
dk/brics/automaton/1.13-1/automaton-1.13-1.jar aab8810db206bf2e26f3760c705be82a031aebc1089ebb274b7c674d628fd90d
com/fasterxml/woodstox/woodstox-core/7.3.0/woodstox-core-7.3.0.jar 246cb4845991ab52196ef90ee8a361164512b5cc7ec0547c9fab8f3db75f2679
org/codehaus/woodstox/stax2-api/4.3.1/stax2-api-4.3.1.jar 1953d9d443149769c8418fd4fb69284ba2f98adbbed304e9a050c360e28541c6
org/apache/logging/log4j/log4j-api/2.25.5/log4j-api-2.25.5.jar 64777f73ea0b3104c04eb82befbdccc30a425a19e83ad06cb2f93aa303511863
org/apache/logging/log4j/log4j-core/2.25.5/log4j-core-2.25.5.jar 050c4f85deb48b055e9c041ac39043fbb79ce477841a11a1eb2969c86c6a0072'''.splitlines()


def install():
    venv = Path(__file__).resolve().parent / '.venv'
    target = venv / 'opsin'
    if not (venv / 'pyvenv.cfg').is_file() or target.exists():
        raise SystemExit('Create the project .venv first. An existing opsin installation will not be overwritten.')
    with tempfile.TemporaryDirectory(dir=venv) as temp:
        stage = Path(temp) / 'opsin'
        stage.mkdir()

        def fetch(row):
            artifact, digest = row.split()
            name = Path(artifact).name
            dest = stage / name[:-4] / name
            dest.parent.mkdir()
            with urlopen('https://repo.maven.apache.org/maven2/' + artifact, timeout=60) as response:
                data = response.read(16 * 1024 * 1024 + 1)
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Unexpected contents: ' + name)
            dest.write_bytes(data)
            return dest.relative_to(stage).as_posix()

        with ThreadPoolExecutor(max_workers=4) as pool:
            jars = list(pool.map(fetch, ARTIFACTS))
        # Maven publishes thin JARs. Supply a manifest-only entry point; dependency
        # JARs remain byte-for-byte identical to their verified upstream artifacts.
        classpath = 'Class-Path: ' + ' '.join(jars)
        manifest = ('Manifest-Version: 1.0\r\nMain-Class: uk.ac.cam.ch.wwmm.opsin.Cli\r\n'
                    + '\r\n '.join(classpath[i:i+68] for i in range(0, len(classpath), 68)) + '\r\n\r\n')
        with ZipFile(stage / 'opsin.jar', 'x') as launcher:
            launcher.writestr('META-INF/MANIFEST.MF', manifest)
        stage.rename(target)
    print('Installed OPSIN CLI 2.10.0 (SMILES) at', target)


if __name__ == '__main__':
    install()
