from __future__ import annotations
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from html import unescape
from typing import Any
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

EXPIRATION = timedelta(minutes=60)
TAG_PATTERN = re.compile(r"<([A-Za-z0-9_]+)>([^<\r\n]*)", re.IGNORECASE)
TRANSACTION_PATTERN = re.compile(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>|</BANKTRANLIST>))", re.IGNORECASE | re.DOTALL)

class ConversionError(Exception): pass

class ConversionService:
    def __init__(self):
        self._items: dict[str, dict[str, Any]] = {}

    def create(self, raw: bytes, original_filename: str) -> dict[str, Any]:
        self._purge_expired()
        text = self._decode(raw)
        transactions = self._parse(text)
        if not transactions:
            raise ConversionError("Nenhuma transação foi encontrada no arquivo OFX.")
        normalized, warnings = self._normalize(transactions)
        conversion_id = str(uuid.uuid4())
        record = {"rows": normalized, "warnings": warnings, "expires_at": datetime.now(timezone.utc) + EXPIRATION, "filename": self._filename(original_filename), "xlsx": None}
        self._items[conversion_id] = record
        return self._public(conversion_id, record)

    def convert_to_xlsx(self, raw: bytes, original_filename: str) -> tuple[bytes, str]:
        """Converts in one request so it works on stateless serverless functions."""
        text = self._decode(raw)
        transactions = self._parse(text)
        if not transactions:
            raise ConversionError("No transaction was found in the OFX file.")
        rows, _ = self._normalize(transactions)
        return self._build_xlsx(rows), self._filename(original_filename)

    def get(self, conversion_id: str):
        self._purge_expired()
        record = self._items.get(conversion_id)
        return self._public(conversion_id, record) if record else None

    def export(self, conversion_id: str):
        record = self._require(conversion_id)
        if record["xlsx"] is None:
            record["xlsx"] = self._build_xlsx(record["rows"])
        return {"filename": record["filename"], "download_url": f"/api/v1/conversions/{conversion_id}/download", "expires_at": record["expires_at"].isoformat()}

    def download(self, conversion_id: str):
        record = self._require(conversion_id)
        if record["xlsx"] is None:
            record["xlsx"] = self._build_xlsx(record["rows"])
        return record["xlsx"], record["filename"]

    def _decode(self, raw: bytes) -> str:
        for encoding in ("utf-8-sig", "cp1252", "latin1", "iso-8859-1"):
            try: return raw.decode(encoding)
            except UnicodeDecodeError: continue
        raise ConversionError("Não foi possível identificar a codificação do arquivo OFX.")

    def _parse(self, text: str) -> list[dict[str, str]]:
        records = []
        for block in TRANSACTION_PATTERN.findall(text):
            values = {key.upper(): unescape(value.strip()) for key, value in TAG_PATTERN.findall(block)}
            if values: records.append(values)
        return records

    def _normalize(self, items: list[dict[str, str]]):
        rows, warnings = [], []
        invalid_dates = invalid_amounts = 0
        for item in items:
            date = self._date(item.get("DTPOSTED", ""))
            amount = self._amount(item.get("TRNAMT", ""))
            invalid_dates += date is None
            invalid_amounts += amount is None
            rows.append({"type": item.get("TRNTYPE", ""), "date": date, "amount": amount or Decimal("0"), "identifier": item.get("FITID", ""), "document": item.get("CHECKNUM", ""), "description": item.get("MEMO") or item.get("NAME") or item.get("PAYEE") or ""})
        if invalid_dates: warnings.append(f"{invalid_dates} lançamento(s) com data inválida.")
        if invalid_amounts: warnings.append(f"{invalid_amounts} lançamento(s) com valor inválido; foram exportados como R$ 0,00.")
        return rows, warnings

    def _date(self, value: str):
        try: return datetime.strptime(value[:8], "%Y%m%d").date()
        except ValueError: return None

    def _amount(self, value: str):
        try: return Decimal(value.replace(",", "."))
        except (InvalidOperation, AttributeError): return None

    def _public(self, conversion_id, record):
        rows = record["rows"]
        dates = [row["date"] for row in rows if row["date"]]
        credits = sum((row["amount"] for row in rows if row["amount"] > 0), Decimal("0"))
        debits = sum((row["amount"] for row in rows if row["amount"] < 0), Decimal("0"))
        return {"id": conversion_id, "status": "ready", "warnings": record["warnings"], "summary": {"transaction_count": len(rows), "period": f"{min(dates).strftime('%d/%m/%Y')} a {max(dates).strftime('%d/%m/%Y')}" if dates else None, "credits": self._money(credits), "debits": self._money(debits)}, "preview": [{"type": r["type"], "date": r["date"].strftime("%d/%m/%Y") if r["date"] else None, "amount": float(r["amount"]), "amount_formatted": self._money(r["amount"]), "identifier": r["identifier"], "description": r["description"]} for r in rows[:20]], "expires_at": record["expires_at"].isoformat()}

    def _build_xlsx(self, rows):
        book = Workbook(); sheet = book.active; sheet.title = "Transações"
        headers = ["Tipo", "Data", "Valor", "Identificador", "Documento", "Descrição"]
        sheet.append(headers)
        for row in rows: sheet.append([row["type"], row["date"], float(row["amount"]), row["identifier"], row["document"], row["description"]])
        for cell in sheet[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="167F62")
        for cell in sheet["B"][1:]: cell.number_format = "DD/MM/YYYY"
        for cell in sheet["C"][1:]: cell.number_format = 'R$ #,##0.00;[Red]-R$ #,##0.00'
        for column, width in {"A": 16, "B": 14, "C": 16, "D": 22, "E": 16, "F": 48}.items(): sheet.column_dimensions[column].width = width
        sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions
        output = io.BytesIO(); book.save(output); return output.getvalue()

    def _require(self, conversion_id):
        self._purge_expired(); record = self._items.get(conversion_id)
        if not record: raise KeyError(conversion_id)
        return record

    def _purge_expired(self):
        now = datetime.now(timezone.utc)
        for key in [key for key, value in self._items.items() if value["expires_at"] <= now]: del self._items[key]

    def _filename(self, original):
        base = re.sub(r"[^A-Za-z0-9._ -]", "_", original.rsplit(".", 1)[0]).strip(". ")
        return f"{base or 'extrato'}_convertido.xlsx"
    def _money(self, amount): return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
