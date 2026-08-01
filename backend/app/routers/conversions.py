from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from app.services.conversion_service import ConversionService, ConversionError

router = APIRouter(tags=["Conversões"])
service = ConversionService()
MAX_FILE_SIZE = 5 * 1024 * 1024

@router.post("/conversions")
async def create_conversion(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".ofx"):
        raise HTTPException(400, "Envie um arquivo com extensão .ofx.")
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "O arquivo deve ter no máximo 5 MB.")
    try:
        return service.create(content, file.filename)
    except ConversionError as exc:
        raise HTTPException(422, str(exc)) from exc

@router.get("/conversions/{conversion_id}")
def get_conversion(conversion_id: str):
    result = service.get(conversion_id)
    if not result:
        raise HTTPException(404, "Conversão não encontrada ou expirada.")
    return result

@router.post("/conversions/{conversion_id}/export")
def export_conversion(conversion_id: str):
    try:
        return service.export(conversion_id)
    except KeyError:
        raise HTTPException(404, "Conversão não encontrada ou expirada.")

@router.get("/conversions/{conversion_id}/download")
def download_conversion(conversion_id: str):
    try:
        content, filename = service.download(conversion_id)
    except KeyError:
        raise HTTPException(404, "Arquivo não encontrado ou expirado.")
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
