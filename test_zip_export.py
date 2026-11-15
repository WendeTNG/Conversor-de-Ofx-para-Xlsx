import asyncio
import io
import sys
from zipfile import ZipFile, ZIP_DEFLATED
sys.path.insert(0, 'backend')
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook
from app.routers.conversions import export_zip, service
from app.services import conversion_service
conversion_service._bank_names = conversion_service.FALLBACK_BANK_NAMES.copy()

def upload(name, account='12345', amount='12.50'):
    raw = f'<OFX><BANKID>001\n<BRANCHID>123\n<ACCTID>{account}\n<BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT\n<DTPOSTED>20261115\n<TRNAMT>{amount}\n<FITID>1\n<MEMO>Teste\n</STMTTRN></BANKTRANLIST></OFX>'.encode()
    return UploadFile(filename=name, file=io.BytesIO(raw))

async def main():
    first = upload('extrato.ofx')
    expected = service.convert_to_xlsx(first.file.getvalue(), first.filename)[1]
    response = await export_zip([first, upload('outro.ofx', '98765', '20.00'), upload('extrato.ofx')])
    assert response.media_type == 'application/zip'
    assert 'Planilhas Compactadas.zip' in response.headers['content-disposition']
    with ZipFile(io.BytesIO(response.body)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)) == 3
        assert names[0] == expected
        assert names[2] == expected[:-5] + ' (2).xlsx'
        assert all(item.compress_type == ZIP_DEFLATED for item in archive.infolist())
        for name, amount in zip(names, [12.5, 20, 12.5]):
            workbook = load_workbook(io.BytesIO(archive.read(name)))
            assert workbook.active['C2'].value == amount
    single = await export_zip([upload('unico.ofx')])
    with ZipFile(io.BytesIO(single.body)) as archive:
        assert len(archive.namelist()) == 1
    for files, status in [([], 400), ([upload('invalido.txt')], 400), ([UploadFile(filename='vazio.ofx', file=io.BytesIO(b''))], 422)]:
        try:
            await export_zip(files)
        except HTTPException as error:
            assert error.status_code == status
        else:
            raise AssertionError('Invalid upload accepted')
    print('ZIP: multiple spreadsheets, XLSX contents, names, duplicate names, single file and errors passed.')

asyncio.run(main())
