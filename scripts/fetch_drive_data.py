"""Pull the dashboard's source workbooks from the shared Google Drive folder.

Runs inside GitHub Actions before build_dashboard_data.py. Standard library only.

* Lists the Excel files placed DIRECTLY in the Drive folder that is shared as
  "Anyone with the link" (sub-folders are ignored, so an "Old" folder can be
  used as an archive). With a GDRIVE_API_KEY secret it uses the Drive API;
  without one it reads Google's public embedded folder view.
* Works out which file is which from the file NAME first and the file CONTENTS
  second, so a workbook can be renamed each month as long as its sheet/headers
  keep the same layout.
* Copies each workbook into data/ under the canonical name the build expects
  and writes data/drive-sync.json so the dashboard can show when it synced.
* Only Excel data comes from Drive. All site code lives in the GitHub repo.

If a required workbook cannot be found or downloaded the script exits non-zero,
the workflow stops, and the site keeps serving the last good snapshot.
"""
from __future__ import annotations

import hashlib
import http.client
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST = DATA_DIR / "drive-sync.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dashboard_data import NS, find_header, norm, read_first_sheet  # noqa: E402

DEFAULT_FOLDER_ID = "1mcEmZg6DV0xQzWImuNyZFPhfg4oc0YTB"
FOLDER_ID = (os.environ.get("DRIVE_FOLDER_ID") or DEFAULT_FOLDER_ID).strip()
API_KEY = (os.environ.get("GDRIVE_API_KEY") or "").strip()
MAX_DEPTH = 0  # 0 = only files directly inside the shared folder

# Overridable only so the script can be tested against a local mock server.
EMBED_BASE = os.environ.get("DRIVE_EMBED_BASE", "https://drive.google.com/embeddedfolderview")
DOWNLOAD_BASE = os.environ.get("DRIVE_DOWNLOAD_BASE", "https://drive.usercontent.google.com/download")
SHEETS_EXPORT_BASE = os.environ.get("DRIVE_SHEETS_BASE", "https://docs.google.com/spreadsheets/d")
API_BASE = os.environ.get("DRIVE_API_BASE", "https://www.googleapis.com/drive/v3")

FOLDER_MIME = "application/vnd.google-apps.folder"
GSHEET_MIME = "application/vnd.google-apps.spreadsheet"

ROLES = {
    "outletMaster": {"target": "zone-distribution.xlsx", "required": True, "label": "Outlet master / Zone Distribution"},
    "dayWiseTarget": {"target": "day-wise-target.xlsx", "required": True, "label": "Day-wise target"},
    "dayWiseSales": {"target": "day-wise-sales.xlsx", "required": True, "label": "Day-wise sales"},
    "lastMonth": {"target": "last-month.xlsx", "required": False, "label": "Last month (SPLY)"},
}
LAST_MONTH_SHEET_PREFIX = "sply-all"

GOOGLE_PAGE_MARKERS = (b"accounts.google.com/ServiceLogin", b"<title>Google Drive", b'id="uc-download-link"')


def log(message: str) -> None:
    print(message, flush=True)


def http_get(url: str, attempts: int = 4) -> tuple[bytes, dict[str, str]]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (outlet-network-dashboard sync)"})
            with urllib.request.urlopen(request, timeout=120) as response:
                headers = {k.lower(): v for k, v in response.headers.items()}
                headers["x-final-url"] = response.geturl()
                return response.read(), headers
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as err:
            last_error = err
            if isinstance(err, urllib.error.HTTPError) and err.code in (400, 401, 403, 404):
                break
            time.sleep(2 * attempt)
    raise RuntimeError(f"Download failed for {url.split('?')[0]}: {last_error}")


# ---------------------------------------------------------------- listing
def list_with_api(folder_id: str) -> list[dict]:
    items: list[dict] = []
    token = ""
    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
            "pageSize": "1000",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
            "key": API_KEY,
        }
        if token:
            params["pageToken"] = token
        body, _ = http_get(f"{API_BASE}/files?" + urllib.parse.urlencode(params))
        payload = json.loads(body)
        for f in payload.get("files", []):
            items.append({
                "id": f["id"], "name": f.get("name", ""), "mimeType": f.get("mimeType", ""),
                "modified": f.get("modifiedTime", ""),
            })
        token = payload.get("nextPageToken", "")
        if not token:
            return items


ENTRY_RE = re.compile(
    r'<div class="flip-entry" id="entry-(?P<id>[^"]+)".*?<a href="(?P<href>[^"]+)".*?'
    r'<div class="flip-entry-title">(?P<title>.*?)</div>'
    r'(?:.*?<div class="flip-entry-last-modified"><div>(?P<modified>.*?)</div>)?',
    re.S,
)


def list_public(folder_id: str) -> list[dict]:
    body, _ = http_get(f"{EMBED_BASE}?id={urllib.parse.quote(folder_id)}")
    page = body.decode("utf-8", "replace")
    if "flip-entries" not in page:
        raise RuntimeError(
            f"Drive folder {folder_id} is not publicly listable. Share it as 'Anyone with the link – Viewer' "
            "or add a GDRIVE_API_KEY repository secret."
        )
    # Split on entry boundaries so a missing "last modified" cell never leaks into the next entry.
    items = []
    for chunk in page.split('<div class="flip-entry" ')[1:]:
        match = ENTRY_RE.search('<div class="flip-entry" ' + chunk)
        if not match:
            continue
        href = html.unescape(match.group("href"))
        if "/drive/folders/" in href:
            mime = FOLDER_MIME
        elif "docs.google.com/spreadsheets" in href:
            mime = GSHEET_MIME
        else:
            mime = ""
        items.append({
            "id": match.group("id"),
            "name": html.unescape(re.sub(r"<[^>]+>", "", match.group("title"))).strip(),
            "mimeType": mime,
            "modified": html.unescape(match.group("modified") or "").strip(),
        })
    return items


def walk(folder_id: str, path: str = "", depth: int = 0) -> list[dict]:
    items = list_with_api(folder_id) if API_KEY else list_public(folder_id)
    found: list[dict] = []
    for item in items:
        item["path"] = f"{path}{item['name']}"
        if item["mimeType"] == FOLDER_MIME:
            if depth < MAX_DEPTH:
                found.extend(walk(item["id"], item["path"] + "/", depth + 1))
        else:
            found.append(item)
    return found


def is_spreadsheet(item: dict) -> bool:
    name = item["name"].lower()
    if name.startswith("~$"):
        return False
    return item["mimeType"] == GSHEET_MIME or name.endswith((".xlsx", ".xlsm"))


def modified_sort_key(item: dict) -> float:
    """Best-effort timestamp; API gives ISO, the public view gives 'Sep 6' or '10:45 AM'."""
    text = item.get("modified", "")
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        pass
    now = datetime.now(timezone.utc)
    for fmt in ("%b %d, %Y", "%d %b %Y", "%m/%d/%y", "%b %d", "%d %b"):
        try:
            parsed = datetime.strptime(text, fmt)
            if "%Y" not in fmt and "%y" not in fmt:
                parsed = parsed.replace(year=now.year)
                if parsed.replace(tzinfo=timezone.utc) > now:
                    parsed = parsed.replace(year=now.year - 1)
            return parsed.replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    if re.search(r"\d{1,2}:\d{2}", text):  # time only = modified today
        return now.timestamp()
    return 0.0


def fetch_bytes(item: dict) -> bytes:
    file_id = urllib.parse.quote(item["id"], safe="")
    if item["mimeType"] == GSHEET_MIME:
        url = f"{SHEETS_EXPORT_BASE}/{file_id}/export?format=xlsx"
    elif API_KEY:
        url = f"{API_BASE}/files/{file_id}?alt=media&supportsAllDrives=true&key={API_KEY}"
    else:
        url = f"{DOWNLOAD_BASE}?id={file_id}&export=download&confirm=t"
    body, headers = http_get(url)
    if "accounts.google.com" in headers.get("x-final-url", "") or any(m in body[:20000] for m in GOOGLE_PAGE_MARKERS):
        raise RuntimeError(
            f"'{item['path']}' returned a Google sign-in/warning page instead of the file. "
            "Check that it is shared as 'Anyone with the link'."
        )
    return body


def download(item: dict, dest: Path) -> None:
    body = fetch_bytes(item)
    if not body.startswith(b"PK"):
        raise RuntimeError(f"'{item['path']}' did not download as an Excel file.")
    dest.write_bytes(body)


# ---------------------------------------------------------- classification
def name_hint(name: str) -> str:
    n = norm(Path(name).stem).replace("-", " ")
    if "sply" in n or "last month" in n or "lastmonth" in n or "previous month" in n:
        return "lastMonth"
    if "zone" in n or "distribution" in n or "outlet master" in n:
        return "outletMaster"
    if "target" in n:
        return "dayWiseTarget"
    if "sales" in n or "pos" in n or "nsi" in n:
        return "dayWiseSales"
    return ""


def sheet_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = workbook.find("m:sheets", NS)
    return [s.attrib.get("name", "") for s in (sheets if sheets is not None else [])]


def content_role(path: Path) -> str:
    """Identify a workbook from its layout, using the same header rules as the build."""
    if any(norm(name).startswith(LAST_MONTH_SHEET_PREFIX) for name in sheet_names(path)):
        return "lastMonth"
    try:
        _, rows = read_first_sheet(path)
    except Exception:  # noqa: BLE001 - unreadable workbook is simply "unknown"
        return ""
    code = {"code", "outlet code", "store code"}
    try:
        _, cols = find_header(rows, {"code", "date", "sales"}, {
            "code": code,
            "date": {"date", "sales date", "business date", "transaction date", "pos date"},
            "sales": {"pos nsi", "daily sales", "actual sales", "net sales", "sales"},
        })
        return "dayWiseSales"
    except ValueError:
        pass
    try:
        header_row, cols = find_header(rows, {"code", "name"}, {"code": code, "name": {"outlet name", "store name"}})
    except ValueError:
        return ""
    header = [norm(v) for v in rows[header_row]]
    if {"leader", "zonal", "regional head hr name", "format", "launching date"} & set(header):
        return "outletMaster"
    date_like = 0
    for value in rows[header_row]:
        if isinstance(value, (int, float)) and 40000 < float(value) < 80000:
            date_like += 1
        elif re.match(r"^\d{4}-\d{2}-\d{2}", str(value or "")):
            date_like += 1
    return "dayWiseTarget" if date_like >= 5 else ""


def main() -> int:
    log(f"Listing Google Drive folder {FOLDER_ID} ({'Drive API' if API_KEY else 'public link'})…")
    files = [f for f in walk(FOLDER_ID) if is_spreadsheet(f)]
    if not files:
        log("::error::No Excel workbooks found directly inside the Drive folder.")
        return 1

    candidates: dict[str, list[dict]] = {role: [] for role in ROLES}
    with tempfile.TemporaryDirectory() as tmp:
        for i, item in enumerate(files):
            local = Path(tmp) / f"{i}.xlsx"
            try:
                download(item, local)
            except RuntimeError as err:
                log(f"::warning::{err}")
                continue
            role = content_role(local)
            hint = name_hint(item["name"])
            if not role:
                log(f"  skip  {item['path']}  (layout not recognised{', name suggests ' + hint if hint else ''})")
                continue
            if hint and hint != role:
                log(f"::warning::{item['path']} is named like {hint} but its layout is {role}; using the layout.")
            item.update(local=local, role=role, bytes=local.stat().st_size,
                        sha256=hashlib.sha256(local.read_bytes()).hexdigest())
            candidates[role].append(item)
            log(f"  found {item['path']}  →  {role}")

        chosen: dict[str, dict] = {}
        for role, spec in ROLES.items():
            options = candidates[role]
            if not options:
                if spec["required"]:
                    log(f"::error::No {spec['label']} workbook found in the Drive folder.")
                    return 1
                log(f"  (no {spec['label']} workbook – last-month figures will show as —)")
                continue
            # Prefer the canonical filename, then the most recently modified file.
            options.sort(key=lambda f: (f["name"].lower() == spec["target"], modified_sort_key(f)), reverse=True)
            if len(options) > 1:
                log(f"::warning::{len(options)} {spec['label']} workbooks found; using {options[0]['path']}. "
                    f"Others: {', '.join(o['path'] for o in options[1:])}")
            chosen[role] = options[0]

        DATA_DIR.mkdir(exist_ok=True)
        for role, spec in ROLES.items():
            target = DATA_DIR / spec["target"]
            if role in chosen:
                target.write_bytes(chosen[role]["local"].read_bytes())
            elif target.exists():
                target.unlink()  # an optional file removed from Drive must not linger from the repo

    manifest = {
        "folderId": FOLDER_ID,
        "folderUrl": f"https://drive.google.com/drive/folders/{FOLDER_ID}",
        "method": "drive-api" if API_KEY else "public-link",
        "syncedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "files": {
            role: {
                "driveName": f["path"], "driveId": f["id"], "driveModified": f.get("modified", ""),
                "savedAs": f"data/{ROLES[role]['target']}", "bytes": f["bytes"], "sha256": f["sha256"],
            }
            for role, f in chosen.items()
        },
    }
    previous = {}
    if MANIFEST.exists():
        try:
            previous = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except ValueError:
            previous = {}
    def fingerprint(files: dict) -> dict:
        return {role: (info.get("driveName"), info.get("sha256")) for role, info in (files or {}).items()}

    if fingerprint(previous.get("files")) == fingerprint(manifest["files"]):
        # Nothing changed: keep the manifest byte-identical so no commit or redeploy happens.
        manifest = previous
        log("Drive files unchanged since the last sync.")
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Synced {len(chosen)} workbook(s) from Drive into data/.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
